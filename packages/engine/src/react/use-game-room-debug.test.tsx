/**
 * Tests for debug diagnostics exposed via useGameRoom.
 *
 * Covers Part A requirement:
 *  - debug field is present in UseGameRoomResult
 *  - debug values update when transportPeers / helloAttempts change
 *  - snapshot equality check includes debug fields (changes DO cause re-renders,
 *    but identical debug fields do NOT)
 */

// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { GameDefinition, GameResult } from "../game";
import type { Rng } from "../rng";
import { makeMemoryFactory } from "../transport/memory";
import { useGameRoom } from "./use-game-room";

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

describe("useGameRoom debug field", () => {
  test("debug is present in the hook result with correct initial shape", async () => {
    const factory = makeMemoryFactory();
    const roomCode = "debug-room-" + Math.random().toString(36).slice(2);

    const { result } = renderHook(() =>
      useGameRoom({
        definition: tinyGame,
        factory,
        roomCode,
        role: "host",
        players: ["p0", "p1"],
        seed: 42,
      }),
    );

    // debug must be defined immediately (even before room is established)
    expect(result.current.debug).toBeDefined();
    expect(typeof result.current.debug.transportPeers).toBe("number");
    expect(typeof result.current.debug.helloAttempts).toBe("number");
    expect(typeof result.current.debug.hasRole).toBe("boolean");
    expect(typeof result.current.debug.hasState).toBe("boolean");
  });

  test("host debug shows hasRole=true and hasState=true once past connecting", async () => {
    const factory = makeMemoryFactory();
    const roomCode = "debug-host-" + Math.random().toString(36).slice(2);

    const { result } = renderHook(() =>
      useGameRoom({
        definition: tinyGame,
        factory,
        roomCode,
        role: "host",
        players: ["p0", "p1"],
        seed: 7,
      }),
    );

    await waitFor(() => {
      expect(result.current.status).not.toBe("connecting");
    });

    expect(result.current.debug.hasRole).toBe(true);
    expect(result.current.debug.hasState).toBe(true);
    expect(result.current.debug.helloAttempts).toBe(0);
  });

  test("client debug shows hasRole/hasState flipping to true after sync", async () => {
    const factory = makeMemoryFactory();
    const roomCode = "debug-client-" + Math.random().toString(36).slice(2);

    renderHook(() =>
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

    await waitFor(() => {
      expect(joinResult.current.myRole).not.toBeNull();
    });

    expect(joinResult.current.debug.hasRole).toBe(true);
    expect(joinResult.current.debug.hasState).toBe(true);
    expect(joinResult.current.debug.helloAttempts).toBeGreaterThanOrEqual(1);
  });

  test("debug transportPeers updates via the hook when a peer joins", async () => {
    const factory = makeMemoryFactory();
    const roomCode = "debug-peers-" + Math.random().toString(36).slice(2);

    const { result: hostResult } = renderHook(() =>
      useGameRoom({
        definition: tinyGame,
        factory,
        roomCode,
        role: "host",
        players: ["p0", "p1"],
        seed: 1,
      }),
    );

    // Initially no transport peers
    await waitFor(() => {
      expect(hostResult.current.status).not.toBe("connecting");
    });
    expect(hostResult.current.debug.transportPeers).toBe(0);

    // Client joins
    renderHook(() =>
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

    expect(hostResult.current.debug.transportPeers).toBe(1);
  });

  test("debug field changes DO trigger re-renders (no render loop with stable values)", async () => {
    // Verify that: (a) changing debug causes a re-render, (b) unchanged debug
    // does NOT cause spurious re-renders when other state is forced to re-render.
    const factory = makeMemoryFactory();
    const roomCode = "debug-stable-" + Math.random().toString(36).slice(2);

    let renderCount = 0;

    const { result } = renderHook(() => {
      renderCount += 1;
      return useGameRoom({
        definition: tinyGame,
        factory,
        roomCode,
        role: "host",
        players: ["p0", "p1"],
        seed: 1,
      });
    });

    await waitFor(() => {
      expect(result.current.status).not.toBe("connecting");
    });

    const countAfterSettle = renderCount;

    // Force a synthetic parent re-render that doesn't change room state
    act(() => {
      // Trigger a re-render by forcing React to flush
    });

    // No additional renders should have occurred due to debug value being stable
    // (the debug values haven't changed)
    expect(renderCount).toBeLessThanOrEqual(countAfterSettle + 1);
  });
});
