import React from "react";
import type { Mark, CellIndex } from "./rules";

export interface CellProps {
  boardIndex: CellIndex;
  cellIndex: CellIndex;
  mark: Mark | null;
  disabled: boolean;
  onClick: () => void;
}

export function Cell({
  boardIndex,
  cellIndex,
  mark,
  disabled,
  onClick,
}: CellProps): React.JSX.Element {
  const label = `board ${boardIndex} cell ${cellIndex}${mark ? ` (${mark})` : ""}`;

  // Cells fill their 1fr grid track in the sub-board and maintain a square
  // shape via aspect-ratio. Font size scales with the container (cqmin).
  // No fixed pixel min-size: on a 360px screen each cell is ~36px which is
  // acceptable for a board game where the board must fit without scrolling.
  const style: React.CSSProperties = {
    width: "100%",
    aspectRatio: "1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "var(--color-surface)",
    border: "1px solid var(--color-line)",
    borderRadius: "var(--space-radius)",
    cursor: disabled ? "not-allowed" : "pointer",
    color: mark === "X" ? "var(--color-x)" : mark === "O" ? "var(--color-o)" : "var(--color-text)",
    // 30cqmin ≈ 30% of the sub-board's smaller container dimension, which
    // reliably renders the X/O marks at ~50% of cell size across all viewports.
    fontSize: "30cqmin",
    fontFamily: "var(--font-family)",
    fontWeight: "bold",
    opacity: disabled && !mark ? 0.5 : 1,
    transition: "background-color 0.15s, opacity 0.15s",
    padding: 0,
    boxSizing: "border-box",
    // As a 1fr grid item the cell must be allowed to shrink below its content,
    // otherwise the mark glyph sets a min-content size that grows that cell's
    // track and distorts the whole sub-board the moment a symbol is placed.
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
    lineHeight: 1,
  };

  return (
    <button
      aria-label={label}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      style={style}
    >
      {mark}
    </button>
  );
}
