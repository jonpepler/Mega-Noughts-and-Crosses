/**
 * TDD tests for Item 1: surface move-rejection reason via lastRejection.
 *
 * These tests are written FIRST (red phase) against the current code.
 * They will fail until host-session.ts, client-session.ts, and session.ts
 * are updated.
 */

// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { GameDefinition, GameResult, MoveValidation } from "../game";
import { makeMemoryFactory } from "../transport/memory";
import { joinClient, startHost } from "./index";

/** Resolve after a macrotask so deferred join notifications have fired. */
function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

// ---------------------------------------------------------------------------
// Shared tiny game definition (re-used from session.test.ts style)
// ---------------------------------------------------------------------------

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
    if (move.cell < 0 || move.cell > 8) {
      return { ok: false, reason: "out of range" };
    }
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
  getResult(state): GameResult<string> {
    const owner = state.claimed[0];
    if (owner !== undefined) return { status: "win", winner: owner };
    return { status: "ongoing" };
  },
};

// ---------------------------------------------------------------------------
// Item 1a: client receives rejection reason on invalid move (out of turn)
// ---------------------------------------------------------------------------

describe("lastRejection – client", () => {
  test("client out-of-turn move sets lastRejection with reason and seq", async () => {
    const f = makeMemoryFactory();
    const ht = await f.join("r");
    const ct = await f.join("r");
    startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });
    const client = joinClient(testDef, ct);
    await tick();

    // Sanity: it is p0's (host's) turn; client is p1.
    expect(client.myRole).toBe("p1");

    // Initially null.
    expect(client.lastRejection).toBeNull();

    // Client sends a move out of turn → host rejects it.
    client.makeMove({ cell: 3 });
    await tick();

    // The rejection should be surfaced.
    expect(client.lastRejection).not.toBeNull();
    expect(client.lastRejection?.reason).toBe("not your turn");
    expect(typeof client.lastRejection?.seq).toBe("number");
  });

  test("client lastRejection is cleared after a subsequent authoritative state update", async () => {
    const f = makeMemoryFactory();
    const ht = await f.join("r");
    const ct = await f.join("r");
    const host = startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });
    const client = joinClient(testDef, ct);
    await tick();

    // Client (p1) tries to move out of turn → rejection set.
    client.makeMove({ cell: 3 });
    await tick();
    expect(client.lastRejection).not.toBeNull();

    // Host (p0) makes a valid move; state is broadcast; client lastRejection clears.
    host.makeMove({ cell: 1 });
    await tick();
    expect(client.lastRejection).toBeNull();
  });

  test("client lastRejection seq matches the intent seq", async () => {
    const f = makeMemoryFactory();
    const ht = await f.join("r");
    const ct = await f.join("r");
    startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });
    const client = joinClient(testDef, ct);
    await tick();

    // First move (seq=1) is invalid.
    client.makeMove({ cell: 3 });
    await tick();

    expect(client.lastRejection?.seq).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Item 1b: host own invalid makeMove sets host's lastRejection
// ---------------------------------------------------------------------------

describe("lastRejection – host", () => {
  test("host invalid local makeMove sets lastRejection with reason", async () => {
    const f = makeMemoryFactory();
    const ht = await f.join("r");
    const host = startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });

    // Initially null.
    expect(host.lastRejection).toBeNull();

    // Host (p0) makes a valid move first: cell 5.
    host.makeMove({ cell: 5 });
    // Now it's p1's turn; host (p0) tries to move again → out of turn.
    host.makeMove({ cell: 2 });

    expect(host.lastRejection).not.toBeNull();
    expect(host.lastRejection?.reason).toBe("not your turn");
  });

  test("host lastRejection is cleared after a subsequent valid local makeMove", async () => {
    const f = makeMemoryFactory();
    const ht = await f.join("r");
    const host = startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });

    // Force a rejection by an out-of-range cell.
    // Note: p0's turn; invalid move (out of range).
    host.makeMove({ cell: 99 });
    expect(host.lastRejection).not.toBeNull();
    expect(host.lastRejection?.reason).toBe("out of range");

    // Now a valid move clears it.
    host.makeMove({ cell: 0 });
    expect(host.lastRejection).toBeNull();
  });

  test("host lastRejection seq is always 0 (local moves have no intent seq)", async () => {
    const f = makeMemoryFactory();
    const ht = await f.join("r");
    const host = startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });

    // Trigger a rejection.
    host.makeMove({ cell: 5 });
    host.makeMove({ cell: 2 }); // out of turn
    expect(host.lastRejection?.seq).toBe(0);
  });

  test("host subscribers are notified when lastRejection is set", async () => {
    const f = makeMemoryFactory();
    const ht = await f.join("r");
    const host = startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });

    let notified = false;
    host.subscribe(() => {
      notified = true;
    });

    host.makeMove({ cell: 5 });   // valid (p0's turn)
    notified = false;
    host.makeMove({ cell: 2 });   // invalid (p1's turn now)
    expect(notified).toBe(true);
  });

  test("client subscribers are notified when lastRejection is set", async () => {
    const f = makeMemoryFactory();
    const ht = await f.join("r");
    const ct = await f.join("r");
    startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });
    const client = joinClient(testDef, ct);
    await tick();

    let notified = false;
    client.subscribe(() => {
      notified = true;
    });

    client.makeMove({ cell: 3 }); // out of turn → rejection
    await tick();
    expect(notified).toBe(true);
  });

  test("host lastRejection is cleared when a valid remote client move advances the game", async () => {
    // Regression: a stale host rejection should not linger after the opponent moves.
    const f = makeMemoryFactory();
    const ht = await f.join("r");
    const ct = await f.join("r");
    const host = startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });
    const client = joinClient(testDef, ct);
    await tick();

    // p0's turn; host (p0) makes an invalid move → lastRejection is set.
    host.makeMove({ cell: 99 }); // out of range
    expect(host.lastRejection).not.toBeNull();
    expect(host.lastRejection?.reason).toBe("out of range");

    // Now host makes a valid move so it becomes p1's turn.
    host.makeMove({ cell: 0 });
    expect(host.lastRejection).toBeNull();

    // Re-trigger a host rejection while it is p0's turn again (after client moves).
    // First: client (p1) makes a valid move to pass turn back to p0.
    // But first set a rejection on the host by trying an invalid move (out of turn).
    host.makeMove({ cell: 3 }); // out of turn for host (it's p1's turn)
    expect(host.lastRejection).not.toBeNull();

    // Client (p1) makes a valid move, advancing the game.
    client.makeMove({ cell: 2 });
    await tick();

    // The host's stale rejection must now be cleared.
    expect(host.lastRejection).toBeNull();
  });
});
