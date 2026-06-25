import type { GameDefinition } from "@mnac/engine";
import { mnacGame } from "./mnac/mnac-game";

export interface GameEntry {
  id: string;
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  definition: GameDefinition<any, any>;
}

export interface GameRepository {
  get(id: string): GameEntry | undefined;
  list(): GameEntry[];
}

const registry = new Map<string, GameEntry>();

function register(entry: GameEntry): void {
  registry.set(entry.id, entry);
}

register({
  id: "mnac",
  name: "Mega Noughts and Crosses",
  definition: mnacGame,
});

export const games: GameRepository = {
  get(id: string): GameEntry | undefined {
    return registry.get(id);
  },
  list(): GameEntry[] {
    return [...registry.values()];
  },
};
