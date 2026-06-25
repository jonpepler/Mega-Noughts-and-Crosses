// @vitest-environment node
import { makeLocalStoragePersistence } from "./persistence";

/** Minimal in-memory Storage stub — no DOM/jsdom needed. */
function makeMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    key(index: number) { return [...store.keys()][index] ?? null; },
    getItem(key: string) { return store.get(key) ?? null; },
    setItem(key: string, value: string) { store.set(key, value); },
    removeItem(key: string) { store.delete(key); },
    clear() { store.clear(); },
  };
}

const sample = { roomCode: "ABC123", role: "host" as const, seed: 42 };

test("saveRoom round-trips through loadRoom", () => {
  const repo = makeLocalStoragePersistence({ storage: makeMemoryStorage() });
  repo.saveRoom(sample);
  expect(repo.loadRoom()).toEqual(sample);
});

test("loadRoom returns null when nothing has been saved", () => {
  const repo = makeLocalStoragePersistence({ storage: makeMemoryStorage() });
  expect(repo.loadRoom()).toBeNull();
});

test("clear removes the stored data", () => {
  const repo = makeLocalStoragePersistence({ storage: makeMemoryStorage() });
  repo.saveRoom(sample);
  repo.clear();
  expect(repo.loadRoom()).toBeNull();
});

test("loadRoom returns null for malformed JSON", () => {
  const storage = makeMemoryStorage();
  storage.setItem("game:room", "not-valid-json{{{");
  const repo = makeLocalStoragePersistence({ storage });
  expect(repo.loadRoom()).toBeNull();
});

test("round-trips a join role and different seed", () => {
  const repo = makeLocalStoragePersistence({ storage: makeMemoryStorage() });
  const data = { roomCode: "XYZ999", role: "join" as const, seed: 7 };
  repo.saveRoom(data);
  expect(repo.loadRoom()).toEqual(data);
});

test("safe no-op when storage is unavailable (undefined)", () => {
  const repo = makeLocalStoragePersistence({ storage: undefined });
  expect(() => repo.saveRoom(sample)).not.toThrow();
  expect(repo.loadRoom()).toBeNull();
  expect(() => repo.clear()).not.toThrow();
});
