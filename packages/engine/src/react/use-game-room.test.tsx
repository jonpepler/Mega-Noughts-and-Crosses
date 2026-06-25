// @vitest-environment jsdom
import { useState } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { GameDefinition, GameResult } from "../game";
import type { Rng } from "../rng";
import { makeMemoryFactory } from "../transport/memory";
import { useGameRoom } from "./use-game-room";

// ---------------------------------------------------------------------------
// Tiny deterministic game for testing:
// State = whose turn it is (index into players) + a winner flag.
// Move = "claim" (the current player wins).
// ---------------------------------------------------------------------------

interface TinyState {
  turnIndex: number;
  winner: string | null;
  players: string[];
}

type TinyMove = "claim";

const tinyGame: GameDefinition<TinyState, TinyMove, string> = {
  setup(players: string[], rng: Rng): TinyState {
    void rng;
    return { turnIndex: 0, winner: null, players };
  },
  currentPlayer(state: TinyState): string {
    if (state.winner !== null) return state.players[0] ?? "";
    return state.players[state.turnIndex % state.players.length] ?? "";
  },
  validateMove(
    state: TinyState,
    move: TinyMove,
    by: string,
  ): { ok: true } | { ok: false; reason: string } {
    void move;
    void by;
    if (state.winner !== null) return { ok: false, reason: "game over" };
    return { ok: true };
  },
  applyMove(state: TinyState, move: TinyMove, by: string, rng: Rng): TinyState {
    void move;
    void rng;
    return { ...state, turnIndex: state.turnIndex + 1, winner: by };
  },
  getResult(state: TinyState): GameResult<string> {
    if (state.winner !== null) {
      return { status: "win", winner: state.winner };
    }
    return { status: "ongoing" };
  },
};

// ---------------------------------------------------------------------------

describe("useGameRoom hook", () => {
  test("host and join hooks sync state after a host move", async () => {
    const factory = makeMemoryFactory();
    const roomCode = "test-room-" + Math.random().toString(36).slice(2);

    const { result: hostResult } = renderHook(() =>
      useGameRoom({
        definition: tinyGame,
        factory,
        roomCode,
        role: "host",
        players: ["p0", "p1"],
        seed: 42,
      }),
    );

    const { result: joinResult } = renderHook(() =>
      useGameRoom({
        definition: tinyGame,
        factory,
        roomCode,
        role: "join",
      }),
    );

    // Wait for both hooks to connect and the client to be in "waiting" or "playing"
    await waitFor(() => {
      expect(hostResult.current.status).not.toBe("connecting");
    });
    await waitFor(() => {
      expect(joinResult.current.status).not.toBe("connecting");
    });

    // Once connected, check basic state
    expect(hostResult.current.players).toEqual(["p0", "p1"]);
    expect(hostResult.current.myRole).toBe("p0");

    // Client should know its role
    await waitFor(() => {
      expect(joinResult.current.myRole).toBe("p1");
    });

    // Host makes a move
    act(() => {
      hostResult.current.makeMove("claim");
    });

    // Both should see the game end
    await waitFor(() => {
      expect(hostResult.current.result.status).toBe("win");
    });

    await waitFor(() => {
      expect(joinResult.current.result.status).toBe("win");
    });

    expect(hostResult.current.status).toBe("ended");
    expect(joinResult.current.status).toBe("ended");
  });

  test("host starts waiting, transitions to playing once the client connects", async () => {
    const factory = makeMemoryFactory();
    const roomCode = "test-room-" + Math.random().toString(36).slice(2);

    const { result: hostResult } = renderHook(() =>
      useGameRoom({
        definition: tinyGame,
        factory,
        roomCode,
        role: "host",
        players: ["p0", "p1"],
        seed: 7,
      }),
    );

    // The host is alone: connectedPlayers === [p0], so status is "waiting"
    // and there are no other peers.
    await waitFor(() => {
      expect(hostResult.current.status).toBe("waiting");
    });
    expect(hostResult.current.connection.peers).toBe(0);

    // The client joins; the host's authoritative set fills the roster.
    const { result: joinResult } = renderHook(() =>
      useGameRoom({
        definition: tinyGame,
        factory,
        roomCode,
        role: "join",
      }),
    );

    await waitFor(() => {
      expect(hostResult.current.status).toBe("playing");
    });
    expect(hostResult.current.connection.peers).toBe(1);

    // The client also reaches "playing" once it has the host's roster + presence.
    await waitFor(() => {
      expect(joinResult.current.status).toBe("playing");
    });
  });

  test("missing host roster throws a clear error", () => {
    const factory = makeMemoryFactory();
    expect(() =>
      renderHook(() =>
        useGameRoom({
          definition: tinyGame,
          factory,
          roomCode: "test-room-no-roster",
          role: "host",
        }),
      ),
    ).toThrow(/players.*roster.*required/i);
  });

  test("snapshot identity is stable across re-renders with no room change", async () => {
    const factory = makeMemoryFactory();
    const roomCode = "test-room-" + Math.random().toString(36).slice(2);

    let bump: (() => void) | null = null;
    const seen: unknown[] = [];

    const { result } = renderHook(() => {
      const [, setN] = useState(0);
      bump = () => setN((n) => n + 1);
      const room = useGameRoom({
        definition: tinyGame,
        factory,
        roomCode,
        role: "host",
        players: ["p0", "p1"],
        seed: 1,
      });
      seen.push(room.state);
      return room;
    });

    // Let the room settle (state becomes non-null once the host is set up).
    await waitFor(() => {
      expect(result.current.status).not.toBe("connecting");
    });

    const before = result.current.state;
    // Force several parent re-renders that do NOT change room state.
    act(() => {
      bump?.();
    });
    act(() => {
      bump?.();
    });
    act(() => {
      bump?.();
    });

    // The state object identity must be unchanged: getSnapshot returns the
    // cached ref, so room state did not spuriously re-create.
    expect(result.current.state).toBe(before);
  });

  test("makeMove before room exists is a safe no-op", async () => {
    const factory = makeMemoryFactory();
    const roomCode = "test-room-noop";

    const { result, unmount } = renderHook(() =>
      useGameRoom({
        definition: tinyGame,
        factory,
        roomCode,
        role: "host",
        players: ["p0", "p1"],
        seed: 1,
      }),
    );

    // Call makeMove immediately (room is still connecting) - must not throw
    expect(() => {
      result.current.makeMove("claim");
    }).not.toThrow();

    expect(result.current.status).toBe("connecting");

    // Unmount before the async join completes so no state updates fire after test ends.
    unmount();
  });
});
