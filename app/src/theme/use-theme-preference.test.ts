// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useThemePreference } from "./use-theme-preference";

// ---------------------------------------------------------------------------
// matchMedia stub
// ---------------------------------------------------------------------------

type MatchMediaListener = (e: { matches: boolean }) => void;

function makeMatchMediaStub(prefersLight: boolean) {
  const listeners: MatchMediaListener[] = [];
  const mql = {
    matches: prefersLight,
    addEventListener(_: string, cb: MatchMediaListener) {
      listeners.push(cb);
    },
    removeEventListener(_: string, cb: MatchMediaListener) {
      const idx = listeners.indexOf(cb);
      if (idx !== -1) listeners.splice(idx, 1);
    },
    /** Helper: fire a system preference change in tests */
    _fire(newMatches: boolean) {
      mql.matches = newMatches;
      listeners.forEach((cb) => cb({ matches: newMatches }));
    },
    _listenerCount() {
      return listeners.length;
    },
  };
  return mql;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useThemePreference", () => {
  let mql: ReturnType<typeof makeMatchMediaStub>;

  beforeEach(() => {
    localStorage.clear();
    mql = makeMatchMediaStub(false); // default: system prefers dark
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue(mql),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // System fallback
  // -------------------------------------------------------------------------

  test("defaults to dark when system prefers dark and no override", () => {
    mql = makeMatchMediaStub(false);
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));

    const { result } = renderHook(() => useThemePreference());
    expect(result.current.mode).toBe("dark");
  });

  test("defaults to light when system prefers light and no override", () => {
    mql = makeMatchMediaStub(true);
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));

    const { result } = renderHook(() => useThemePreference());
    expect(result.current.mode).toBe("light");
  });

  // -------------------------------------------------------------------------
  // Manual override beats system
  // -------------------------------------------------------------------------

  test("manual override 'light' beats system dark preference", () => {
    localStorage.setItem("mnac:theme", "light");
    mql = makeMatchMediaStub(false); // system says dark
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));

    const { result } = renderHook(() => useThemePreference());
    expect(result.current.mode).toBe("light");
  });

  test("manual override 'dark' beats system light preference", () => {
    localStorage.setItem("mnac:theme", "dark");
    mql = makeMatchMediaStub(true); // system says light
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));

    const { result } = renderHook(() => useThemePreference());
    expect(result.current.mode).toBe("dark");
  });

  // -------------------------------------------------------------------------
  // Persisted override on init
  // -------------------------------------------------------------------------

  test("reads persisted override from localStorage on init", () => {
    localStorage.setItem("mnac:theme", "light");
    const { result } = renderHook(() => useThemePreference());
    expect(result.current.mode).toBe("light");
  });

  // -------------------------------------------------------------------------
  // toggle() flips and persists
  // -------------------------------------------------------------------------

  test("toggle flips from dark to light", () => {
    const { result } = renderHook(() => useThemePreference());
    expect(result.current.mode).toBe("dark");

    act(() => {
      result.current.toggle();
    });

    expect(result.current.mode).toBe("light");
  });

  test("toggle flips from light to dark", () => {
    mql = makeMatchMediaStub(true);
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));

    const { result } = renderHook(() => useThemePreference());
    expect(result.current.mode).toBe("light");

    act(() => {
      result.current.toggle();
    });

    expect(result.current.mode).toBe("dark");
  });

  test("toggle persists the new mode to localStorage", () => {
    const { result } = renderHook(() => useThemePreference());

    act(() => {
      result.current.toggle();
    });

    expect(localStorage.getItem("mnac:theme")).toBe("light");
  });

  test("after toggle, further system changes are ignored (manual override set)", () => {
    const { result } = renderHook(() => useThemePreference());
    act(() => {
      result.current.toggle(); // dark -> light, sets override
    });
    expect(result.current.mode).toBe("light");

    // Fire a system preference change — should be ignored because override is set
    act(() => {
      mql._fire(false); // system says dark now
    });

    expect(result.current.mode).toBe("light");
  });

  // -------------------------------------------------------------------------
  // System change updates mode when no override
  // -------------------------------------------------------------------------

  test("system change to light updates mode when no manual override", () => {
    // start: system dark, no override -> mode = dark
    const { result } = renderHook(() => useThemePreference());
    expect(result.current.mode).toBe("dark");

    act(() => {
      mql._fire(true); // system switches to light
    });

    expect(result.current.mode).toBe("light");
  });

  test("system change to dark updates mode when no manual override", () => {
    mql = makeMatchMediaStub(true);
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));

    const { result } = renderHook(() => useThemePreference());
    expect(result.current.mode).toBe("light");

    act(() => {
      mql._fire(false); // system switches to dark
    });

    expect(result.current.mode).toBe("dark");
  });

  // -------------------------------------------------------------------------
  // Listener cleanup on unmount
  // -------------------------------------------------------------------------

  test("removes matchMedia listener on unmount", () => {
    const { unmount } = renderHook(() => useThemePreference());
    expect(mql._listenerCount()).toBe(1);

    unmount();

    expect(mql._listenerCount()).toBe(0);
  });
});
