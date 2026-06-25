export interface ThemeTokens {
  color: {
    bg: string;
    surface: string;
    line: string;
    x: string;
    o: string;
    accent: string;
    muted: string;
    text: string;
  };
  space: {
    cell: string;
    gap: string;
    radius: string;
  };
  font: {
    family: string;
  };
}

export interface ThemeRepository {
  get(): ThemeTokens;
}
