import type { GameDefinition, GameResult } from "../game";
import { makeRng } from "../rng";
import type { PeerId, Transport, TransportMessage } from "../transport/transport";
import {
  MSG,
  type GameRoom,
  type MoveIntentPayload,
  type StatePayload,
} from "./session";

/**
 * Start a host-authoritative session. The host holds the only canonical state:
 * it builds it from `def.setup`, occupies `players[0]`, assigns each connecting
 * peer the next unfilled roster slot, and is the sole authority on whether a
 * move is applied. Clients merely render what the host confirms.
 */
export function startHost<S, M>(
  def: GameDefinition<S, M>,
  transport: Transport,
  opts: { seed: number; players: string[] },
): GameRoom<S, M> {
  const players = [...opts.players];
  const rng = makeRng(opts.seed);
  let canonical: S = def.setup(players, rng);

  const myRole = players[0] ?? null;
  // peerId -> assigned PlayerId. Slot 0 is the host itself (no peer).
  const roleByPeer = new Map<PeerId, string>();
  // The next roster slot to hand out; slot 0 is the host.
  let nextSlot = 1;

  const subscribers = new Set<() => void>();
  function notify(): void {
    for (const cb of subscribers) cb();
  }

  let lastRejection: { reason: string; seq: number } | null = null;

  /**
   * The host's authoritative set of currently-connected roles, in roster order.
   * The host (players[0]) is always present; assigned peers are added on hello
   * and removed on leave. This is the source of truth for presence — the hook
   * derives its connection count and status from it rather than counting peer
   * events itself.
   */
  function connectedPlayers(): string[] {
    const connected = new Set<string>(roleByPeer.values());
    if (myRole !== null) connected.add(myRole);
    return players.filter((role) => connected.has(role));
  }

  /** Project canonical state for a given role (identity when no view). */
  function projectFor(role: string): S {
    return def.view ? def.view(canonical, role) : canonical;
  }

  function currentResult(): GameResult<string> {
    return def.getResult(canonical) as GameResult<string>;
  }

  function statePayloadFor(role: string): StatePayload<S> {
    return {
      state: projectFor(role),
      result: currentResult(),
      players,
      connectedPlayers: connectedPlayers(),
      currentPlayer: def.currentPlayer(canonical),
    };
  }

  /** Send each connected peer its own projected snapshot of canonical state. */
  function broadcastState(): void {
    for (const [peerId, role] of roleByPeer) {
      transport.send(MSG.state, statePayloadFor(role), peerId);
    }
  }

  /** Try to apply a move by `by`; returns the rejection reason or null on success. */
  function tryApply(move: M, by: string): string | null {
    if (def.currentPlayer(canonical) !== by) {
      return "not your turn";
    }
    const validation = def.validateMove(canonical, move, by);
    if (!validation.ok) return validation.reason;
    canonical = def.applyMove(canonical, move, by, rng);
    return null;
  }

  /** Assign the next free roster slot to a peer (idempotent per peer). */
  function assignRole(peerId: PeerId): void {
    if (roleByPeer.has(peerId)) {
      // Already known: re-send role + state in case the hello was a retry.
      const role = roleByPeer.get(peerId) as string;
      transport.send(MSG.assignRole, { playerId: role }, peerId);
      transport.send(MSG.state, statePayloadFor(role), peerId);
      return;
    }
    const role = players[nextSlot];
    if (role === undefined) return; // roster full; newcomer is a spectator
    nextSlot += 1;
    roleByPeer.set(peerId, role);
    transport.send(MSG.assignRole, { playerId: role }, peerId);
    transport.send(MSG.state, statePayloadFor(role), peerId);
    // A newly-connected role changes the authoritative presence set: refresh
    // every peer's view (so their connectedPlayers update) and our own.
    broadcastState();
    notify();
  }

  const unsubMessage = transport.onMessage((msg: TransportMessage) => {
    if (msg.type === MSG.hello) {
      // Discovery is client-initiated: respond with a role + initial state.
      assignRole(msg.from);
      return;
    }
    if (msg.type !== MSG.moveIntent) return;
    const { move, seq } = msg.payload as MoveIntentPayload<M>;
    const by = roleByPeer.get(msg.from);
    if (by === undefined) {
      transport.send(MSG.rejected, { reason: "no assigned role", seq }, msg.from);
      return;
    }
    const reason = tryApply(move, by);
    if (reason !== null) {
      transport.send(MSG.rejected, { reason, seq }, msg.from);
      return;
    }
    lastRejection = null;
    broadcastState();
    notify();
  });

  const unsubLeave = transport.onPeerLeave((peerId: PeerId) => {
    if (!roleByPeer.delete(peerId)) return; // a spectator (no role) left
    // A connected role dropped: refresh remaining peers and our own subscribers
    // so presence-derived views (e.g. status) update without a manual counter.
    broadcastState();
    notify();
  });

  const room: GameRoom<S, M> = {
    get state(): S | null {
      return myRole === null ? canonical : projectFor(myRole);
    },
    get result(): GameResult<string> {
      return currentResult();
    },
    players,
    get connectedPlayers(): string[] {
      return connectedPlayers();
    },
    myRole,
    get currentPlayer(): string | null {
      return def.currentPlayer(canonical);
    },
    get lastRejection(): { reason: string; seq: number } | null {
      return lastRejection;
    },
    makeMove(move: M): void {
      if (myRole === null) return;
      const reason = tryApply(move, myRole);
      if (reason !== null) {
        // Surface the rejection to the host's own subscribers.
        lastRejection = { reason, seq: 0 };
        notify();
        return;
      }
      // Successful apply: clear any stale rejection.
      lastRejection = null;
      broadcastState();
      notify();
    },
    subscribe(cb: () => void): () => void {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
    leave(): void {
      unsubMessage();
      unsubLeave();
      subscribers.clear();
      transport.leave();
    },
  };

  return room;
}
