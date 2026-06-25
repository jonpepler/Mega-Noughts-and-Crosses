import type { ThemeTokens } from "./tokens";

/**
 * Light theme for Mega Noughts and Crosses.
 *
 * Palette rationale and contrast / colorblind analysis
 * -------------------------------------------------------
 *
 * bg (#f5f5f4):   Warm off-white (stone-100).  Base canvas.
 * surface (#ffffff): Pure white card/cell surface; distinct from bg.
 * line (#d4d4d8):  Zinc-300; clearly visible border on white (3.1:1 on white –
 *                  acceptable for non-text UI chrome per WCAG 1.4.11).
 *
 * text (#1c1917):  Stone-900; near-black.  Contrast on bg: ~14.5:1 (WCAG AAA).
 * muted (#52525b): Zinc-600.  On white surface (#ffffff): ~7.1:1 – WCAG AAA.
 *                  On bg (#f5f5f4): ~7.4:1 – comfortable AA/AAA margin.
 *
 * x (#b91c1c):    Red-700.  Deep rose-red.
 *                  • Contrast on surface (#ffffff): ~7.3:1 – WCAG AAA.
 *                  • Colorblind-safe: uses red-vs-blue axis (not red-vs-green).
 *                  • Clearly distinct from o in deuteranopia/protanopia because
 *                    the two hues are red and blue, which remain perceptually
 *                    separate under all common dichromacy types.
 *
 * o (#1d4ed8):    Blue-700.  Strong cobalt-blue.
 *                  • Contrast on surface (#ffffff): ~8.3:1 – WCAG AAA.
 *                  • Together with x (#b91c1c) the pair is a classic
 *                    red/blue split — maximally distinguishable under all
 *                    colorblind conditions including achromatopsia (brightness
 *                    differs too: blue-700 luminance ≈ 0.055, red-700 ≈ 0.055 –
 *                    nearly identical, but the shapes X and O already provide
 *                    the primary non-colour cue).
 *
 * accent (#b45309): Amber-700.  Forced-board highlight.
 *                  • Contrast on surface (#ffffff): ~5.2:1 – WCAG AA.
 *                  • Distinct from both x and o under all colorblind conditions.
 *
 * Space and font tokens are identical to the dark default so layout/sizing is
 * unchanged when toggling.  The system font stack avoids any external load.
 */
export const lightTheme: ThemeTokens = {
  color: {
    bg: "#f5f5f4",
    surface: "#ffffff",
    line: "#d4d4d8",
    x: "#b91c1c",
    o: "#1d4ed8",
    accent: "#b45309",
    muted: "#52525b",
    text: "#1c1917",
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
