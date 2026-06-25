import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { GameDefinition, GameResult } from "../game";
import type { TransportFactory } from "../transport/transport";
import { joinClient } from "../session/client-session";
import { startHost } from "../session/host-session";
import type { GameRoom, GameRoomDebug } from "../session/session";

export interface UseGameRoomOptions<S, M> {
  definition: GameDefinition<S, M>;
  factory: TransportFactory;
  roomCode: string;
  role: "host" | "join";
  /** Required when role === "host". The player roster; host takes players[0]. */
  players?: string[];
  /** Host only. Defaults to a stable value if omitted. */
  seed?: number;
}

export interface UseGameRoomResult<S, M> {
  state: S | null;
  status: "connecting" | "waiting" | "playing" | "ended";
  players: string[];
  myRole: string | null;
  currentPlayer: string | null;
  makeMove(move: M): void;
  result: GameResult<string>;
  connection: { peers: number };
  /** The most recent move-rejection reason, or null if there is none. */
  rejection: { reason: string; seq: number } | null;
  /** Live diagnostics for debugging connection issues. */
  debug: GameRoomDebug;
}

/**
 * A snapshot of the GameRoom at a point in time.
 * We store this as a plain object so useSyncExternalStore can do referential
 * equality checks and avoid spurious re-renders.
 */
interface RoomSnapshot<S> {
  state: S | null;
  result: GameResult<string>;
  players: string[];
  /** The host's authoritative connected roles; presence is derived from this. */
  connectedPlayers: string[];
  myRole: string | null;
  currentPlayer: string | null;
  lastRejection: { reason: string; seq: number } | null;
  debug: GameRoomDebug;
}

const DEFAULT_SEED = 0;
const INITIAL_RESULT: GameResult<string> = { status: "ongoing" };

/** Build a snapshot from the current room state. */
function snapshotFrom<S, M>(room: GameRoom<S, M>): RoomSnapshot<S> {
  return {
    state: room.state,
    result: room.result,
    players: [...room.players],
    connectedPlayers: [...room.connectedPlayers],
    myRole: room.myRole,
    currentPlayer: room.currentPlayer,
    lastRejection: room.lastRejection,
    debug: room.debug,
  };
}

/** Check shallow equality for RoomSnapshot to avoid unnecessary re-renders. */
function snapshotsEqual<S>(a: RoomSnapshot<S>, b: RoomSnapshot<S>): boolean {
  if (a === b) return true;
  if (a.state !== b.state) return false;
  if (a.myRole !== b.myRole) return false;
  if (a.currentPlayer !== b.currentPlayer) return false;
  // Compare result by status and winner/scores
  if (a.result.status !== b.result.status) return false;
  if (a.result.status === "win" && b.result.status === "win") {
    if (a.result.winner !== b.result.winner) return false;
  }
  if (a.result.status === "scored" && b.result.status === "scored") {
    // Simple reference check for scores
    if (a.result.scores !== b.result.scores) return false;
  }
  // Compare players arrays
  if (a.players.length !== b.players.length) return false;
  for (let i = 0; i < a.players.length; i++) {
    if (a.players[i] !== b.players[i]) return false;
  }
  // Compare connectedPlayers element-wise: the host rebuilds this array on each
  // presence change, so a reference check would always report "changed".
  if (a.connectedPlayers.length !== b.connectedPlayers.length) return false;
  for (let i = 0; i < a.connectedPlayers.length; i++) {
    if (a.connectedPlayers[i] !== b.connectedPlayers[i]) return false;
  }
  // Compare lastRejection: treat null/non-null difference, then compare by fields.
  if (a.lastRejection === null && b.lastRejection === null) {
    // fall through to debug comparison
  } else if (a.lastRejection === null || b.lastRejection === null) {
    return false;
  } else {
    if (a.lastRejection.reason !== b.lastRejection.reason) return false;
    if (a.lastRejection.seq !== b.lastRejection.seq) return false;
  }
  // Compare debug fields by value so diagnostic changes trigger re-renders.
  if (a.debug.transportPeers !== b.debug.transportPeers) return false;
  if (a.debug.helloAttempts !== b.debug.helloAttempts) return false;
  if (a.debug.hasRole !== b.debug.hasRole) return false;
  if (a.debug.hasState !== b.debug.hasState) return false;
  return true;
}

/** Derive status from the room snapshot's authoritative connected set. */
function deriveStatus<S>(
  snapshot: RoomSnapshot<S> | null,
): "connecting" | "waiting" | "playing" | "ended" {
  if (snapshot === null) return "connecting";

  const { result, players, connectedPlayers } = snapshot;

  // No roster yet means the client has not received the host's state, so it is
  // still establishing the connection, not playing.
  // The host always starts with a non-empty roster (startHost requires players),
  // so this branch only fires for a joiner before the first state broadcast.
  if (players.length === 0) return "connecting";

  if (result.status !== "ongoing") return "ended";

  // "playing" once every roster player is connected; otherwise still waiting.
  // For the host `players` is the roster it was started with; for the client it
  // is the roster the host reports in its state broadcasts.
  if (connectedPlayers.length < players.length) return "waiting";
  return "playing";
}

export function useGameRoom<S, M>(
  opts: UseGameRoomOptions<S, M>,
): UseGameRoomResult<S, M> {
  const {
    definition,
    factory,
    roomCode,
    role,
    players,
    seed = DEFAULT_SEED,
  } = opts;

  // Refs that outlive renders without causing re-renders themselves.
  const roomRef = useRef<GameRoom<S, M> | null>(null);
  const unmountedRef = useRef(false);

  // The cached snapshot used by useSyncExternalStore. We keep it in a ref so
  // the getSnapshot function always returns a referentially stable value when
  // nothing changed.
  const snapshotRef = useRef<RoomSnapshot<S> | null>(null);

  // Store subscribe/notify refs for useSyncExternalStore.
  const listenersRef = useRef<Set<() => void>>(new Set());

  const notify = useCallback(() => {
    for (const cb of listenersRef.current) cb();
  }, []);

  // The host roster is required up front; fail loudly rather than silently
  // inventing a one-player roster (which would mis-size presence derivation).
  if (role === "host" && (players === undefined || players.length === 0)) {
    throw new Error('useGameRoom: "players" roster is required when role === "host"');
  }

  // Set up the room asynchronously on mount.
  useEffect(() => {
    let unsubRoom: (() => void) | null = null;

    async function setup(): Promise<void> {
      const transport = await factory.join(roomCode);

      // Bail out if unmounted during the async join.
      if (unmountedRef.current) {
        transport.leave();
        return;
      }

      let room: GameRoom<S, M>;
      if (role === "host") {
        room = startHost(definition, transport, {
          seed,
          players: players as string[],
        });
      } else {
        room = joinClient(transport);
      }

      roomRef.current = room;

      // Set an initial snapshot now that the room exists.
      snapshotRef.current = snapshotFrom(room);

      // Subscribe to room state changes. Presence (connection.peers, status) is
      // derived from the room's authoritative connectedPlayers — the session
      // owns the discovery handshake, so the hook keeps no parallel counter.
      unsubRoom = room.subscribe(() => {
        if (unmountedRef.current) return;
        const next = snapshotFrom(room);
        // Only update the ref and notify if something actually changed.
        if (!snapshotsEqual(snapshotRef.current!, next)) {
          snapshotRef.current = next;
          notify();
        }
      });

      // Notify subscribers that we now have a room.
      notify();
    }

    void setup();

    return () => {
      unmountedRef.current = true;
      unsubRoom?.();
      roomRef.current?.leave();
      roomRef.current = null;
    };
  }, []);
  // Note: the empty dependency array is intentional — the room is set up once
  // on mount and torn down on unmount. Changing opts after mount is not
  // a supported pattern for this hook.

  // useSyncExternalStore wires up React's concurrent-safe subscription.
  const snapshot = useSyncExternalStore(
    useCallback((onStoreChange: () => void) => {
      listenersRef.current.add(onStoreChange);
      return () => {
        listenersRef.current.delete(onStoreChange);
      };
    }, []),
    // getSnapshot: return the cached ref value so it is referentially stable
    // when nothing changed.
    useCallback(() => snapshotRef.current, []),
    // getServerSnapshot: always null (SSR-safe).
    useCallback(() => null as RoomSnapshot<S> | null, []),
  );

  const makeMove = useCallback(
    (move: M): void => {
      roomRef.current?.makeMove(move);
    },
    [],
  );

  const NULL_DEBUG: GameRoomDebug = {
    transportPeers: 0,
    helloAttempts: 0,
    hasRole: false,
    hasState: false,
  };

  // Derive output values from snapshot.
  if (snapshot === null) {
    return {
      state: null,
      status: "connecting",
      players: [],
      myRole: null,
      currentPlayer: null,
      makeMove,
      result: INITIAL_RESULT,
      connection: { peers: 0 },
      rejection: null,
      debug: NULL_DEBUG,
    };
  }

  return {
    state: snapshot.state,
    status: deriveStatus(snapshot),
    players: snapshot.players,
    myRole: snapshot.myRole,
    currentPlayer: snapshot.currentPlayer,
    makeMove,
    result: snapshot.result,
    // Peers = everyone connected besides ourselves, per the authoritative set.
    connection: { peers: Math.max(0, snapshot.connectedPlayers.length - 1) },
    rejection: snapshot.lastRejection,
    debug: snapshot.debug,
  };
}
