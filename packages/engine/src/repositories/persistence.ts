export interface PersistenceRepository {
  saveRoom(data: { roomCode: string; role: "host" | "join"; seed: number }): void;
  loadRoom(): { roomCode: string; role: "host" | "join"; seed: number } | null;
  clear(): void;
}

const DEFAULT_KEY = "game:room";

export function makeLocalStoragePersistence(opts?: {
  storage?: Storage;
  key?: string;
}): PersistenceRepository {
  // Resolve storage: prefer injected, fall back to globalThis.localStorage.
  const storage: Storage | undefined =
    opts?.storage ?? (typeof globalThis !== "undefined" ? (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage : undefined);

  const key = opts?.key ?? DEFAULT_KEY;

  return {
    saveRoom(data) {
      if (!storage) return;
      storage.setItem(key, JSON.stringify(data));
    },

    loadRoom() {
      if (!storage) return null;
      const raw = storage.getItem(key);
      if (raw === null) return null;
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "roomCode" in parsed &&
          "role" in parsed &&
          "seed" in parsed &&
          typeof (parsed as { roomCode: unknown }).roomCode === "string" &&
          ((parsed as { role: unknown }).role === "host" ||
            (parsed as { role: unknown }).role === "join") &&
          typeof (parsed as { seed: unknown }).seed === "number"
        ) {
          return parsed as { roomCode: string; role: "host" | "join"; seed: number };
        }
        return null;
      } catch {
        return null;
      }
    },

    clear() {
      if (!storage) return;
      storage.removeItem(key);
    },
  };
}
