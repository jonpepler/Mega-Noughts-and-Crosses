import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { GameDefinition, GameResult } from "../game";
import type { TransportFactory } from "../transport/transport";
import { joinClient } from "../session/client-session";
import { startHost } from "../session/host-session";
import type { GameRoom } from "../session/session";

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
  myRole: string | null;
  currentPlayer: string | null;
  peers: number;
}

const DEFAULT_SEED = 0;
const INITIAL_RESULT: GameResult<string> = { status: "ongoing" };

/** Build a snapshot from the current room state. */
function snapshotFrom<S, M>(
  room: GameRoom<S, M>,
  peers: number,
): RoomSnapshot<S> {
  return {
    state: room.state,
    result: room.result,
    players: [...room.players],
    myRole: room.myRole,
    currentPlayer: room.currentPlayer,
    peers,
  };
}

/** Check shallow equality for RoomSnapshot to avoid unnecessary re-renders. */
function snapshotsEqual<S>(a: RoomSnapshot<S>, b: RoomSnapshot<S>): boolean {
  if (a === b) return true;
  if (a.state !== b.state) return false;
  if (a.myRole !== b.myRole) return false;
  if (a.currentPlayer !== b.currentPlayer) return false;
  if (a.peers !== b.peers) return false;
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
  return true;
}

/** Derive status from snapshot and whether the room is connected. */
function deriveStatus<S>(
  snapshot: RoomSnapshot<S> | null,
): "connecting" | "waiting" | "playing" | "ended" {
  if (snapshot === null) return "connecting";

  const { result, players, peers } = snapshot;
  if (result.status !== "ongoing") return "ended";

  // "playing" requires enough players to be present; for a 2-player game we
  // need at least 2 players in the roster AND the peer connected.
  const rosterFull = players.length >= 2;
  const peerConnected = peers > 0;

  if (rosterFull && peerConnected) return "playing";
  return "waiting";
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
  const peersRef = useRef(0);

  // The cached snapshot used by useSyncExternalStore. We keep it in a ref so
  // the getSnapshot function always returns a referentially stable value when
  // nothing changed.
  const snapshotRef = useRef<RoomSnapshot<S> | null>(null);

  // Store subscribe/notify refs for useSyncExternalStore.
  const listenersRef = useRef<Set<() => void>>(new Set());

  const notify = useCallback(() => {
    for (const cb of listenersRef.current) cb();
  }, []);

  // Set up the room asynchronously on mount.
  useEffect(() => {
    let unsubRoom: (() => void) | null = null;
    let unsubPeerJoin: (() => void) | null = null;
    let unsubPeerLeave: (() => void) | null = null;

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
          players: players ?? ["host"],
        });
        // Track peers joining/leaving for the host.
        unsubPeerJoin = transport.onPeerJoin(() => {
          peersRef.current += 1;
          if (!unmountedRef.current) {
            // Refresh snapshot and notify.
            snapshotRef.current = snapshotFrom(room, peersRef.current);
            notify();
          }
        });
        unsubPeerLeave = transport.onPeerLeave(() => {
          peersRef.current = Math.max(0, peersRef.current - 1);
          if (!unmountedRef.current) {
            snapshotRef.current = snapshotFrom(room, peersRef.current);
            notify();
          }
        });
      } else {
        room = joinClient(definition, transport);
        // For clients, treat the host as one peer.
        unsubPeerJoin = transport.onPeerJoin(() => {
          peersRef.current += 1;
          if (!unmountedRef.current) {
            snapshotRef.current = snapshotFrom(room, peersRef.current);
            notify();
          }
        });
        unsubPeerLeave = transport.onPeerLeave(() => {
          peersRef.current = Math.max(0, peersRef.current - 1);
          if (!unmountedRef.current) {
            snapshotRef.current = snapshotFrom(room, peersRef.current);
            notify();
          }
        });
      }

      roomRef.current = room;

      // Set an initial snapshot now that the room exists.
      const initial = snapshotFrom(room, peersRef.current);
      snapshotRef.current = initial;

      // Subscribe to room state changes.
      unsubRoom = room.subscribe(() => {
        if (unmountedRef.current) return;
        const next = snapshotFrom(room, peersRef.current);
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
      unsubPeerJoin?.();
      unsubPeerLeave?.();
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
    connection: { peers: snapshot.peers },
  };
}
