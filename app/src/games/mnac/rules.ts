import type { MoveValidation, GameResult } from "@mnac/engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Mark = "X" | "O";
export type CellIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type SubResult =
  | { status: "ongoing" }
  | { status: "won"; by: Mark }
  | { status: "draw" };

export interface MnacState {
  /** 9 sub-boards, each containing 9 cells (null = empty). */
  boards: (Mark | null)[][];
  /** Length 9 — result for each sub-board. */
  subResults: SubResult[];
  turn: Mark;
  /** null = play anywhere undecided; CellIndex = must play in that sub-board. */
  forcedBoard: CellIndex | null;
  result: GameResult<Mark>;
}

export interface MnacMove {
  board: CellIndex;
  cell: CellIndex;
}

// ---------------------------------------------------------------------------
// 8 winning lines (indices into a 9-cell array)
// ---------------------------------------------------------------------------

const LINES: [number, number, number][] = [
  // rows
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  // columns
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  // diagonals
  [0, 4, 8],
  [2, 4, 6],
];

// ---------------------------------------------------------------------------
// lineWinner
// ---------------------------------------------------------------------------

/**
 * Check all 8 lines in a 9-cell board.
 * Returns the mark that occupies a complete line, or null if no winner.
 */
export function lineWinner(cells: (Mark | null)[]): Mark | null {
  for (const [a, b, c] of LINES) {
    const v = cells[a];
    if (v !== null && v === cells[b] && v === cells[c]) {
      return v;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// mnacSetup
// ---------------------------------------------------------------------------

export function mnacSetup(): MnacState {
  return {
    boards: Array.from({ length: 9 }, () => Array<Mark | null>(9).fill(null)),
    subResults: Array.from({ length: 9 }, () => ({ status: "ongoing" as const })),
    turn: "X",
    forcedBoard: null,
    result: { status: "ongoing" },
  };
}

// ---------------------------------------------------------------------------
// mnacValidate
// ---------------------------------------------------------------------------

export function mnacValidate(
  s: MnacState,
  m: MnacMove,
  by: Mark
): MoveValidation {
  if (s.result.status !== "ongoing") {
    return { ok: false, reason: "The game is already over." };
  }

  if (by !== s.turn) {
    return {
      ok: false,
      reason: `It is ${s.turn}'s turn, not ${by}'s.`,
    };
  }

  const targetSubResult = s.subResults[m.board];
  if (targetSubResult.status !== "ongoing") {
    return {
      ok: false,
      reason: `Sub-board ${m.board} is already decided (${targetSubResult.status}).`,
    };
  }

  if (s.forcedBoard !== null && m.board !== s.forcedBoard) {
    return {
      ok: false,
      reason: `You must play in sub-board ${s.forcedBoard}, not ${m.board}.`,
    };
  }

  if (s.boards[m.board][m.cell] !== null) {
    return {
      ok: false,
      reason: `Cell ${m.cell} in sub-board ${m.board} is already occupied.`,
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// computeSubResult — called after placing a mark in a sub-board
// ---------------------------------------------------------------------------

function computeSubResult(cells: (Mark | null)[]): SubResult {
  const winner = lineWinner(cells);
  if (winner !== null) {
    return { status: "won", by: winner };
  }
  if (cells.every((c) => c !== null)) {
    return { status: "draw" };
  }
  return { status: "ongoing" };
}

// ---------------------------------------------------------------------------
// computeOverallResult — derives top-level game result from subResults
// ---------------------------------------------------------------------------

function computeOverallResult(subResults: SubResult[]): GameResult<Mark> {
  // Build the 9-cell top-level board: won sub-boards count as their winner's mark;
  // ongoing and drawn sub-boards count as null.
  const topCells: (Mark | null)[] = subResults.map((r) =>
    r.status === "won" ? r.by : null
  );

  const winner = lineWinner(topCells);
  if (winner !== null) {
    return { status: "win", winner };
  }

  // All sub-boards decided (won or drawn) and no top-level winner -> draw.
  if (subResults.every((r) => r.status !== "ongoing")) {
    return { status: "draw" };
  }

  return { status: "ongoing" };
}

// ---------------------------------------------------------------------------
// mnacApply — pure; returns a new MnacState, never mutates input
// ---------------------------------------------------------------------------

export function mnacApply(s: MnacState, m: MnacMove, by: Mark): MnacState {
  void by; // by is validated by mnacValidate; actual turn is s.turn (canonical source of truth)
  // Clone boards (deep enough: each sub-board is a new array)
  const newBoards = s.boards.map((board) => [...board]);
  // Place the mark
  newBoards[m.board][m.cell] = s.turn;

  // Recompute the affected sub-board's result
  const newSubResults: SubResult[] = [...s.subResults];
  newSubResults[m.board] = computeSubResult(newBoards[m.board]);

  // Determine the next forced board
  const targetSubResult = newSubResults[m.cell as number];
  const nextForced: CellIndex | null =
    targetSubResult.status === "ongoing"
      ? (m.cell as CellIndex)
      : null;

  // Flip turn
  const nextTurn: Mark = s.turn === "X" ? "O" : "X";

  // Recompute overall result
  const newResult = computeOverallResult(newSubResults);

  return {
    boards: newBoards,
    subResults: newSubResults,
    turn: nextTurn,
    forcedBoard: nextForced,
    result: newResult,
  };
}
