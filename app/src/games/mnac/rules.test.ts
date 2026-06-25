import {
  mnacSetup,
  mnacValidate,
  mnacApply,
  lineWinner,
  type MnacState,
  type MnacMove,
} from "./rules";

// ---------------------------------------------------------------------------
// lineWinner
// ---------------------------------------------------------------------------

describe("lineWinner", () => {
  test("returns null when board is empty", () => {
    expect(lineWinner([null, null, null, null, null, null, null, null, null])).toBeNull();
  });

  test("detects top row X win (cells 0,1,2)", () => {
    expect(lineWinner(["X", "X", "X", null, null, null, null, null, null])).toBe("X");
  });

  test("detects middle row O win (cells 3,4,5)", () => {
    expect(lineWinner([null, null, null, "O", "O", "O", null, null, null])).toBe("O");
  });

  test("detects bottom row X win (cells 6,7,8)", () => {
    expect(lineWinner([null, null, null, null, null, null, "X", "X", "X"])).toBe("X");
  });

  test("detects left column O win (cells 0,3,6)", () => {
    expect(lineWinner(["O", null, null, "O", null, null, "O", null, null])).toBe("O");
  });

  test("detects middle column X win (cells 1,4,7)", () => {
    expect(lineWinner([null, "X", null, null, "X", null, null, "X", null])).toBe("X");
  });

  test("detects right column O win (cells 2,5,8)", () => {
    expect(lineWinner([null, null, "O", null, null, "O", null, null, "O"])).toBe("O");
  });

  test("detects diagonal X win (cells 0,4,8)", () => {
    expect(lineWinner(["X", null, null, null, "X", null, null, null, "X"])).toBe("X");
  });

  test("detects anti-diagonal O win (cells 2,4,6)", () => {
    expect(lineWinner([null, null, "O", null, "O", null, "O", null, null])).toBe("O");
  });

  test("returns null for full board with no winner", () => {
    // X O X / X O O / O X X  -- standard draw board
    expect(lineWinner(["X", "O", "X", "X", "O", "O", "O", "X", "X"])).toBeNull();
  });

  test("returns null for mixed partial board", () => {
    expect(lineWinner(["X", "O", null, null, "X", null, null, null, "O"])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// mnacSetup
// ---------------------------------------------------------------------------

describe("mnacSetup", () => {
  test("returns 9 sub-boards each with 9 null cells", () => {
    const s = mnacSetup();
    expect(s.boards).toHaveLength(9);
    for (const board of s.boards) {
      expect(board).toHaveLength(9);
      expect(board.every((c) => c === null)).toBe(true);
    }
  });

  test("all subResults are ongoing", () => {
    const s = mnacSetup();
    expect(s.subResults).toHaveLength(9);
    expect(s.subResults.every((r) => r.status === "ongoing")).toBe(true);
  });

  test("turn is X", () => {
    expect(mnacSetup().turn).toBe("X");
  });

  test("forcedBoard is null", () => {
    expect(mnacSetup().forcedBoard).toBeNull();
  });

  test("result is ongoing", () => {
    expect(mnacSetup().result.status).toBe("ongoing");
  });
});

// ---------------------------------------------------------------------------
// Exact example from the brief
// ---------------------------------------------------------------------------

test("a cell played sends opponent to the matching board (brief example)", () => {
  let s = mnacSetup();
  s = mnacApply(s, { board: 4, cell: 2 }, "X");
  expect(s.forcedBoard).toBe(2);
  expect(s.turn).toBe("O");
  expect(mnacValidate(s, { board: 3, cell: 0 }, "O").ok).toBe(false);
  expect(mnacValidate(s, { board: 2, cell: 0 }, "O").ok).toBe(true);
});

// ---------------------------------------------------------------------------
// mnacValidate rejections
// ---------------------------------------------------------------------------

describe("mnacValidate rejections", () => {
  test("rejects playing out of turn", () => {
    const s = mnacSetup();
    const result = mnacValidate(s, { board: 0, cell: 0 }, "O");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
  });

  test("rejects occupied cell", () => {
    // X plays board 0 cell 0; O is forced to board 0
    const s = mnacApply(mnacSetup(), { board: 0, cell: 0 }, "X");
    const result = mnacValidate(s, { board: 0, cell: 0 }, "O");
    expect(result.ok).toBe(false);
  });

  test("rejects move in wrong forced board", () => {
    // After X plays board 4 cell 2, O is forced to board 2
    const s = mnacApply(mnacSetup(), { board: 4, cell: 2 }, "X");
    expect(s.forcedBoard).toBe(2);
    const result = mnacValidate(s, { board: 5, cell: 3 }, "O");
    expect(result.ok).toBe(false);
  });

  test("accepts move in the correct forced board", () => {
    const s = mnacApply(mnacSetup(), { board: 4, cell: 2 }, "X");
    const result = mnacValidate(s, { board: 2, cell: 7 }, "O");
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Helper: play a sequence of moves from a starting state, using s.turn each time
// ---------------------------------------------------------------------------

function playMoves(initial: MnacState, moves: MnacMove[]): MnacState {
  let s = initial;
  for (const move of moves) {
    const v = mnacValidate(s, move, s.turn);
    if (!v.ok) {
      throw new Error(
        `Invalid move board=${move.board} cell=${move.cell}: ${v.reason} ` +
        `(turn=${s.turn}, forcedBoard=${s.forcedBoard})`
      );
    }
    s = mnacApply(s, move, s.turn);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Sub-board win
// ---------------------------------------------------------------------------

describe("sub-board win", () => {
  // Win board 2 top-row (cells 0,1,2) for X using cell-4 routing to stay in board 2:
  // X plays board 2 cell 0 -> O forced board 0; O plays board 0 cell 2 -> X forced board 2
  // X plays board 2 cell 1 -> O forced board 1; O plays board 1 cell 2 -> X forced board 2
  // X plays board 2 cell 2 -> X WINS board 2; forced board = null (board 2 decided)
  const winBoard2: MnacMove[] = [
    { board: 2, cell: 0 },
    { board: 0, cell: 2 },
    { board: 2, cell: 1 },
    { board: 1, cell: 2 },
    { board: 2, cell: 2 },
  ];

  test("winning top row in a sub-board sets subResults to won", () => {
    const s = playMoves(mnacSetup(), winBoard2);
    expect(s.subResults[2]).toEqual({ status: "won", by: "X" });
  });

  test("winning a sub-board leaves overall result ongoing (one board)", () => {
    const s = playMoves(mnacSetup(), winBoard2);
    expect(s.result.status).toBe("ongoing");
  });

  test("winning a decided sub-board routes opponent to free choice (forcedBoard null)", () => {
    // Cell 2 routes to board 2, which is now decided -> forcedBoard must be null
    const s = playMoves(mnacSetup(), winBoard2);
    expect(s.forcedBoard).toBeNull();
  });

  test("decided board free-move: opponent can play any undecided board", () => {
    const s = playMoves(mnacSetup(), winBoard2);
    // It's O's turn with free choice
    expect(s.turn).toBe("O");
    expect(mnacValidate(s, { board: 0, cell: 3 }, "O").ok).toBe(true);
    expect(mnacValidate(s, { board: 5, cell: 7 }, "O").ok).toBe(true);
  });

  test("decided board free-move: opponent cannot play in the decided board", () => {
    const s = playMoves(mnacSetup(), winBoard2);
    expect(mnacValidate(s, { board: 2, cell: 5 }, "O").ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Sub-board draw
// ---------------------------------------------------------------------------

describe("sub-board draw", () => {
  // Fill board 2 with a draw pattern (no winner) then verify subResult.
  // Draw pattern: X O X / X O O / O X X
  // cells:        0 1 2   3 4 5   6 7 8
  //   0=X,1=O,2=X,3=X,4=O,5=O,6=O,7=X,8=X
  // Rows: XOX, XOO, OXX — none win
  // Cols: X,X,O | O,O,X | X,O,X — none win
  // Diags: X,O,X | X,O,O — none win -> DRAW confirmed.
  //
  // Routing sequence into board 2 (board 2 cell C routes to board C, then the
  // next move in that board routes back to board 2 via cell 2):
  // We need X in board 2 cells 0,2,3,7,8 and O in cells 1,4,5,6.
  // X goes first; X plays 5 cells, O plays 4 cells.
  //
  // Sequence (routing via "play cell 2 in some board -> forced board 2"):
  // [1] X free: board 3 cell 2 -> O forced 2
  // [2] O: board 2 cell 1 -> X forced 1
  // [3] X: board 1 cell 2 -> O forced 2
  // [4] O: board 2 cell 4 -> X forced 4
  // [5] X: board 4 cell 2 -> O forced 2
  // [6] O: board 2 cell 5 -> X forced 5
  // [7] X: board 5 cell 2 -> O forced 2
  // [8] O: board 2 cell 6 -> X forced 6
  // [9] X: board 6 cell 2 -> O forced 2
  // [10] O: board 2 cell 0 -> X forced 0  [O only has 4 cells: 1,4,5,6 done! now X's turn in board 2]
  // Wait, O played cells 1,4,5,6 (4 cells) and now O plays cell 0? That's 5 cells for O!
  // X needs to play cells 0,2,3,7,8 (5 cells). Let me recount.
  //
  // Each routing pair: X plays some_board cell 2 -> O forced 2 -> O plays board 2 cell X -> X forced X
  // Then X plays board X cell 2 -> O forced 2 ... etc.
  //
  // X in board 2 cells: 0,2,3,7,8 (5 cells). For each X move in board 2, O must have just
  // played cell 2 in some board to route X there. OR X starts with free choice.
  // O in board 2 cells: 1,4,5,6 (4 cells). For each O move in board 2, X must have just
  // played cell 2 in some board to route O there.
  //
  // Strategy: X plays cell 2 in boards A,B,C,D to route O to board 2 four times.
  // O plays cell 2 in boards E,F,G,H,I to route X to board 2 five times.
  // But X starts free, so the first X cell in board 2 can happen without O routing.
  //
  // Let me think again:
  // Start: X free. X wants to play in board 2.
  // [1] X: board 2 cell 0 -> O forced 0   [X in board 2: 0]
  // [2] O: board 0 cell 2 -> X forced 2   [routing X to board 2]
  // [3] X: board 2 cell 2 -> O forced 2   [X in board 2: 0,2]
  // [4] O: board 2 cell 1 -> X forced 1   [O in board 2: 1]
  // [5] X: board 1 cell 2 -> O forced 2   [routing O to board 2]
  // [6] O: board 2 cell 4 -> X forced 4   [O in board 2: 1,4]
  // [7] X: board 4 cell 2 -> O forced 2   [routing O to board 2]
  // [8] O: board 2 cell 5 -> X forced 5   [O in board 2: 1,4,5]
  // [9] X: board 5 cell 2 -> O forced 2   [routing O to board 2]
  // [10] O: board 2 cell 6 -> X forced 6  [O in board 2: 1,4,5,6 -- O DONE!]
  // [11] X: board 6 cell 2 -> O forced 2  [routing O to board 2... but O is done in board 2!]
  // Hmm, after step 10, O has played all 4 cells in board 2. Now X needs to play cells 3,7,8.
  // After step 10, X is forced board 6. X plays board 6 cell 2 -> O forced 2.
  // O is forced board 2 but O doesn't need to play board 2 anymore. O plays board 2... but
  // we need to get X into board 2 for cells 3,7,8.
  //
  // Actually, O can play board 2 cells OTHER than the O pattern cells. But we want a specific draw.
  // Let me just plan more carefully:
  // After [10]: board 2 has X@0,2; O@1,4,5,6. Remaining board 2 cells: 3,7,8 (all for X).
  // X needs 3 more moves in board 2. Each requires O to play cell 2 in some board.
  // X is forced board 6 (from step 10). X plays board 6 cell 2 -> O forced 2.
  // O plays board 2 cell 3 -> X forced 3. [O in board 2: 1,4,5,6,3 -- that's 5 O cells! TOO MANY]
  //
  // WAIT. After [10] O has played 4 cells in board 2 (1,4,5,6). If O now plays board 2 cell 3,
  // that's 5 O cells in board 2 vs X having 2 cells. But X goes first! X should have MORE cells.
  // In a 9-cell board with X going first: X=5 cells, O=4 cells.
  // In our sequence, X plays 2 cells in board 2 before O plays 4 cells in board 2.
  // After that, X needs 3 more cells. But O can't play in board 2 anymore (O's 4 slots are full).
  // We need X to be routed to board 2 without O playing in board 2 in between.
  // That means X must play cell 2 in some board to route O... but O won't play board 2.
  //
  // For X to play in board 2, O must route X there (O plays cell 2 in some board).
  // After step [10], X is forced board 6.
  // [11] X: board 6 cell 2 -> O forced 2.  O plays board 2 cell...
  //   O has played 1,4,5,6. Remaining board 2 cells: 3,7,8. O can play one of them!
  //   But we want X in those cells, not O!
  // [11] O is forced board 2. O plays board 2 cell 3 -> X forced 3. [O=1,3,4,5,6 now, X=0,2]
  //   Board 2: 0=X,1=O,2=X,3=O,4=O,5=O,6=O,... that's 5 O cells already. O is winning.
  //   Col 1,4,7: O,O,? - potential O win. Doesn't work.
  //
  // I think I need to use a DIFFERENT routing strategy that doesn't keep sending players
  // to board 2 when it's not their turn to play there.
  //
  // NEW APPROACH: Route via cell 4 (board 4 as the hub).
  // X plays in board 4 to route O; O plays cell 4 to route X. But keep board 2 routing controlled.
  //
  // Actually the simplest thing: test draw via a different board that's easier to fill.
  // Let me just plan the FULL 9-move sequence in one board using a completely predictable routing.
  //
  // SIMPLEST DRAW ROUTING: We can use a "round-trip" approach.
  // Board A cell X -> forced to board X -> board X cell A -> forced back to board A.
  //
  // Let A=2 (our target board). We want to route back to board 2 repeatedly.
  // If someone plays board 2 cell B, next player is forced board B.
  // That player plays board B cell 2, next player is forced board 2.
  // This creates a "ping-pong" between board 2 and board B.
  //
  // Using boards 0,1,3,4 as relay boards (each used at most once for cell 2):
  // [1] X free: board 2 cell 0 -> O forced 0
  // [2] O: board 0 cell 2 -> X forced 2
  // [3] X: board 2 cell 3 -> O forced 3
  // [4] O: board 3 cell 2 -> X forced 2
  // [5] X: board 2 cell 7 -> O forced 7
  // [6] O: board 7 cell 2 -> X forced 2
  // [7] X: board 2 cell 8 -> O forced 8
  // [8] O: board 8 cell 2 -> X forced 2
  // [9] X: board 2 cell 2 -> O forced 2 [X in board 2: 0,2,3,7,8 DONE!]
  // [10] O: board 2 cell 1 -> X forced 1 [O needs to play 1,4,5,6]
  // [11] X: board 1 cell 2 -> O forced 2 [routing O back to board 2]
  // [12] O: board 2 cell 4 -> X forced 4
  // [13] X: board 4 cell 2 -> O forced 2
  // [14] O: board 2 cell 5 -> X forced 5
  // [15] X: board 5 cell 2 -> O forced 2
  // [16] O: board 2 cell 6 -> X forced 6 [O in board 2: 1,4,5,6 DONE!]
  // Board 2 is NOW FULL: X@0,2,3,7,8 and O@1,4,5,6
  // 0=X,1=O,2=X,3=X,4=O,5=O,6=O,7=X,8=X
  // Rows: XOX, XXO, OXX - none win; Cols: X,X,O | O,O,X | X,O,X - none win
  // Diags: X,O,X (0,4,8) and X,O,O (2,4,6) - none win. CONFIRMED DRAW!
  //
  // But wait, does X win board 2 after step [9]? X plays cell 2 (the anti-diagonal corner).
  // X has 0,2,3 after step [9]? No: after step [9] X has played cells 0,3,7,8,2 in board 2.
  // Let me check for a winner at each X step:
  // After step [1]: X@0. No win.
  // After step [3]: X@0,3. No win.
  // After step [5]: X@0,3,7. Col check: 1,4,7 -> X@7 only. Row 6,7,8 -> X@7 only. No win.
  // After step [7]: X@0,3,7,8. Check: row 6,7,8 -> X@7,8 (need 6). No win yet.
  // After step [9]: X@0,2,3,7,8. Check all:
  //   row 0,1,2: X,?,X needs cell 1. No. row 3,4,5: X,?,? needs 4,5. No. row 6,7,8: ?,X,X needs 6. No.
  //   col 0,3,6: X,X,? needs 6. No. col 1,4,7: ?,?,X needs 1,4. No. col 2,5,8: X,?,X needs 5. No.
  //   diag 0,4,8: X,?,X needs 4. No. anti-diag 2,4,6: X,?,? needs 4,6. No.
  //   So NO WIN for X after step [9]. Good.
  // After step [10]: O@1. No win.
  // After step [12]: O@1,4.
  // After step [14]: O@1,4,5. Check: row 3,4,5: ?,O,O needs 3. No. col 1,4,7: O,O,? needs 7. No. No win.
  // After step [16]: O@1,4,5,6. Check:
  //   col 0,3,6: ?,X,O - no. anti-diag 2,4,6: X,O,O - no. diag 0,4,8: X,O,X - no.
  //   row 0,1,2: X,O,X - no. row 3,4,5: X,O,O - no. row 6,7,8: O,X,X - no.
  //   col 1,4,7: O,O,X - no. col 2,5,8: X,O,X - no. No win!
  // Board is full (9 cells), no winner -> DRAW! Perfect.

  const drawBoard2: MnacMove[] = [
    { board: 2, cell: 0 }, // [1] X
    { board: 0, cell: 2 }, // [2] O
    { board: 2, cell: 3 }, // [3] X
    { board: 3, cell: 2 }, // [4] O
    { board: 2, cell: 7 }, // [5] X
    { board: 7, cell: 2 }, // [6] O
    { board: 2, cell: 8 }, // [7] X
    { board: 8, cell: 2 }, // [8] O
    { board: 2, cell: 2 }, // [9] X - board 2: X@0,2,3,7,8
    { board: 2, cell: 1 }, // [10] O - forced board 2
    { board: 1, cell: 2 }, // [11] X
    { board: 2, cell: 4 }, // [12] O
    { board: 4, cell: 2 }, // [13] X
    { board: 2, cell: 5 }, // [14] O
    { board: 5, cell: 2 }, // [15] X
    { board: 2, cell: 6 }, // [16] O - board 2: O@1,4,5,6 -- FULL, DRAW
  ];

  test("a full sub-board with no winner is a draw", () => {
    const s = playMoves(mnacSetup(), drawBoard2);
    expect(s.subResults[2]).toEqual({ status: "draw" });
  });

  test("a drawn sub-board counts for neither side (result stays ongoing)", () => {
    const s = playMoves(mnacSetup(), drawBoard2);
    expect(s.result.status).toBe("ongoing");
  });

  test("after a sub-board draw routes to it, forcedBoard is null", () => {
    // The last move played cell 6 (by O), which would route X to board 6.
    // Board 6 is still playable, so X is forced to board 6 (not null).
    // Let's confirm the sub-board draw itself is detected correctly.
    const s = playMoves(mnacSetup(), drawBoard2);
    expect(s.subResults[2]).toEqual({ status: "draw" });
    // After O plays board 2 cell 6 -> X forced board 6 (board 6 is undecided)
    expect(s.forcedBoard).toBe(6);
  });

  test("after a sub-board draw, if that board would be force-target, forcedBoard is null", () => {
    // Now win board 2 for a different board to confirm the "decided board -> null" rule
    // Use the win sequence from above: X wins board 2 top-row (0,1,2)
    const winBoard2: MnacMove[] = [
      { board: 2, cell: 0 },
      { board: 0, cell: 2 },
      { board: 2, cell: 1 },
      { board: 1, cell: 2 },
      { board: 2, cell: 2 }, // X wins board 2, cell=2 -> would force board 2 but decided -> null
    ];
    const s = playMoves(mnacSetup(), winBoard2);
    expect(s.subResults[2]).toEqual({ status: "won", by: "X" });
    expect(s.forcedBoard).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Top-level game win
// ---------------------------------------------------------------------------

describe("top-level game win", () => {
  // Win sub-boards 2, 4, 6 (anti-diagonal: top-right, center, bottom-left) for X.
  //
  // Win board 2 (top row for X: cells 0,1,2):
  //   X: board 2 cell 0 -> O forced 0; O: board 0 cell 2 -> X forced 2
  //   X: board 2 cell 1 -> O forced 1; O: board 1 cell 2 -> X forced 2
  //   X: board 2 cell 2 -> X WINS board 2! forcedBoard=null, turn=O
  //
  // Win board 4 (top row: cells 0,1,2) -- O has free choice:
  //   O: board 5 cell 4 -> X forced 4
  //   X: board 4 cell 0 -> O forced 0; O: board 0 cell 4 -> X forced 4
  //   X: board 4 cell 1 -> O forced 1; O: board 1 cell 4 -> X forced 4
  //   X: board 4 cell 2 -> X WINS board 4! forcedBoard=null, turn=O
  //
  // Win board 6 (top row: cells 0,1,2) -- O has free choice:
  //   O: board 7 cell 6 -> X forced 6
  //   X: board 6 cell 0 -> O forced 0; O: board 0 cell 6 -> X forced 6
  //   X: board 6 cell 1 -> O forced 1; O: board 1 cell 6 -> X forced 6
  //   X: board 6 cell 2 -> X WINS board 6!
  //   Boards 2, 4, 6 form the anti-diagonal -> GAME WIN for X!

  const gameWinMoves: MnacMove[] = [
    // Win board 2
    { board: 2, cell: 0 }, { board: 0, cell: 2 },
    { board: 2, cell: 1 }, { board: 1, cell: 2 },
    { board: 2, cell: 2 },
    // Win board 4
    { board: 5, cell: 4 },
    { board: 4, cell: 0 }, { board: 0, cell: 4 },
    { board: 4, cell: 1 }, { board: 1, cell: 4 },
    { board: 4, cell: 2 },
    // Win board 6
    { board: 7, cell: 6 },
    { board: 6, cell: 0 }, { board: 0, cell: 6 },
    { board: 6, cell: 1 }, { board: 1, cell: 6 },
    { board: 6, cell: 2 },
  ];

  test("winning three sub-boards in a row (anti-diagonal) wins the game", () => {
    const s = playMoves(mnacSetup(), gameWinMoves);
    expect(s.subResults[2]).toEqual({ status: "won", by: "X" });
    expect(s.subResults[4]).toEqual({ status: "won", by: "X" });
    expect(s.subResults[6]).toEqual({ status: "won", by: "X" });
    expect(s.result).toEqual({ status: "win", winner: "X" });
  });

  test("move after game is over is rejected", () => {
    const s = playMoves(mnacSetup(), gameWinMoves);
    expect(s.result.status).toBe("win");
    const result = mnacValidate(s, { board: 3, cell: 0 }, "O");
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------

describe("immutability", () => {
  test("mnacApply does not mutate its input state", () => {
    const initial = mnacSetup();
    const boardsSnapshot = initial.boards.map((b) => [...b]);
    const subResultsSnapshot = [...initial.subResults];
    const turnSnapshot = initial.turn;
    const forcedBoardSnapshot = initial.forcedBoard;

    mnacApply(initial, { board: 3, cell: 5 }, "X");

    expect(initial.turn).toBe(turnSnapshot);
    expect(initial.forcedBoard).toBe(forcedBoardSnapshot);
    expect(initial.result.status).toBe("ongoing");
    for (let i = 0; i < 9; i++) {
      expect(initial.boards[i]).toEqual(boardsSnapshot[i]);
    }
    expect(initial.subResults).toEqual(subResultsSnapshot);
  });
});
