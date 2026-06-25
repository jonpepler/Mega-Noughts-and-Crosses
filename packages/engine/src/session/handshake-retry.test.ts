/**
 * Regression test for the cross-device connection bug.
 *
 * The peer-discovery handshake fires the instant trystero reports a peer
 * joined, but the WebRTC data channel is often not open yet, so the initial
 * messages (the client's `hello`, or the host's `assign-role`/`state` reply)
 * are silently DROPPED and never retried. Both peers then hang. Same-machine
 * two-tab tests never hit this because loopback WebRTC opens instantly.
 *
 * This test simulates that race with a "lossy" transport wrapper that drops
 * the first N messages a peer sends, then asserts the session STILL converges:
 * the client gets its role + the host's state, and the host shows both players
 * connected, WITHOUT any move being made. It must FAIL before the self-healing
 * retry fix (initial messages lost -> never syncs) and PASS after it.
 */

// @vitest-environment node
import { expect, test } from "vitest";
import type { GameDefinition, GameResult, MoveValidation } from "../game";
import { makeMemoryFactory } from "../transport/memory";
import type {
  PeerId,
  Transport,
  TransportFactory,
  TransportMessage,
} from "../transport/transport";
import { joinClient, startHost } from "./index";

/** Resolve after a macrotask so deferred join notifications have fired. */
function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/** Resolve after `ms` of real time so the retry interval can fire. */
function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface TestState {
  players: string[];
  turn: number;
  claimed: Record<number, string>;
}
interface TestMove {
  cell: number;
}

const testDef: GameDefinition<TestState, TestMove> = {
  setup(players): TestState {
    return { players: [...players], turn: 0, claimed: {} };
  },
  currentPlayer(state): string {
    return state.players[state.turn % state.players.length] as string;
  },
  validateMove(state, move): MoveValidation {
    if (state.claimed[move.cell] !== undefined) {
      return { ok: false, reason: "already claimed" };
    }
    return { ok: true };
  },
  applyMove(state, move, by): TestState {
    return {
      players: state.players,
      turn: state.turn + 1,
      claimed: { ...state.claimed, [move.cell]: by },
    };
  },
  getResult(): GameResult<string> {
    return { status: "ongoing" };
  },
};

/**
 * Wrap a transport so its FIRST `dropCount` outgoing `send` calls are silently
 * discarded, mimicking a WebRTC data channel that is not open yet. Everything
 * else (listeners, leave, selfId) passes straight through.
 */
function makeLossy(inner: Transport, dropCount: number): Transport {
  let dropped = 0;
  return {
    selfId: inner.selfId,
    onPeerJoin: (cb: (id: PeerId) => void) => inner.onPeerJoin(cb),
    onPeerLeave: (cb: (id: PeerId) => void) => inner.onPeerLeave(cb),
    onMessage: (cb: (msg: TransportMessage) => void) => inner.onMessage(cb),
    send(type: string, payload: unknown, to?: PeerId): void {
      if (dropped < dropCount) {
        dropped += 1;
        return; // channel "not open yet": drop this send
      }
      inner.send(type, payload, to);
    },
    leave: () => inner.leave(),
  };
}

async function joinLossy(
  f: TransportFactory,
  room: string,
  dropCount: number,
): Promise<Transport> {
  return makeLossy(await f.join(room), dropCount);
}

const RETRY_MS = 20;

test("session self-heals when the client's first hello is dropped", async () => {
  const f = makeMemoryFactory();
  const ht = await f.join("r");
  // Drop the client's first 2 sends (its initial hello, and the first retry).
  const ct = await joinLossy(f, "r", 2);
  const host = startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });
  const client = joinClient<TestState, TestMove>(ct, { helloRetryMs: RETRY_MS });
  await tick();

  // The dropped hello means nothing has synced yet.
  expect(client.myRole).toBeNull();
  expect(client.state).toBeNull();

  // Give the retry interval time to punch a hello through and round-trip.
  await wait(RETRY_MS * 6);

  expect(client.myRole).toBe("p1");
  expect(client.state).not.toBeNull();
  expect(client.connectedPlayers).toEqual(["p0", "p1"]);
  expect(host.connectedPlayers).toEqual(["p0", "p1"]);

  // No move was ever made: state is still pristine, and the roster did not grow.
  expect(client.state?.claimed).toEqual({});
  expect(host.players).toEqual(["p0", "p1"]);

  client.leave();
  host.leave();
});

test("session self-heals when the host's first reply is dropped", async () => {
  const f = makeMemoryFactory();
  // Drop the host's first 3 sends: the assign-role + state unicasts of the
  // first hello AND the presence re-broadcast it triggers, so the client's
  // first round-trip is fully lost.
  const ht = await joinLossy(f, "r", 3);
  const ct = await f.join("r");
  const host = startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });
  const client = joinClient<TestState, TestMove>(ct, { helloRetryMs: RETRY_MS });
  await tick();

  // The host's first reply was dropped, so the client has nothing.
  expect(client.myRole).toBeNull();
  expect(client.state).toBeNull();

  await wait(RETRY_MS * 6);

  // A later hello got a full round-trip through.
  expect(client.myRole).toBe("p1");
  expect(client.state).not.toBeNull();
  expect(host.connectedPlayers).toEqual(["p0", "p1"]);

  client.leave();
  host.leave();
});

test("repeated hellos do not double-count connectedPlayers or grow the roster", async () => {
  const f = makeMemoryFactory();
  const ht = await f.join("r");
  const ct = await f.join("r");
  const host = startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });
  const client = joinClient<TestState, TestMove>(ct, { helloRetryMs: RETRY_MS });
  await tick();

  // Normal (non-lossy) connect: syncs immediately on the first hello.
  expect(client.myRole).toBe("p1");

  // Let several retry intervals elapse. If the retry had not stopped on sync,
  // these extra hellos would still be idempotent on the host.
  await wait(RETRY_MS * 5);

  expect(host.connectedPlayers).toEqual(["p0", "p1"]);
  expect(host.players).toEqual(["p0", "p1"]);
  expect(client.myRole).toBe("p1");

  client.leave();
  host.leave();
});

test("the retry interval stops on success and on leave (no post-leave sends)", async () => {
  const f = makeMemoryFactory();
  const ht = await f.join("r");
  const inner = await f.join("r");
  let sends = 0;
  const counting: Transport = {
    selfId: inner.selfId,
    onPeerJoin: (cb) => inner.onPeerJoin(cb),
    onPeerLeave: (cb) => inner.onPeerLeave(cb),
    onMessage: (cb) => inner.onMessage(cb),
    send(type, payload, to) {
      sends += 1;
      inner.send(type, payload, to);
    },
    leave: () => inner.leave(),
  };
  startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });
  const client = joinClient<TestState, TestMove>(counting, {
    helloRetryMs: RETRY_MS,
  });
  await tick();
  await wait(RETRY_MS * 3);

  // Synced -> the retry interval should have stopped; sends settle.
  expect(client.myRole).toBe("p1");
  const sendsAfterSync = sends;

  client.leave();
  await wait(RETRY_MS * 4);
  // No further sends after leave (interval cleared).
  expect(sends).toBe(sendsAfterSync);
});
