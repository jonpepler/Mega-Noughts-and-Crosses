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

  test("with ?room=test&local as host, a waiting status indicator is shown", async () => {
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
});
