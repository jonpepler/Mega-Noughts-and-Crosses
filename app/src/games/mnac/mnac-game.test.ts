import { makeRng } from "@mnac/engine";
import { mnacSetup, mnacValidate, mnacApply, type MnacMove } from "./rules";
import { mnacGame } from "./mnac-game";

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

describe("mnacGame.setup", () => {
  test("equals mnacSetup() regardless of players/rng", () => {
    const rng = makeRng(42);
    expect(mnacGame.setup(["X", "O"], rng)).toEqual(mnacSetup());
  });

  test("returns a fresh state with turn X", () => {
    const rng = makeRng(1);
    const state = mnacGame.setup(["X", "O"], rng);
    expect(state.turn).toBe("X");
    expect(state.result.status).toBe("ongoing");
  });
});

// ---------------------------------------------------------------------------
// currentPlayer
// ---------------------------------------------------------------------------

describe("mnacGame.currentPlayer", () => {
  test("returns X at the start", () => {
    const state = mnacSetup();
    expect(mnacGame.currentPlayer(state)).toBe("X");
  });

  test("returns O after X plays first move", () => {
    const state = mnacApply(mnacSetup(), { board: 4, cell: 2 }, "X");
    expect(mnacGame.currentPlayer(state)).toBe("O");
  });

  test("returns null when the game is won", () => {
    // Win sub-boards 2, 4, 6 (anti-diagonal) for X to produce a terminal state
    let s = mnacSetup();
    // Win board 2
    s = mnacApply(s, { board: 2, cell: 0 }, "X");
    s = mnacApply(s, { board: 0, cell: 2 }, "O");
    s = mnacApply(s, { board: 2, cell: 1 }, "X");
    s = mnacApply(s, { board: 1, cell: 2 }, "O");
    s = mnacApply(s, { board: 2, cell: 2 }, "X"); // X wins board 2
    // Win board 4
    s = mnacApply(s, { board: 5, cell: 4 }, "O");
    s = mnacApply(s, { board: 4, cell: 0 }, "X");
    s = mnacApply(s, { board: 0, cell: 4 }, "O");
    s = mnacApply(s, { board: 4, cell: 1 }, "X");
    s = mnacApply(s, { board: 1, cell: 4 }, "O");
    s = mnacApply(s, { board: 4, cell: 2 }, "X"); // X wins board 4
    // Win board 6
    s = mnacApply(s, { board: 7, cell: 6 }, "O");
    s = mnacApply(s, { board: 6, cell: 0 }, "X");
    s = mnacApply(s, { board: 0, cell: 6 }, "O");
    s = mnacApply(s, { board: 6, cell: 1 }, "X");
    s = mnacApply(s, { board: 1, cell: 6 }, "O");
    s = mnacApply(s, { board: 6, cell: 2 }, "X"); // X wins board 6 -> game over
    expect(s.result.status).toBe("win");
    expect(mnacGame.currentPlayer(s)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateMove
// ---------------------------------------------------------------------------

describe("mnacGame.validateMove", () => {
  test("delegates to mnacValidate: rejects out-of-turn move", () => {
    const state = mnacSetup();
    const engineResult = mnacGame.validateMove(state, { board: 0, cell: 0 }, "O");
    const rulesResult = mnacValidate(state, { board: 0, cell: 0 }, "O");
    expect(engineResult).toEqual(rulesResult);
    expect(engineResult.ok).toBe(false);
  });

  test("delegates to mnacValidate: accepts a valid move", () => {
    const state = mnacSetup();
    const engineResult = mnacGame.validateMove(state, { board: 0, cell: 0 }, "X");
    const rulesResult = mnacValidate(state, { board: 0, cell: 0 }, "X");
    expect(engineResult).toEqual(rulesResult);
    expect(engineResult.ok).toBe(true);
  });

  test("rejects a move in the wrong forced board", () => {
    const state = mnacApply(mnacSetup(), { board: 4, cell: 2 }, "X");
    // O is forced to board 2
    const result = mnacGame.validateMove(state, { board: 5, cell: 3 }, "O");
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyMove
// ---------------------------------------------------------------------------

describe("mnacGame.applyMove", () => {
  test("delegates to mnacApply: advances state correctly", () => {
    const rng = makeRng(0);
    const initial = mnacSetup();
    const move: MnacMove = { board: 4, cell: 2 };
    const applied = mnacGame.applyMove(initial, move, "X", rng);
    const expected = mnacApply(initial, move, "X");
    expect(applied).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// getResult
// ---------------------------------------------------------------------------

describe("mnacGame.getResult", () => {
  test("returns the state's result at start (ongoing)", () => {
    const state = mnacSetup();
    expect(mnacGame.getResult(state)).toEqual(state.result);
    expect(mnacGame.getResult(state).status).toBe("ongoing");
  });

  test("returns win result after the game is won", () => {
    let s = mnacSetup();
    // Win board 2
    s = mnacApply(s, { board: 2, cell: 0 }, "X");
    s = mnacApply(s, { board: 0, cell: 2 }, "O");
    s = mnacApply(s, { board: 2, cell: 1 }, "X");
    s = mnacApply(s, { board: 1, cell: 2 }, "O");
    s = mnacApply(s, { board: 2, cell: 2 }, "X");
    // Win board 4
    s = mnacApply(s, { board: 5, cell: 4 }, "O");
    s = mnacApply(s, { board: 4, cell: 0 }, "X");
    s = mnacApply(s, { board: 0, cell: 4 }, "O");
    s = mnacApply(s, { board: 4, cell: 1 }, "X");
    s = mnacApply(s, { board: 1, cell: 4 }, "O");
    s = mnacApply(s, { board: 4, cell: 2 }, "X");
    // Win board 6
    s = mnacApply(s, { board: 7, cell: 6 }, "O");
    s = mnacApply(s, { board: 6, cell: 0 }, "X");
    s = mnacApply(s, { board: 0, cell: 6 }, "O");
    s = mnacApply(s, { board: 6, cell: 1 }, "X");
    s = mnacApply(s, { board: 1, cell: 6 }, "O");
    s = mnacApply(s, { board: 6, cell: 2 }, "X");
    const result = mnacGame.getResult(s);
    expect(result).toEqual({ status: "win", winner: "X" });
  });
});

// ---------------------------------------------------------------------------
// view is omitted
// ---------------------------------------------------------------------------

test("view is not defined on mnacGame", () => {
  expect(mnacGame.view).toBeUndefined();
});
