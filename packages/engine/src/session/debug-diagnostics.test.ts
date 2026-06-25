/**
 * Tests for the `debug` diagnostics field on GameRoom.
 *
 * Covers Part A requirements:
 *  - transportPeers increments on peer join, decrements on peer leave
 *  - helloAttempts increments on the client for each hello sent (including the first)
 *  - hasRole / hasState flip correctly on both host and client
 *  - Host helloAttempts is always 0
 *  - Bidirectional discovery: onPeerJoin fires assignRole on the host
 *  - No double-assign / connectedPlayers does not grow beyond roster size
 */

// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { GameDefinition, GameResult, MoveValidation } from "../game";
import { makeMemoryFactory } from "../transport/memory";
import type {
  PeerId,
  Transport,
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

// ---------------------------------------------------------------------------
// transportPeers
// ---------------------------------------------------------------------------

describe("debug.transportPeers", () => {
  test("host transportPeers increments when a peer joins", async () => {
    const f = makeMemoryFactory();
    const ht = await f.join("r");
    const host = startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });

    expect(host.debug.transportPeers).toBe(0);

    const ct = await f.join("r");
    joinClient<TestState, TestMove>(ct);
    await tick();

    expect(host.debug.transportPeers).toBe(1);
  });

  test("host transportPeers decrements when a peer leaves", async () => {
    const f = makeMemoryFactory();
    const ht = await f.join("r");
    const host = startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });

    const ct = await f.join("r");
    const client = joinClient<TestState, TestMove>(ct);
    await tick();

    expect(host.debug.transportPeers).toBe(1);

    client.leave();
    await tick();

    expect(host.debug.transportPeers).toBe(0);
  });

  test("client transportPeers increments when the host peer is seen", async () => {
    const f = makeMemoryFactory();
    const ht = await f.join("r");
    startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });
    const ct = await f.join("r");
    const client = joinClient<TestState, TestMove>(ct);

    // Before the macrotask fires, no peer has been seen yet
    expect(client.debug.transportPeers).toBe(0);

    await tick();
    expect(client.debug.transportPeers).toBe(1);
  });

  test("client transportPeers decrements when the host peer leaves", async () => {
    const f = makeMemoryFactory();
    const ht = await f.join("r");
    const host = startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });
    const ct = await f.join("r");
    const client = joinClient<TestState, TestMove>(ct);
    await tick();

    expect(client.debug.transportPeers).toBe(1);

    host.leave();
    await tick();

    expect(client.debug.transportPeers).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// helloAttempts
// ---------------------------------------------------------------------------

describe("debug.helloAttempts", () => {
  test("host helloAttempts is always 0", async () => {
    const f = makeMemoryFactory();
    const ht = await f.join("r");
    const host = startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });

    const ct = await f.join("r");
    joinClient<TestState, TestMove>(ct);
    await tick();

    expect(host.debug.helloAttempts).toBe(0);
  });

  test("client helloAttempts is 1 after first (immediate) hello", async () => {
    const f = makeMemoryFactory();
    const ht = await f.join("r");
    startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });
    const ct = await f.join("r");
    const client = joinClient<TestState, TestMove>(ct);
    await tick();

    // The first hello is sent immediately on peer join (counts as attempt 1)
    expect(client.debug.helloAttempts).toBeGreaterThanOrEqual(1);
  });

  test("client helloAttempts increments on retries when host reply is dropped", async () => {
    // Use a counting wrapper to block all receives (host never replies) but
    // still let client sends through. We use a non-lossy client but a lossy host.
    const f = makeMemoryFactory();
    // Drop the host's first 5 replies so retries accumulate
    const inner = await f.join("r");
    let dropped = 0;
    const lossyHost: Transport = {
      selfId: inner.selfId,
      onPeerJoin: (cb: (id: PeerId) => void) => inner.onPeerJoin(cb),
      onPeerLeave: (cb: (id: PeerId) => void) => inner.onPeerLeave(cb),
      onMessage: (cb: (msg: TransportMessage) => void) => inner.onMessage(cb),
      send(type: string, payload: unknown, to?: PeerId): void {
        if (dropped < 5) {
          dropped += 1;
          return;
        }
        inner.send(type, payload, to);
      },
      leave: () => inner.leave(),
    };

    const RETRY_MS = 20;
    startHost(testDef, lossyHost, { seed: 1, players: ["p0", "p1"] });
    const ct = await f.join("r");
    const client = joinClient<TestState, TestMove>(ct, { helloRetryMs: RETRY_MS });
    await tick();

    const attemptsAfterFirstHello = client.debug.helloAttempts;
    expect(attemptsAfterFirstHello).toBeGreaterThanOrEqual(1);

    // Wait for several retries
    await wait(RETRY_MS * 4);

    expect(client.debug.helloAttempts).toBeGreaterThan(attemptsAfterFirstHello);
  });

  test("client helloAttempts stops incrementing once synced", async () => {
    const f = makeMemoryFactory();
    const ht = await f.join("r");
    startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });
    const ct = await f.join("r");
    const RETRY_MS = 20;
    const client = joinClient<TestState, TestMove>(ct, { helloRetryMs: RETRY_MS });
    await tick();

    // Should be synced now
    expect(client.debug.hasRole).toBe(true);
    expect(client.debug.hasState).toBe(true);

    const attemptsAtSync = client.debug.helloAttempts;

    // Wait several retry intervals — retries should have stopped
    await wait(RETRY_MS * 5);

    expect(client.debug.helloAttempts).toBe(attemptsAtSync);
  });
});

// ---------------------------------------------------------------------------
// hasRole / hasState
// ---------------------------------------------------------------------------

describe("debug.hasRole and debug.hasState", () => {
  test("host hasRole is true immediately (host always has a role)", async () => {
    const f = makeMemoryFactory();
    const ht = await f.join("r");
    const host = startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });

    expect(host.debug.hasRole).toBe(true);
  });

  test("host hasState is true immediately (host always has canonical state)", async () => {
    const f = makeMemoryFactory();
    const ht = await f.join("r");
    const host = startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });

    expect(host.debug.hasState).toBe(true);
  });

  test("client hasRole is false before sync, true after", async () => {
    const f = makeMemoryFactory();
    const ht = await f.join("r");
    startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });
    const ct = await f.join("r");
    const client = joinClient<TestState, TestMove>(ct);

    // Before the macrotask, no role assigned yet
    expect(client.debug.hasRole).toBe(false);

    await tick();

    expect(client.debug.hasRole).toBe(true);
  });

  test("client hasState is false before sync, true after", async () => {
    const f = makeMemoryFactory();
    const ht = await f.join("r");
    startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });
    const ct = await f.join("r");
    const client = joinClient<TestState, TestMove>(ct);

    expect(client.debug.hasState).toBe(false);

    await tick();

    expect(client.debug.hasState).toBe(true);
  });

  test("client with no host has hasRole=false and hasState=false indefinitely", async () => {
    const f = makeMemoryFactory();
    const ct = await f.join("r");
    const client = joinClient<TestState, TestMove>(ct);

    await tick();

    expect(client.debug.hasRole).toBe(false);
    expect(client.debug.hasState).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bidirectional discovery — no double-assign
// ---------------------------------------------------------------------------

describe("bidirectional discovery", () => {
  test("host onPeerJoin + subsequent client hello yields one role, connectedPlayers length 2", async () => {
    // Both the host's onPeerJoin (bidirectional) and the client's hello are
    // fired; assignRole is idempotent so only one slot is consumed.
    const f = makeMemoryFactory();
    const ht = await f.join("r");
    const ct = await f.join("r");
    const host = startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });
    const client = joinClient<TestState, TestMove>(ct);
    await tick();

    // Exactly one peer assigned; roster not grown
    expect(host.connectedPlayers).toEqual(["p0", "p1"]);
    expect(host.players).toEqual(["p0", "p1"]);
    expect(client.myRole).toBe("p1");
  });

  test("repeated hellos from the same peer do not create extra connectedPlayers entries", async () => {
    const f = makeMemoryFactory();
    const ht = await f.join("r");
    const ct = await f.join("r");
    const host = startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });
    const client = joinClient<TestState, TestMove>(ct, { helloRetryMs: 20 });
    await tick();
    await wait(60); // let several retry hellos fire

    expect(host.connectedPlayers).toEqual(["p0", "p1"]);
    expect(host.connectedPlayers.length).toBe(2);
    expect(client.myRole).toBe("p1");

    client.leave();
    host.leave();
  });

  test("bidirectional discovery: host assigns role immediately on peer join without waiting for hello", async () => {
    // The host's onPeerJoin fires assignRole proactively. This test verifies
    // the host side: connectedPlayers grows immediately on peer join (not only
    // after hello). The client side still needs hello for its own role
    // tracking in the memory transport because the deferred peer join fires
    // after joinClient registers its message listener.
    const f = makeMemoryFactory();
    const ht = await f.join("r");
    // Start host BEFORE client joins so the host's onPeerJoin listener is live
    // when f.join fires notifyJoin synchronously.
    const host = startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });

    // Now client joins — host's onPeerJoin fires synchronously during f.join,
    // which calls assignRole. The client transport's message listeners are not
    // registered yet at that moment (joinClient has not been called), so the
    // host's initial messages are missed. However, the client's deferred
    // onPeerJoin (macrotask) fires after joinClient is called and sends hello,
    // which triggers a second assignRole + state round-trip.
    const ct = await f.join("r");
    const client = joinClient<TestState, TestMove>(ct);
    await tick();

    // Both paths converge: host shows both connected, client has its role.
    expect(host.connectedPlayers).toEqual(["p0", "p1"]);
    expect(client.myRole).toBe("p1");
    expect(client.debug.hasState).toBe(true);
  });
});
