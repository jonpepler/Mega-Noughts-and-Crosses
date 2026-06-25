import { makeRng } from "./rng";
test("same seed gives same sequence", () => {
  const a = makeRng(42), b = makeRng(42);
  expect([a.int(6), a.int(6), a.int(6)]).toEqual([b.int(6), b.int(6), b.int(6)]);
});
test("int is within range", () => {
  const r = makeRng(1);
  for (let i = 0; i < 100; i++) {
    const v = r.int(6);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(6);
  }
});
