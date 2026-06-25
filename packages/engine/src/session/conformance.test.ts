/**
 * Conformance fixtures (Item 2): prove a non-MNAC game shape round-trips
 * through the engine's startHost/joinClient over the memory transport.
 *
 * The fixture game ("DiceRace") exercises ALL of the engine's claimed
 * generality properties:
 *
 *  1. Non-alternating turns / EXTRA TURN: rolling >= 4 (on a d6) grants an
 *     extra turn, so currentPlayer can stay the same across consecutive moves.
 *
 *  2. Seeded RNG used inside applyMove: the dice roll is derived from the rng
 *     passed to applyMove, making the outcome deterministic for a given seed.
 *     The test asserts reproducibility by re-simulating with the same seed.
 *
 *  3. Scored GameResult: the game ends with { status: "scored", scores: {...} }
 *     once any player's score reaches the WIN_THRESHOLD.
 *
 *  4. view() projection hiding a private value from the opponent: each player
 *     has a secret "bonus" that only they can see. The joining client receives
 *     only the projected state (opponent's bonus is hidden), mirroring the
 *     hidden-info session test in session.test.ts.
 */

// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { GameDefinition, GameResult, MoveValidation } from "../game";
import type { Rng } from "../rng";
import { makeRng } from "../rng";
import { makeMemoryFactory } from "../transport/memory";
import { joinClient, startHost } from "./index";

/** Resolve after a macrotask so deferred join notifications have fired. */
function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

// ---------------------------------------------------------------------------
// DiceRace – fixture game definition
//
// State:
//   players: string[]           – roster
//   turn: number                – index into players (wraps)
//   scores: Record<string, number>
//   bonus: Record<string, number>  – hidden private value per player
//   extraTurn: boolean          – true when the current player earned an extra turn
//
// Move: "roll" (the only legal move; cost is computed from rng inside applyMove)
//
// Rules:
//   - Each "roll" adds the dice value (1–6) to the current player's score.
//   - Rolling 4, 5, or 6 grants an extra turn (currentPlayer stays the same).
//   - Rolling 1, 2, or 3 passes the turn to the next player.
//   - The game ends (scored result) when any player's score >= WIN_THRESHOLD.
//   - Each player has a private `bonus` value set at setup (hidden from others).
//
// View projection:
//   The `bonus` map only contains the key for the requesting player; all other
//   bonus entries are omitted.
// ---------------------------------------------------------------------------

const WIN_THRESHOLD = 10;

interface DiceRaceState {
  players: string[];
  turn: number;
  scores: Record<string, number>;
  /** Private bonus per player — hidden from opponents via view(). */
  bonus: Record<string, number>;
  /** When true, the current player gets to move again. */
  extraTurn: boolean;
}

type DiceRaceMove = "roll";

const diceRaceGame: GameDefinition<DiceRaceState, DiceRaceMove> = {
  setup(players: string[], rng: Rng): DiceRaceState {
    const scores: Record<string, number> = {};
    const bonus: Record<string, number> = {};
    for (const p of players) {
      scores[p] = 0;
      // Each player gets a secret bonus between 1 and 3.
      bonus[p] = rng.int(3) + 1;
    }
    return { players: [...players], turn: 0, scores, bonus, extraTurn: false };
  },

  currentPlayer(state: DiceRaceState): string | null {
    if (diceRaceGame.getResult(state).status !== "ongoing") return null;
    return state.players[state.turn % state.players.length] ?? null;
  },

  validateMove(state: DiceRaceState, _move: DiceRaceMove, by: string): MoveValidation {
    const cp = diceRaceGame.currentPlayer(state);
    if (cp !== by) return { ok: false, reason: "not your turn" };
    if (diceRaceGame.getResult(state).status !== "ongoing") {
      return { ok: false, reason: "game over" };
    }
    return { ok: true };
  },

  applyMove(state: DiceRaceState, _move: DiceRaceMove, by: string, rng: Rng): DiceRaceState {
    // Roll a d6 — outcome comes from the rng argument (deterministic for a seed).
    const roll = rng.int(6) + 1;
    const newScore = (state.scores[by] ?? 0) + roll;
    const newScores = { ...state.scores, [by]: newScore };

    // Rolling 4–6 grants an extra turn; 1–3 passes to the next player.
    const grantExtra = roll >= 4;
    const newTurn = grantExtra ? state.turn : state.turn + 1;

    return {
      ...state,
      scores: newScores,
      turn: newTurn,
      extraTurn: grantExtra,
    };
  },

  getResult(state: DiceRaceState): GameResult<string> {
    // Check if any player has reached the threshold.
    for (const p of state.players) {
      if ((state.scores[p] ?? 0) >= WIN_THRESHOLD) {
        return {
          status: "scored",
          scores: { ...state.scores },
        };
      }
    }
    return { status: "ongoing" };
  },

  view(state: DiceRaceState, player: string): DiceRaceState {
    // Hide all bonus entries except the requesting player's own.
    const visibleBonus: Record<string, number> = {};
    if (state.bonus[player] !== undefined) {
      visibleBonus[player] = state.bonus[player] as number;
    }
    return { ...state, bonus: visibleBonus };
  },
};

// ---------------------------------------------------------------------------
// Helper: simulate a full game from scratch with a given seed.
// Returns the sequence of (player, roll) pairs and the final scores.
// ---------------------------------------------------------------------------

function simulateGame(seed: number, players: string[]): {
  moves: Array<{ player: string; roll: number; extraTurn: boolean }>;
  finalScores: Record<string, number>;
} {
  const rng = makeRng(seed);
  let state = diceRaceGame.setup(players, rng);
  const moves: Array<{ player: string; roll: number; extraTurn: boolean }> = [];

  for (let step = 0; step < 100; step++) {
    const result = diceRaceGame.getResult(state);
    if (result.status !== "ongoing") break;

    const cp = diceRaceGame.currentPlayer(state) as string;
    // Peek at what rng will produce (same rng instance, same call sequence).
    // We record it after the fact using a clone approach instead: simulate from
    // the state before and after to compute the roll.
    const scoresBefore = state.scores[cp] ?? 0;
    state = diceRaceGame.applyMove(state, "roll", cp, rng);
    const scoresAfter = state.scores[cp] ?? 0;
    const roll = scoresAfter - scoresBefore;
    moves.push({ player: cp, roll, extraTurn: state.extraTurn });
  }

  return { moves, finalScores: { ...state.scores } };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DiceRace conformance – engine generality", () => {
  test("extra turn: rolling high keeps currentPlayer the same", () => {
    // Simulate locally to find a move sequence where an extra turn occurs.
    // We run enough seeds until we observe an extra turn in the first few moves.
    let foundExtraTurn = false;

    for (let seed = 0; seed < 100 && !foundExtraTurn; seed++) {
      const { moves } = simulateGame(seed, ["alice", "bob"]);
      for (let i = 0; i + 1 < moves.length; i++) {
        if (moves[i]!.extraTurn) {
          expect(moves[i]!.player).toBe(moves[i + 1]!.player);
          foundExtraTurn = true;
          break;
        }
      }
    }

    expect(foundExtraTurn).toBe(true);
  });

  test("seeded rng in applyMove is reproducible: same seed → same outcome", () => {
    // Simulate the same game twice from seed 42; results must be identical.
    const first = simulateGame(42, ["alice", "bob"]);
    const second = simulateGame(42, ["alice", "bob"]);

    expect(first.moves).toEqual(second.moves);
    expect(first.finalScores).toEqual(second.finalScores);
  });

  test("scored result: game ends with scored status once threshold is reached", () => {
    // Run until we get a scored result; assert structure.
    const rng = makeRng(1);
    let state = diceRaceGame.setup(["alice", "bob"], rng);

    for (let step = 0; step < 200; step++) {
      const result = diceRaceGame.getResult(state);
      if (result.status !== "ongoing") {
        expect(result.status).toBe("scored");
        if (result.status === "scored") {
          expect(typeof result.scores["alice"]).toBe("number");
          expect(typeof result.scores["bob"]).toBe("number");
          // At least one player must be at or above the threshold.
          const reached = Object.values(result.scores).some(
            (s) => s >= WIN_THRESHOLD,
          );
          expect(reached).toBe(true);
        }
        return;
      }
      const cp = diceRaceGame.currentPlayer(state) as string;
      state = diceRaceGame.applyMove(state, "roll", cp, rng);
    }

    throw new Error("Game did not end within 200 moves");
  });

  test("view projection: client cannot see opponent bonus field", async () => {
    const f = makeMemoryFactory();
    const ht = await f.join("room");
    const ct = await f.join("room");
    const host = startHost(diceRaceGame, ht, { seed: 7, players: ["alice", "bob"] });
    const client = joinClient(diceRaceGame, ct);
    await tick();

    // Host is alice (players[0]), client is bob (players[1]).
    expect(host.myRole).toBe("alice");
    expect(client.myRole).toBe("bob");

    // Client should only see its own bonus.
    const clientState = client.state;
    expect(clientState).not.toBeNull();
    expect(clientState?.bonus["bob"]).toBeDefined();
    expect(clientState?.bonus["alice"]).toBeUndefined();

    // Host should only see its own bonus.
    const hostState = host.state;
    expect(hostState?.bonus["alice"]).toBeDefined();
    expect(hostState?.bonus["bob"]).toBeUndefined();
  });

  test("host applies moves; client receives projected state over transport", async () => {
    const f = makeMemoryFactory();
    const ht = await f.join("room2");
    const ct = await f.join("room2");
    const host = startHost(diceRaceGame, ht, { seed: 3, players: ["alice", "bob"] });
    const client = joinClient(diceRaceGame, ct);
    await tick();

    // Host (alice) makes a move; scores should update.
    const scoreBefore = host.state?.scores["alice"] ?? 0;
    host.makeMove("roll");
    await tick();

    const scoreAfter = host.state?.scores["alice"] ?? 0;
    expect(scoreAfter).toBeGreaterThan(scoreBefore);

    // Client's alice score matches host's (both see canonical scores, not hidden).
    expect(client.state?.scores["alice"]).toBe(scoreAfter);
  });

  test("scored result propagates to both host and client", async () => {
    // Use a known seed that will finish the game within a bounded number of moves.
    const f = makeMemoryFactory();
    const ht = await f.join("room3");
    const ct = await f.join("room3");
    const host = startHost(diceRaceGame, ht, { seed: 5, players: ["alice", "bob"] });
    const client = joinClient(diceRaceGame, ct);
    await tick();

    // Drive the game to completion by alternating moves.
    for (let step = 0; step < 60; step++) {
      if (host.result.status !== "ongoing") break;
      const cp = host.currentPlayer;
      if (cp === "alice") {
        host.makeMove("roll");
      } else {
        client.makeMove("roll");
      }
      await tick();
    }

    expect(host.result.status).toBe("scored");
    expect(client.result.status).toBe("scored");
    if (host.result.status === "scored" && client.result.status === "scored") {
      expect(host.result.scores).toEqual(client.result.scores);
    }
  });

  test("extra turn over transport: currentPlayer stays same on the client", async () => {
    // We need a seed where alice's first roll grants an extra turn (roll >= 4).
    // Scan seeds until we find one where alice's first roll is >= 4.
    //
    // To determine what the first roll will be under the engine:
    //  - setup() calls rng twice (one bonus per player); then applyMove calls rng once.
    //  - So the 3rd rng call (after 2 setup calls) is the first roll.
    const { makeRng: mkRng } = await import("../rng");
    let targetSeed = -1;
    for (let seed = 0; seed < 200; seed++) {
      const rng = mkRng(seed);
      rng.int(3); // alice bonus
      rng.int(3); // bob bonus
      const firstRoll = rng.int(6) + 1;
      if (firstRoll >= 4) {
        targetSeed = seed;
        break;
      }
    }
    expect(targetSeed).toBeGreaterThanOrEqual(0);

    const f2 = makeMemoryFactory();
    const ht2 = await f2.join("room4");
    const ct2 = await f2.join("room4");
    const host2 = startHost(diceRaceGame, ht2, {
      seed: targetSeed,
      players: ["alice", "bob"],
    });
    const client2 = joinClient(diceRaceGame, ct2);
    await tick();

    // Alice moves; it should still be alice's turn (extra turn).
    expect(host2.currentPlayer).toBe("alice");
    host2.makeMove("roll");
    await tick();

    // Both sides see alice is still current player.
    expect(host2.currentPlayer).toBe("alice");
    expect(client2.currentPlayer).toBe("alice");
  });
});
