import React from "react";
import type { ThemeMode } from "./use-theme-preference";

interface ThemeToggleProps {
  mode: ThemeMode;
  onToggle: () => void;
}

/**
 * Accessible theme toggle button.
 *
 * - aria-label describes the ACTION ("Switch to light theme") rather than the
 *   current state, which is the conventional pattern for toggle buttons that
 *   change appearance rather than show a checked/unchecked state.
 * - Min 40×40 px tap target to meet WCAG 2.5.5 (Target Size).
 * - Styled with CSS vars so it looks right in both dark and light modes.
 * - Positioned fixed top-right so it overlays both lobby and game views.
 */
export function ThemeToggle({
  mode,
  onToggle,
}: ThemeToggleProps): React.JSX.Element {
  const isDark = mode === "dark";
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";
  // Sun ☀ for light, Moon ☾ for dark – clear, no external assets needed
  const glyph = isDark ? "☀" : "☾";

  const style: React.CSSProperties = {
    position: "fixed",
    top: "0.75rem",
    right: "0.75rem",
    zIndex: 9999,
    minWidth: "2.5rem",
    minHeight: "2.5rem",
    padding: "0.5rem 0.6rem",
    fontSize: "1.1rem",
    lineHeight: 1,
    cursor: "pointer",
    border: "1px solid var(--color-line)",
    borderRadius: "var(--space-radius)",
    backgroundColor: "var(--color-surface)",
    color: "var(--color-text)",
    fontFamily: "var(--font-family)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <button
      aria-label={label}
      onClick={onToggle}
      style={style}
      type="button"
    >
      {glyph}
    </button>
  );
}
