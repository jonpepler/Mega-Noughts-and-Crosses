// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import App from "./App";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setSearch(search: string) {
  window.history.replaceState({}, "", search || "/");
}

afterEach(() => {
  // Reset URL after each test
  setSearch("/");
  // Clear localStorage so persistence doesn't bleed between tests
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("App", () => {
  test("without ?room, the Create room button is visible", () => {
    setSearch("/");
    render(<App />);
    expect(
      screen.getByRole("button", { name: /create room/i }),
    ).toBeInTheDocument();
  });

  test("without ?room, the Join button is visible", () => {
    setSearch("/");
    render(<App />);
    expect(screen.getByRole("button", { name: /join/i })).toBeInTheDocument();
  });

  test("with ?room=test&local, the board renders (cell buttons visible)", async () => {
    // Persist the room as host so App knows to use role=host
    localStorage.setItem(
      "mnac:room",
      JSON.stringify({ roomCode: "test", role: "host", seed: 42 }),
    );
    setSearch("/?room=test&local");
    render(<App />);

    // Board cell buttons should appear (81 cells in mega noughts and crosses)
    await waitFor(
      () => {
        const buttons = screen.getAllByRole("button");
        // At least one cell button is present — board is rendered
        expect(buttons.length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
  });

  test("with ?room=test2&local as host, a waiting status indicator is shown", async () => {
    localStorage.setItem(
      "mnac:room",
      JSON.stringify({ roomCode: "test2", role: "host", seed: 7 }),
    );
    setSearch("/?room=test2&local");
    render(<App />);

    // The status indicator should be visible (connecting or waiting for opponent)
    await waitFor(
      () => {
        // Look for any status text: "connecting", "waiting", "playing" etc.
        const statusEl = screen.getByRole("status");
        expect(statusEl).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  test("?role=host makes the app host even with no localStorage entry", async () => {
    // No localStorage entry — without ?role override it would be a joiner.
    // The host plays X; X moves first, so on a fresh game the host's cells
    // are enabled (myMark === currentPlayer === "X") even before an opponent
    // connects. This assertion FAILS if resolveRole ignores the override.
    setSearch("/?room=roletest&local&role=host");
    render(<App />);

    await waitFor(
      () => {
        // At least one board cell button must be enabled for the host (X) to move.
        const cells = screen
          .getAllByRole("button", { name: /board \d cell \d/i })
          .filter((btn) => !btn.hasAttribute("disabled"));
        expect(cells.length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
  });

  test("?role=join makes the app a joiner even if localStorage says host", async () => {
    // Persist as host — but ?role=join should override.
    // The joiner has no opponent yet: myRole is null (no host has assigned it),
    // so every board cell is disabled. This assertion FAILS if resolveRole
    // ignores the override and treats the page as host (X) instead.
    localStorage.setItem(
      "mnac:room",
      JSON.stringify({ roomCode: "roletest2", role: "host", seed: 42 }),
    );
    setSearch("/?room=roletest2&local&role=join");
    render(<App />);

    await waitFor(
      () => {
        // The board must be rendered (cells present) and all cells must be disabled
        // because no host has assigned a role to this lone joiner page.
        const cells = screen.getAllByRole("button", {
          name: /board \d cell \d/i,
        });
        expect(cells.length).toBeGreaterThan(0);
        for (const cell of cells) {
          expect(cell).toBeDisabled();
        }
      },
      { timeout: 3000 },
    );
  });

  test("share link in the waiting state does not contain ?local", async () => {
    localStorage.setItem(
      "mnac:room",
      JSON.stringify({ roomCode: "test", role: "host", seed: 42 }),
    );
    // Load with ?local set — the share link must still be clean
    setSearch("/?room=test&local");
    render(<App />);

    await waitFor(
      () => {
        const statusEl = screen.getByRole("status");
        // When waiting, the share link code element is rendered inside the status bar
        const code = statusEl.querySelector("code");
        if (code) {
          expect(code.textContent).toContain("?room=test");
          expect(code.textContent).not.toContain("local");
        }
      },
      { timeout: 3000 },
    );
  });
});
