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
  // The board is a square sized to the smaller of the available screen
  // dimensions (vmin) so it always fits without scrolling on any device.
  // - 92vmin with a 560px cap keeps it large on desktop and safe on phones.
  // - aspect-ratio:1 ensures the height matches the width exactly.
  // - Inner sub-boards use 1fr columns so everything scales proportionally.
  const boardSize = "min(92vmin, 560px)";

  const boardStyle: React.CSSProperties = {
    width: boardSize,
    height: boardSize,
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gridTemplateRows: "repeat(3, 1fr)",
    gap: "calc(var(--space-gap) * 3)",
    padding: "calc(var(--space-gap) * 2)",
    backgroundColor: "var(--color-bg)",
    borderRadius: "var(--space-radius)",
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
