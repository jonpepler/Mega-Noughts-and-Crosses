import { makeRng } from "./rng";
test("same seed gives same sequence", () => {
  const a = makeRng(42), b = makeRng(42);
  expect([a.int(6), a.int(6), a.int(6)]).toEqual([b.int(6), b.int(6), b.int(6)]);
});
test("int is within range", () => {
  const r = makeRng(1);
  for (let i = 0; i < 100; i++) expect(r.int(6)).toBeGreaterThanOrEqual(0), expect(r.int(6)).toBeLessThan(6);
});
