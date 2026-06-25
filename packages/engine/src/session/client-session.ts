import type { GameDefinition, GameResult } from "../game";
import type { PeerId, Transport, TransportMessage } from "../transport/transport";
import {
  MSG,
  type AssignRolePayload,
  type GameRoom,
  type StatePayload,
} from "./session";

/**
 * Join a host-authoritative session as a client. The client never mutates game
 * state itself: `makeMove` only sends a move-intent to the host, and local state
 * is replaced solely by the host's confirmed `state` broadcasts. It learns its
 * role from the host's `assign-role` message.
 */
export function joinClient<S, M>(
  def: GameDefinition<S, M>,
  transport: Transport,
): GameRoom<S, M> {
  let state: S | null = null;
  let result: GameResult<string> = { status: "ongoing" };
  let players: string[] = [];
  let connectedPlayers: string[] = [];
  let myRole: string | null = null;
  let currentPlayer: string | null = null;
  let seq = 0;

  // The peer id of the host, learned at discovery time (when the client sends
  // its `hello`). Only messages from this peer are trusted for `state` and
  // `assign-role`; anything from a different sender is ignored.
  let hostId: PeerId | null = null;

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
        notify();
        break;
      }
      // `rejected` carries no state change; the client simply keeps its last
      // confirmed state. (Surfacing the reason is left to a future task.)
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
    if (hostId === null) {
      hostId = peerId;
    }
    transport.send(MSG.hello, {}, peerId);
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
      unsubMessage();
      unsubJoin();
      subscribers.clear();
      transport.leave();
    },
  };

  // `def` is part of the signature (Task 5 / parity with the host) and reserved
  // for client-side prediction; today the host is authoritative so it is unused.
  void def;

  return room;
}
