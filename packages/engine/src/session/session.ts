import type { GameResult } from "../game";

/**
 * The shared session runtime contract: the host holds canonical game state,
 * validates and applies moves, and broadcasts confirmed state; clients send
 * move intents and render whatever the host confirms. This module declares the
 * protocol message types and the GameRoom interface both sides implement.
 */

export interface GameRoom<State, Move> {
  /** Last state known locally (host: canonical projection; client: last received). */
  state: State | null;
  result: GameResult<string>;
  /** The roster as known to this peer. */
  players: string[];
  /**
   * The roles currently connected to the session, in roster order, as tracked
   * authoritatively by the host. Always includes the host's own role; grows as
   * peers are assigned roles and shrinks when peers leave.
   */
  connectedPlayers: string[];
  /** The local player's PlayerId, or null if a spectator / not yet assigned. */
  myRole: string | null;
  /** Whose turn it is per the known state, or null when unknown. */
  currentPlayer: string | null;
  /** Host applies locally; client sends an intent to the host. */
  makeMove(move: Move): void;
  /** Notified on any state change; returns an unsubscribe function. */
  subscribe(cb: () => void): () => void;
  leave(): void;
}

/** Message type names used on the transport. */
export const MSG = {
  hello: "hello",
  assignRole: "assign-role",
  state: "state",
  moveIntent: "move-intent",
  rejected: "rejected",
} as const;

/**
 * client -> host: the client announces itself so the host can assign it a role.
 * This makes discovery client-initiated and so independent of which side wired
 * up its peer-join listener first.
 */
export interface HelloPayload {
  /** Reserved for future use (e.g. requested name); empty for now. */
  readonly _?: never;
}

/** host -> a specific client: tells the joining peer which PlayerId it owns. */
export interface AssignRolePayload {
  playerId: string;
}

/** host -> client: the confirmed, per-recipient-projected state snapshot. */
export interface StatePayload<State> {
  state: State;
  result: GameResult<string>;
  players: string[];
  /** The host's authoritative set of currently-connected roles, roster order. */
  connectedPlayers: string[];
  currentPlayer: string | null;
}

/** client -> host: a request to apply a move, tagged with a correlating seq. */
export interface MoveIntentPayload<Move> {
  move: Move;
  seq: number;
}

/** host -> client: the host refused the intent identified by seq. */
export interface RejectedPayload {
  reason: string;
  seq: number;
}
