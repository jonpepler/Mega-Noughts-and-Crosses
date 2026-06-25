import { makeMemoryFactory } from "./memory";

test("two peers in a room see each other and exchange messages", async () => {
  const f = makeMemoryFactory();
  const a = await f.join("room1");
  const seenByA: string[] = [];
  a.onMessage((m) => seenByA.push(m.type));
  let joined = "";
  a.onPeerJoin((id) => (joined = id));
  const b = await f.join("room1");
  expect(joined).toBe(b.selfId);
  b.send("hello", { x: 1 });
  await Promise.resolve();
  expect(seenByA).toContain("hello");
});
