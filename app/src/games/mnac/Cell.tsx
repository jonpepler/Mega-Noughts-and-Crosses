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

  const style: React.CSSProperties = {
    width: "var(--space-cell)",
    height: "var(--space-cell)",
    minWidth: "44px",
    minHeight: "44px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "var(--color-surface)",
    border: "1px solid var(--color-line)",
    borderRadius: "var(--space-radius)",
    cursor: disabled ? "not-allowed" : "pointer",
    color: mark === "X" ? "var(--color-x)" : mark === "O" ? "var(--color-o)" : "var(--color-text)",
    fontSize: "calc(var(--space-cell) * 0.5)",
    fontFamily: "var(--font-family)",
    fontWeight: "bold",
    opacity: disabled && !mark ? 0.5 : 1,
    transition: "background-color 0.15s, opacity 0.15s",
    padding: 0,
    boxSizing: "border-box",
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
