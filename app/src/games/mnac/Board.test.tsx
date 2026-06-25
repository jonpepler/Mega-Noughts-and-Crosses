import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { mnacSetup, mnacApply } from "./rules";
import { Board } from "./Board";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function wonSubBoardState() {
  // Win sub-board 4 (centre) for X: place X in cells 0,1,2 of board 4
  let s = mnacSetup();
  // X plays board 4, cell 0 -> O forced to board 0
  s = mnacApply(s, { board: 4, cell: 0 }, "X");
  // O plays board 0, cell 4 -> X forced to board 4
  s = mnacApply(s, { board: 0, cell: 4 }, "O");
  // X plays board 4, cell 1 -> O forced to board 1
  s = mnacApply(s, { board: 4, cell: 1 }, "X");
  // O plays board 1, cell 4 -> X forced to board 4
  s = mnacApply(s, { board: 1, cell: 4 }, "O");
  // X plays board 4, cell 2 -> X wins board 4
  s = mnacApply(s, { board: 4, cell: 2 }, "X");
  // s.subResults[4] should now be { status: 'won', by: 'X' }
  return s;
}

// ---------------------------------------------------------------------------
// core interaction
// ---------------------------------------------------------------------------

describe("Board", () => {
  test("clicking a legal cell calls onMove with board and cell", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    render(
      <Board
        state={mnacSetup()}
        myMark="X"
        currentPlayer="X"
        onMove={onMove}
      />,
    );
    await user.click(screen.getByRole("button", { name: /board 4 cell 0/i }));
    expect(onMove).toHaveBeenCalledWith({ board: 4, cell: 0 });
  });

  test("cells outside the forced board are disabled", () => {
    // After X plays board 4 cell 2, O is forced to board 2
    const s = mnacApply(mnacSetup(), { board: 4, cell: 2 }, "X");
    render(
      <Board state={s} myMark="O" currentPlayer="O" onMove={() => {}} />,
    );
    expect(
      screen.getByRole("button", { name: /board 3 cell 0/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /board 2 cell 0/i }),
    ).toBeEnabled();
  });

  test("a cell already filled is disabled", () => {
    // After X plays board 4 cell 2, board 4 cell 2 should be disabled for O
    const s = mnacApply(mnacSetup(), { board: 4, cell: 2 }, "X");
    render(
      <Board state={s} myMark="O" currentPlayer="O" onMove={() => {}} />,
    );
    // board 4 cell 2 is now filled by X and also outside forced board (forced=2)
    expect(
      screen.getByRole("button", { name: /board 4 cell 2/i }),
    ).toBeDisabled();
  });

  test("when it is NOT the local player's turn all cells are disabled", () => {
    // Fresh board - X's turn, but myMark=O so O is not active
    render(
      <Board
        state={mnacSetup()}
        myMark="O"
        currentPlayer="X"
        onMove={() => {}}
      />,
    );
    // All cells should be disabled because it's not O's turn
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(81);
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  test("spectator (myMark=null) sees all cells disabled", () => {
    render(
      <Board
        state={mnacSetup()}
        myMark={null}
        currentPlayer="X"
        onMove={() => {}}
      />,
    );
    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  test("won sub-board renders the winning mark and disables its cells", () => {
    const s = wonSubBoardState();
    render(
      <Board state={s} myMark="O" currentPlayer="O" onMove={() => {}} />,
    );
    // Sub-board 4 was won by X - all its cells should be disabled
    for (let c = 0; c < 9; c++) {
      expect(
        screen.getByRole("button", { name: new RegExp(`board 4 cell ${c}`, "i") }),
      ).toBeDisabled();
    }
    // The winning mark "X" should appear in the won sub-board region
    // (rendered as an overlay) - check data attribute
    // Exactly one sub-board should be won, and it must be sub-board 4
    const wonBoards = document.querySelectorAll('[data-won="true"]');
    expect(wonBoards.length).toBe(1);
    expect(wonBoards[0]).toHaveAttribute(
      "aria-label",
      expect.stringContaining("sub-board 4"),
    );
  });

  test("forced sub-board carries data-forced attribute", () => {
    // After X plays board 4 cell 2, O is forced to board 2
    const s = mnacApply(mnacSetup(), { board: 4, cell: 2 }, "X");
    render(
      <Board state={s} myMark="O" currentPlayer="O" onMove={() => {}} />,
    );
    const forcedBoards = document.querySelectorAll('[data-forced="true"]');
    expect(forcedBoards.length).toBe(1);
  });

  test("clicking a disabled cell does not call onMove", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    // It is X's turn, myMark=O, so all cells disabled
    render(
      <Board
        state={mnacSetup()}
        myMark="O"
        currentPlayer="X"
        onMove={onMove}
      />,
    );
    const btn = screen.getByRole("button", { name: /board 0 cell 0/i });
    await user.click(btn);
    expect(onMove).not.toHaveBeenCalled();
  });
});
