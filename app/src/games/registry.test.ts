// @vitest-environment node
import { games } from "./registry";

test("registry has the mnac entry by id", () => {
  const entry = games.get("mnac");
  expect(entry).toBeDefined();
  expect(entry?.id).toBe("mnac");
  expect(entry?.name).toBe("Mega Noughts and Crosses");
  expect(entry?.definition).toBeDefined();
});

test("list returns all registered games including mnac", () => {
  const all = games.list();
  expect(all.length).toBeGreaterThanOrEqual(1);
  expect(all.map((e) => e.id)).toContain("mnac");
});

test("get with unknown id returns undefined", () => {
  expect(games.get("nonexistent")).toBeUndefined();
});
