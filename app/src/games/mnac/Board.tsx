import React from "react";
import type { Mark, CellIndex, MnacState, MnacMove } from "./rules";
import { SubBoard } from "./SubBoard";

export interface BoardProps {
  state: MnacState;
  myMark: Mark | null;
  currentPlayer: Mark | null;
  onMove: (move: MnacMove) => void;
}

export function Board({
  state,
  myMark,
  currentPlayer,
  onMove,
}: BoardProps): React.JSX.Element {
  // The board container uses vmin so it fits in viewport on mobile and desktop.
  // We avoid a fixed pixel width so it won't overflow on 360px screens.
  // Each sub-board is roughly (3 * cell + 2 * gap + 2 * padding) wide;
  // the board grid is (3 * subboard + 2 * gap) wide.
  // With --space-cell clamp(2.5rem, min(10vw,10vh), 8rem) this stays responsive.

  const boardStyle: React.CSSProperties = {
    display: "inline-grid",
    gridTemplateColumns: "repeat(3, auto)",
    gridTemplateRows: "repeat(3, auto)",
    gap: "calc(var(--space-gap) * 3)",
    padding: "calc(var(--space-gap) * 2)",
    backgroundColor: "var(--color-bg)",
    borderRadius: "var(--space-radius)",
    maxWidth: "100%",
    boxSizing: "border-box",
  };

  return (
    <div
      style={boardStyle}
      role="region"
      aria-label="Mega Noughts and Crosses board"
    >
      {state.boards.map((_cells, boardIdx) => {
        const boardIndex = boardIdx as CellIndex;
        const isForced = state.forcedBoard === boardIndex;

        return (
          <SubBoard
            key={boardIndex}
            boardIndex={boardIndex}
            state={state}
            subResult={state.subResults[boardIndex]}
            myMark={myMark}
            currentPlayer={currentPlayer}
            isForced={isForced}
            onMove={onMove}
          />
        );
      })}
    </div>
  );
}
