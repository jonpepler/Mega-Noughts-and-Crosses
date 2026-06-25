import type { Rng } from "./rng";

export type MoveValidation = { ok: true } | { ok: false; reason: string };

export type GameResult<P> =
  | { status: "ongoing" }
  | { status: "win"; winner: P }
  | { status: "draw" }
  | { status: "scored"; scores: Record<string, number> };

export interface GameDefinition<State, Move, PlayerId = string> {
  setup(players: PlayerId[], rng: Rng): State;
  currentPlayer(state: State): PlayerId;
  validateMove(state: State, move: Move, by: PlayerId): MoveValidation;
  applyMove(state: State, move: Move, by: PlayerId, rng: Rng): State;
  getResult(state: State): GameResult<PlayerId>;
  view?(state: State, player: PlayerId): State;
}
