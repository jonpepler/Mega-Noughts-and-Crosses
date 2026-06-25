import type { GameDefinition } from "@mnac/engine";
import {
  mnacSetup,
  mnacValidate,
  mnacApply,
  type Mark,
  type MnacState,
  type MnacMove,
} from "./rules";

export const mnacGame: GameDefinition<MnacState, MnacMove, Mark> = {
  setup(players, rng): MnacState {
    void players;
    void rng;
    return mnacSetup();
  },

  currentPlayer(state: MnacState): Mark | null {
    return state.result.status === "ongoing" ? state.turn : null;
  },

  validateMove(state: MnacState, move: MnacMove, by: Mark) {
    return mnacValidate(state, move, by);
  },

  applyMove(state: MnacState, move: MnacMove, by: Mark, rng) {
    void rng;
    return mnacApply(state, move, by);
  },

  getResult(state: MnacState) {
    return state.result;
  },
};
