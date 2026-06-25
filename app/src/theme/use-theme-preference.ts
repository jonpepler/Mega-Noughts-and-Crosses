import { useCallback, useEffect, useRef, useState } from "react";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "mnac:theme";
const MEDIA_QUERY = "(prefers-color-scheme: light)";

function readSystemMode(): ThemeMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark";
  }
  return window.matchMedia(MEDIA_QUERY).matches ? "light" : "dark";
}

function readInitialMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {
    // localStorage unavailable (SSR / private browsing)
  }
  return readSystemMode();
}

export interface ThemePreference {
  mode: ThemeMode;
  toggle(): void;
}

export function useThemePreference(): ThemePreference {
  const [mode, setMode] = useState<ThemeMode>(readInitialMode);

  // Track whether the user has a manual override so the system-change listener
  // knows whether to follow system changes.
  // Initialise synchronously (not in an effect) so the effect's closure sees
  // the correct value from the first render.
  const hasOverride = useRef<boolean>(
    (() => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored === "light" || stored === "dark";
      } catch {
        return false;
      }
    })(),
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    // No-op when a stored override already exists — the listener would be
    // ignored inside handleChange anyway, so skip attaching it entirely.
    if (hasOverride.current) return;

    const mql = window.matchMedia(MEDIA_QUERY);

    const handleChange = (e: { matches: boolean }) => {
      if (!hasOverride.current) {
        setMode(e.matches ? "light" : "dark");
      }
    };

    mql.addEventListener("change", handleChange);
    return () => {
      mql.removeEventListener("change", handleChange);
    };
  }, []);

  const toggle = useCallback(() => {
    setMode((prev) => {
      const next: ThemeMode = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore
      }
      hasOverride.current = true;
      return next;
    });
  }, []);

  return { mode, toggle };
}
