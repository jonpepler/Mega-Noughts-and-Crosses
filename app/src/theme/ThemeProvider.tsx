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

  const style: React.CSSProperties & Record<string, string> = {
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

  return <div style={style}>{children}</div>;
}
