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
  let myRole: string | null = null;
  let currentPlayer: string | null = null;
  let seq = 0;

  const subscribers = new Set<() => void>();
  function notify(): void {
    for (const cb of subscribers) cb();
  }

  const unsubMessage = transport.onMessage((msg: TransportMessage) => {
    switch (msg.type) {
      case MSG.assignRole: {
        const payload = msg.payload as AssignRolePayload;
        myRole = payload.playerId;
        notify();
        break;
      }
      case MSG.state: {
        const payload = msg.payload as StatePayload<S>;
        state = payload.state;
        result = payload.result;
        players = payload.players;
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
  // join ordering.
  const unsubJoin = transport.onPeerJoin((peerId: PeerId) => {
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
    get myRole(): string | null {
      return myRole;
    },
    get currentPlayer(): string | null {
      return currentPlayer;
    },
    makeMove(move: M): void {
      seq += 1;
      transport.send(MSG.moveIntent, { move, seq });
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
