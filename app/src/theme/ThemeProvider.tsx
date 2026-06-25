import React from "react";
import type { ThemeRepository } from "./tokens";
import { defaultTheme } from "./default-theme";

const defaultRepository: ThemeRepository = {
  get: () => defaultTheme,
};

interface ThemeProviderProps {
  theme?: ThemeRepository;
  children: React.ReactNode;
}

export function ThemeProvider({
  theme = defaultRepository,
  children,
}: ThemeProviderProps): React.JSX.Element {
  const tokens = theme.get();

  // CSS custom properties (theme tokens) — must be Record<string,string> for TS.
  const cssVars: Record<string, string> = {
    "--color-bg": tokens.color.bg,
    "--color-surface": tokens.color.surface,
    "--color-line": tokens.color.line,
    "--color-x": tokens.color.x,
    "--color-o": tokens.color.o,
    "--color-accent": tokens.color.accent,
    "--color-muted": tokens.color.muted,
    "--color-text": tokens.color.text,
    "--space-cell": tokens.space.cell,
    "--space-gap": tokens.space.gap,
    "--space-radius": tokens.space.radius,
    "--font-family": tokens.font.family,
  };

  // The wrapper fills the full viewport so the themed background covers the
  // whole screen even when content is short (e.g. the lobby).
  // #root in index.html is already min-height:100dvh with flex-direction:column,
  // so flex:1 here makes this wrapper grow to fill it.
  const layoutStyle: React.CSSProperties = {
    flex: "1",
    display: "flex",
    flexDirection: "column",
    background: "var(--color-bg)",
    color: "var(--color-text)",
    fontFamily: "var(--font-family)",
  };

  const wrapperStyle = Object.assign({}, cssVars, layoutStyle);

  return <div style={wrapperStyle}>{children}</div>;
}
