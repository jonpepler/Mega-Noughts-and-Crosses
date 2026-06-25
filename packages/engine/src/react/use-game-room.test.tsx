// @vitest-environment jsdom
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
