/**
 * End-to-end test: two pages in one browser context play a full game of
 * Mega Noughts and Crosses via BroadcastChannel (?local transport).
 *
 * Two pages share one context so BroadcastChannel connects between them.
 * The ?role=host / ?role=join override (added in App.tsx) ensures deterministic
 * role assignment even though the context shares localStorage.
 *
 * The winning move sequence was derived by running a minimax simulation of the
 * rules (mnacSetup / mnacApply / mnacValidate) and verified to produce an X win
 * in 37 moves. X moves on odd plies (1,3,5,...), O on even.
 */

import { test, expect } from "@playwright/test";
import type { MnacState, MnacMove, Mark } from "../src/games/mnac/rules";

// ---------------------------------------------------------------------------
// Inline rule implementation (mirrors app/src/games/mnac/rules.ts) so the
// spec can verify the sequence without importing from the built app.
// ---------------------------------------------------------------------------

const LINES: [number, number, number][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function lineWinner(cells: (Mark | null)[]): Mark | null {
  for (const [a, b, c] of LINES) {
    const v = cells[a];
    if (v !== null && v === cells[b] && v === cells[c]) return v;
  }
  return null;
}

type SubResult =
  | { status: "ongoing" }
  | { status: "won"; by: Mark }
  | { status: "draw" };

function computeSubResult(cells: (Mark | null)[]): SubResult {
  const winner = lineWinner(cells);
  if (winner !== null) return { status: "won", by: winner };
  if (cells.every((c) => c !== null)) return { status: "draw" };
  return { status: "ongoing" };
}

function computeOverallResult(
  subResults: SubResult[],
): { status: "ongoing" } | { status: "draw" } | { status: "win"; winner: Mark } {
  const topCells: (Mark | null)[] = subResults.map((r) =>
    r.status === "won" ? r.by : null,
  );
  const winner = lineWinner(topCells);
  if (winner !== null) return { status: "win", winner };
  if (subResults.every((r) => r.status !== "ongoing")) return { status: "draw" };
  return { status: "ongoing" };
}

function mnacSetup(): MnacState {
  return {
    boards: Array.from({ length: 9 }, () => Array<Mark | null>(9).fill(null)),
    subResults: Array.from({ length: 9 }, () => ({
      status: "ongoing" as const,
    })),
    turn: "X",
    forcedBoard: null,
    result: { status: "ongoing" },
  };
}

function mnacApply(s: MnacState, m: MnacMove): MnacState {
  const newBoards = s.boards.map((b) => [...b]);
  newBoards[m.board][m.cell] = s.turn;
  const newSubResults = [...s.subResults] as SubResult[];
  newSubResults[m.board] = computeSubResult(newBoards[m.board]);
  const targetSub = newSubResults[m.cell as number];
  const nextForced =
    targetSub.status === "ongoing" ? (m.cell as number) : null;
  const nextTurn: Mark = s.turn === "X" ? "O" : "X";
  const newResult = computeOverallResult(newSubResults);
  return {
    boards: newBoards,
    subResults: newSubResults as MnacState["subResults"],
    turn: nextTurn,
    forcedBoard: nextForced as MnacState["forcedBoard"],
    result: newResult as MnacState["result"],
  };
}

function mnacValidate(
  s: MnacState,
  m: MnacMove,
  by: Mark,
): { ok: true } | { ok: false; reason: string } {
  if (s.result.status !== "ongoing") return { ok: false, reason: "game over" };
  if (by !== s.turn) return { ok: false, reason: `not ${by}'s turn` };
  if (s.subResults[m.board].status !== "ongoing")
    return { ok: false, reason: "board decided" };
  if (s.forcedBoard !== null && m.board !== s.forcedBoard)
    return { ok: false, reason: `forced to ${s.forcedBoard}` };
  if (s.boards[m.board][m.cell] !== null)
    return { ok: false, reason: "cell occupied" };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Pre-computed winning sequence (X wins in 37 moves).
// Verified: each move passes mnacValidate; final result is {status:"win", winner:"X"}.
// ---------------------------------------------------------------------------

const MOVES: MnacMove[] = [
  { board: 0, cell: 0 }, // X
  { board: 0, cell: 1 }, // O
  { board: 1, cell: 0 }, // X
  { board: 0, cell: 2 }, // O
  { board: 2, cell: 0 }, // X
  { board: 0, cell: 3 }, // O
  { board: 3, cell: 0 }, // X
  { board: 0, cell: 4 }, // O
  { board: 4, cell: 1 }, // X
  { board: 1, cell: 1 }, // O
  { board: 1, cell: 2 }, // X
  { board: 2, cell: 1 }, // O
  { board: 1, cell: 3 }, // X
  { board: 3, cell: 1 }, // O
  { board: 1, cell: 6 }, // X
  { board: 6, cell: 0 }, // O
  { board: 0, cell: 5 }, // X
  { board: 5, cell: 0 }, // O
  { board: 0, cell: 6 }, // X
  { board: 6, cell: 1 }, // O
  { board: 0, cell: 7 }, // X
  { board: 7, cell: 0 }, // O
  { board: 0, cell: 8 }, // X
  { board: 8, cell: 0 }, // O
  { board: 2, cell: 2 }, // X
  { board: 2, cell: 3 }, // O
  { board: 3, cell: 2 }, // X
  { board: 2, cell: 4 }, // O
  { board: 4, cell: 3 }, // X
  { board: 3, cell: 3 }, // O
  { board: 3, cell: 4 }, // X
  { board: 4, cell: 0 }, // O
  { board: 3, cell: 8 }, // X
  { board: 8, cell: 1 }, // O
  { board: 2, cell: 5 }, // X
  { board: 5, cell: 1 }, // O
  { board: 2, cell: 8 }, // X  <- X wins
];

// Verify the sequence at spec-load time so a bad sequence fails clearly.
(function verifySequence() {
  let s = mnacSetup();
  for (let i = 0; i < MOVES.length; i++) {
    const m = MOVES[i];
    const by = s.turn;
    const v = mnacValidate(s, m, by);
    if (!v.ok) {
      throw new Error(
        `MOVES[${i}] board=${m.board} cell=${m.cell} by=${by} invalid: ${v.reason}`,
      );
    }
    s = mnacApply(s, m);
  }
  if (s.result.status !== "win" || s.result.winner !== "X") {
    throw new Error(
      `Sequence does not end in X win: ${JSON.stringify(s.result)}`,
    );
  }
})();

// ---------------------------------------------------------------------------
// The test
// ---------------------------------------------------------------------------

test("two pages play a full game; X wins", async ({ browser }) => {
  // Both pages MUST share one context for BroadcastChannel to connect.
  const context = await browser.newContext();

  const hostPage = await context.newPage();
  const joinPage = await context.newPage();

  // Navigate both pages; ?role override ensures deterministic roles
  // even though they share the same localStorage.
  await hostPage.goto("?room=e2e&local&role=host");
  await joinPage.goto("?room=e2e&local&role=join");

  // Wait until both pages are in "playing" state.
  // The host page (X moves first) will have enabled cells immediately.
  // The join page (O) will have ALL cells disabled on X's turn, so we check
  // that the board region is visible (81 cells rendered) on both pages,
  // and that the host page specifically has at least one enabled cell.
  const boardRegion = `[role="region"][aria-label="Mega Noughts and Crosses board"]`;
  const enabledCell = `button[aria-label^="board"]:not([disabled])`;

  await expect(hostPage.locator(boardRegion)).toBeVisible({ timeout: 15_000 });
  await expect(joinPage.locator(boardRegion)).toBeVisible({ timeout: 15_000 });

  // Confirm the host page is actively in playing state (has an enabled cell for X's move)
  await expect(hostPage.locator(enabledCell).first()).toBeVisible({
    timeout: 15_000,
  });

  // Play through the sequence. X moves on the host page, O on the join page.
  let turn: Mark = "X";
  for (let i = 0; i < MOVES.length; i++) {
    const { board, cell } = MOVES[i];
    const page = turn === "X" ? hostPage : joinPage;
    const otherPage = turn === "X" ? joinPage : hostPage;

    // Click the cell by its accessible name (exact match)
    const cellLabel = `board ${board} cell ${cell}`;
    await page.getByRole("button", { name: cellLabel, exact: true }).click();

    // After the click, wait for the mark to appear on BOTH pages before
    // moving on. The aria-label gains " (X)" or " (O)" once the mark is placed.
    const mark = turn;
    const placedLabel = `board ${board} cell ${cell} (${mark})`;
    const placedLocator = `button[aria-label="${placedLabel}"]`;

    // The page that just clicked should reflect immediately
    await expect(page.locator(placedLocator)).toBeVisible({ timeout: 5_000 });
    // The other page must sync before we proceed
    await expect(otherPage.locator(placedLocator)).toBeVisible({
      timeout: 5_000,
    });

    turn = turn === "X" ? "O" : "X";
  }

  // Game is over. Both pages should show "X wins" in the status region.
  await expect(
    hostPage.getByRole("status").filter({ hasText: /X wins|You won/i }),
  ).toBeVisible({ timeout: 5_000 });
  await expect(
    joinPage.getByRole("status").filter({ hasText: /X wins/i }),
  ).toBeVisible({ timeout: 5_000 });

  await context.close();
});
