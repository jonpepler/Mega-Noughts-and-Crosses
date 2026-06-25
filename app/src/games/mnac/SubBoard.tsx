import React from "react";
import type { Mark, CellIndex, MnacState, MnacMove, SubResult } from "./rules";
import { mnacValidate } from "./rules";
import { Cell } from "./Cell";

export interface SubBoardProps {
  boardIndex: CellIndex;
  state: MnacState;
  subResult: SubResult;
  myMark: Mark | null;
  currentPlayer: Mark | null;
  isForced: boolean;
  onMove: (move: MnacMove) => void;
}

export function SubBoard({
  boardIndex,
  state,
  subResult,
  myMark,
  currentPlayer,
  isForced,
  onMove,
}: SubBoardProps): React.JSX.Element {
  const cells = state.boards[boardIndex];

  const containerStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(3, var(--space-cell))",
    gridTemplateRows: "repeat(3, var(--space-cell))",
    gap: "var(--space-gap)",
    position: "relative",
    padding: "var(--space-gap)",
    borderRadius: "var(--space-radius)",
    backgroundColor: isForced ? "color-mix(in srgb, var(--color-accent) 15%, transparent)" : "transparent",
    outline: isForced ? "2px solid var(--color-accent)" : "2px solid var(--color-line)",
    outlineOffset: "1px",
    boxSizing: "border-box",
  };

  // Won or drawn sub-board overlay
  const isDecided = subResult.status !== "ongoing";
  const winner = subResult.status === "won" ? subResult.by : null;

  const overlayStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "calc(var(--space-cell) * 1.8)",
    fontWeight: "bold",
    fontFamily: "var(--font-family)",
    color: winner === "X" ? "var(--color-x)" : winner === "O" ? "var(--color-o)" : "var(--color-muted)",
    backgroundColor: "color-mix(in srgb, var(--color-surface) 80%, transparent)",
    borderRadius: "var(--space-radius)",
    pointerEvents: "none",
    zIndex: 1,
  };

  return (
    <div
      style={containerStyle}
      data-forced={isForced ? "true" : undefined}
      data-won={isDecided ? "true" : undefined}
      aria-label={`sub-board ${boardIndex}${isForced ? " (forced)" : ""}${winner ? ` won by ${winner}` : subResult.status === "draw" ? " drawn" : ""}`}
    >
      {cells.map((mark, cellIdx) => {
        const cellIndex = cellIdx as CellIndex;
        const move: MnacMove = { board: boardIndex, cell: cellIndex };

        // A cell is enabled only when myMark is not null, it's our turn,
        // and mnacValidate says the move is ok. Legality (including decided
        // sub-boards) is determined solely by mnacValidate.
        const validation =
          myMark !== null && currentPlayer === myMark
            ? mnacValidate(state, move, myMark)
            : { ok: false as const };
        const isDisabled = !validation.ok;

        return (
          <Cell
            key={cellIndex}
            boardIndex={boardIndex}
            cellIndex={cellIndex}
            mark={mark}
            disabled={isDisabled}
            onClick={() => onMove(move)}
          />
        );
      })}

      {isDecided && (
        <div style={overlayStyle} aria-hidden="true">
          {winner ?? "="}
        </div>
      )}
    </div>
  );
}
