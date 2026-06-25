// @vitest-environment node
/**
 * Integration tests: FaultyTransport composed with the real memory transport
 * and the session layer. Proves that fault injection (a) does NOT defeat the
 * client's hello-retry recovery for a finite initial drop, and (b) DOES keep
 * the session stuck while a relay-down window is open, recovering afterwards.
 */
import { expect, test } from "vitest";
import type { GameDefinition, GameResult, MoveValidation } from "../game";
import { joinClient, startHost } from "../session";
import { makeFaultyFactory } from "./faulty";
import { makeMemoryFactory } from "./memory";

interface TestState {
  players: string[];
  turn: number;
}
interface TestMove {
  cell: number;
}

const testDef: GameDefinition<TestState, TestMove> = {
  setup(players): TestState {
    return { players: [...players], turn: 0 };
  },
  currentPlayer(state): string {
    return state.players[state.turn % state.players.length] as string;
  },
  validateMove(): MoveValidation {
    return { ok: true };
  },
  applyMove(state): TestState {
    return { ...state, turn: state.turn + 1 };
  },
  getResult(): GameResult<string> {
    return { status: "ongoing" };
  },
};

/** Resolve after a macrotask so deferred join notifications have fired. */
function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}
/** Resolve after `ms` of real time so the retry interval can fire. */
function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const RETRY_MS = 20;

test("dropFirstSends:6 still syncs via the client hello retry", async () => {
  const base = makeMemoryFactory();
  // Host uses the base factory; the client's factory drops its first 6 sends
  // (its initial hello + several retries), as if the data channel were closed.
  const faulty = makeFaultyFactory(base, { dropFirstSends: 6 });

  const ht = await base.join("r");
  const ct = await faulty.join("r");

  const host = startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });
  const client = joinClient<TestState, TestMove>(ct, { helloRetryMs: RETRY_MS });
  await tick();

  // The dropped hellos mean nothing has synced yet.
  expect(client.myRole).toBeNull();
  expect(client.state).toBeNull();

  // Once the 6 drops are exhausted, a retry punches a hello through.
  await wait(RETRY_MS * 12);

  expect(client.myRole).toBe("p1");
  expect(client.state).not.toBeNull();
  expect(client.connectedPlayers).toEqual(["p0", "p1"]);
  expect(host.connectedPlayers).toEqual(["p0", "p1"]);

  client.leave();
  host.leave();
});

test("large failWindowMs keeps the session stuck, then it recovers", async () => {
  const base = makeMemoryFactory();
  const WINDOW_MS = 200;
  // All client sends are dropped for the first WINDOW_MS (relay-down).
  const faulty = makeFaultyFactory(base, { failWindowMs: WINDOW_MS });

  const ht = await base.join("r");
  const ct = await faulty.join("r");

  const host = startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });
  const client = joinClient<TestState, TestMove>(ct, { helloRetryMs: RETRY_MS });
  await tick();

  // Still inside the window: retries are firing but every send is dropped.
  await wait(50);
  expect(client.myRole).toBeNull();
  expect(client.state).toBeNull();

  // After the window elapses, a retry gets through and the session converges.
  await wait(WINDOW_MS + RETRY_MS * 8);

  expect(client.myRole).toBe("p1");
  expect(client.state).not.toBeNull();
  expect(host.connectedPlayers).toEqual(["p0", "p1"]);

  client.leave();
  host.leave();
});
