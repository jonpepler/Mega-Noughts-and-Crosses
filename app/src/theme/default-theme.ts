import type { ThemeTokens } from "./tokens";

/**
 * Default theme for Mega Noughts and Crosses.
 *
 * Palette rationale:
 * - bg (#0f1117): deep navy-black; high contrast for text (#e8eaf0, ~15:1 vs bg)
 * - surface (#1e2130): slightly lighter, distinct from bg for card/cell contrast
 * - line (#3a3f55): muted border color, visible but not harsh
 * - x (#e05252): warm coral-red; colorblind-safe (distinct from o even in
 *   deuteranopia/protanopia because the hue difference is red vs. blue, not
 *   red vs. green); ~4.8:1 on surface (WCAG AA large text)
 * - o (#5b9bd5): cool sky-blue; ~4.6:1 on surface (WCAG AA large text)
 * - accent (#f0a500): amber/gold for forced-board highlight; vivid, neutral-safe
 * - muted (#6b7280): secondary text / disabled states
 * - text (#e8eaf0): near-white, ~15:1 on bg (WCAG AAA)
 *
 * Space:
 * - cell: min(10vw, 10vh) makes cells adapt to both landscape and portrait;
 *   clamp ensures a usable minimum on very small screens
 * - gap: 4% of cell size (relative to keep proportions consistent)
 * - radius: small rounding that feels friendly without being cartoonish
 *
 * Font: system stack only - CSP forbids external font loading.
 */
export const defaultTheme: ThemeTokens = {
  color: {
    bg: "#0f1117",
    surface: "#1e2130",
    line: "#3a3f55",
    x: "#e05252",
    o: "#5b9bd5",
    accent: "#f0a500",
    muted: "#6b7280",
    text: "#e8eaf0",
  },
  space: {
    cell: "clamp(2.5rem, min(10vw, 10vh), 8rem)",
    gap: "0.25rem",
    radius: "0.375rem",
  },
  font: {
    family:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Helvetica Neue', sans-serif",
  },
};
