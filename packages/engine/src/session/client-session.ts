import type { GameResult } from "../game";
import type { PeerId, Transport, TransportMessage } from "../transport/transport";
import {
  MSG,
  type AssignRolePayload,
  type GameRoom,
  type RejectedPayload,
  type StatePayload,
} from "./session";

/**
 * Join a host-authoritative session as a client. The client never mutates game
 * state itself: `makeMove` only sends a move-intent to the host, and local state
 * is replaced solely by the host's confirmed `state` broadcasts. It learns its
 * role from the host's `assign-role` message.
 */
/** How often the client re-sends `hello` while still waiting to sync, and the
 * cap on attempts so a never-answering host cannot loop forever. */
const DEFAULT_HELLO_RETRY_MS = 1000;
const MAX_HELLO_ATTEMPTS = 30;

export interface JoinClientOptions {
  /** Interval between `hello` re-sends while the handshake is incomplete. */
  helloRetryMs?: number;
}

export function joinClient<S, M>(
  transport: Transport,
  opts: JoinClientOptions = {},
): GameRoom<S, M> {
  const helloRetryMs = opts.helloRetryMs ?? DEFAULT_HELLO_RETRY_MS;
  let state: S | null = null;
  let result: GameResult<string> = { status: "ongoing" };
  let players: string[] = [];
  let connectedPlayers: string[] = [];
  let myRole: string | null = null;
  let currentPlayer: string | null = null;
  let seq = 0;
  let lastRejection: { reason: string; seq: number } | null = null;

  // The peer id of the host, learned at discovery time (when the client sends
  // its `hello`). Only messages from this peer are trusted for `state` and
  // `assign-role`; anything from a different sender is ignored.
  let hostId: PeerId | null = null;

  // Self-healing handshake. The first `hello` can be dropped if the WebRTC
  // data channel is not open yet (and so can the host's reply), so we re-send
  // `hello` on an interval until we have BOTH our role and at least one state,
  // then stop. Capped so a never-answering host cannot loop forever, and torn
  // down on leave so there are no post-leave sends.
  let left = false;
  let helloTimer: ReturnType<typeof setInterval> | null = null;
  let helloAttempts = 0;

  function isSynced(): boolean {
    return myRole !== null && state !== null;
  }

  function stopHelloRetry(): void {
    if (helloTimer !== null) {
      clearInterval(helloTimer);
      helloTimer = null;
    }
  }

  function startHelloRetry(): void {
    if (helloTimer !== null) return; // already retrying
    helloTimer = setInterval(() => {
      if (left || hostId === null) {
        stopHelloRetry();
        return;
      }
      if (isSynced() || helloAttempts >= MAX_HELLO_ATTEMPTS) {
        // Synced, or we have exhausted retries: give up and stay as-is.
        stopHelloRetry();
        return;
      }
      helloAttempts += 1;
      transport.send(MSG.hello, {}, hostId);
    }, helloRetryMs);
  }

  const subscribers = new Set<() => void>();
  function notify(): void {
    for (const cb of subscribers) cb();
  }

  const unsubMessage = transport.onMessage((msg: TransportMessage) => {
    switch (msg.type) {
      case MSG.assignRole: {
        // Only trust role assignments from the known host.
        if (hostId === null || msg.from !== hostId) break;
        const payload = msg.payload as AssignRolePayload;
        myRole = payload.playerId;
        if (isSynced()) stopHelloRetry();
        notify();
        break;
      }
      case MSG.state: {
        // Only apply state updates from the known host.
        if (hostId === null || msg.from !== hostId) break;
        const payload = msg.payload as StatePayload<S>;
        state = payload.state;
        result = payload.result;
        players = payload.players;
        connectedPlayers = payload.connectedPlayers;
        currentPlayer = payload.currentPlayer;
        // Clear any stale rejection now that we have a fresh authoritative state.
        lastRejection = null;
        if (isSynced()) stopHelloRetry();
        notify();
        break;
      }
      case MSG.rejected: {
        // Only trust rejections from the known host.
        if (hostId === null || msg.from !== hostId) break;
        const payload = msg.payload as RejectedPayload;
        lastRejection = { reason: payload.reason, seq: payload.seq };
        notify();
        break;
      }
      default:
        break;
    }
  });

  // Discovery is client-initiated: announce ourselves once we see a peer (the
  // host). The memory transport delivers onPeerJoin for the already-present host
  // on a macrotask after construction, so this fires reliably regardless of
  // join ordering. We latch that peer's id as hostId before sending hello, so
  // messages arriving from the host are accepted as soon as they land.
  const unsubJoin = transport.onPeerJoin((peerId: PeerId) => {
    if (left) return;
    if (hostId === null) {
      hostId = peerId;
    }
    // Send the first hello immediately; the interval is the recovery path for
    // when this one (or the host's reply) is dropped on a not-yet-open channel.
    transport.send(MSG.hello, {}, peerId);
    if (!isSynced()) startHelloRetry();
  });

  const room: GameRoom<S, M> = {
    get state(): S | null {
      return state;
    },
    get result(): GameResult<string> {
      return result;
    },
    get players(): string[] {
      return players;
    },
    get connectedPlayers(): string[] {
      return connectedPlayers;
    },
    get myRole(): string | null {
      return myRole;
    },
    get currentPlayer(): string | null {
      return currentPlayer;
    },
    get lastRejection(): { reason: string; seq: number } | null {
      return lastRejection;
    },
    makeMove(move: M): void {
      seq += 1;
      // Unicast the intent to the host only so it does not leak to spectators.
      transport.send(MSG.moveIntent, { move, seq }, hostId ?? undefined);
    },
    subscribe(cb: () => void): () => void {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
    leave(): void {
      left = true;
      stopHelloRetry();
      unsubMessage();
      unsubJoin();
      subscribers.clear();
      transport.leave();
    },
  };

  return room;
}
