import { makeMemoryFactory } from "./memory";

/** Resolve after a macrotask so deferred join notifications have fired. */
function nextMacrotask(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

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

test("a newcomer learns about a pre-existing peer via onPeerJoin", async () => {
  const f = makeMemoryFactory();
  const a = await f.join("room-pre");

  // Newcomer joins a room that already contains `a`.
  const b = await f.join("room-pre");

  // Listener is attached AFTER await join resolves, mirroring real callers.
  const seenByB: string[] = [];
  b.onPeerJoin((id) => seenByB.push(id));

  // Deferred (macrotask) notifications fire after this point.
  await nextMacrotask();

  expect(seenByB).toContain(a.selfId);
});

test("unsubscribing from onPeerJoin / onMessage stops further callbacks", async () => {
  const f = makeMemoryFactory();
  const a = await f.join("room-unsub");

  const joins: string[] = [];
  const unsubJoin = a.onPeerJoin((id) => joins.push(id));
  const msgs: string[] = [];
  const unsubMsg = a.onMessage((m) => msgs.push(m.type));

  unsubJoin();
  unsubMsg();

  const b = await f.join("room-unsub");
  b.send("hello", {});
  await nextMacrotask();

  expect(joins).toHaveLength(0);
  expect(msgs).toHaveLength(0);
});

test("no stale onPeerJoin emissions after leave() before deferred callback fires", async () => {
  const f = makeMemoryFactory();
  // Establish a pre-existing peer.
  await f.join("room-leave");

  // Newcomer joins a populated room then immediately leaves before the deferred
  // macrotask has a chance to fire.
  const newcomer = await f.join("room-leave");
  const joins: string[] = [];
  newcomer.onPeerJoin((id) => joins.push(id));
  newcomer.leave();

  // Allow the macrotask to fire (if the guard is missing, it would emit here).
  await nextMacrotask();

  expect(joins).toHaveLength(0);
});

test("unicast send delivers only to the addressed peer", async () => {
  const f = makeMemoryFactory();
  const a = await f.join("room-uni");
  const b = await f.join("room-uni");
  const c = await f.join("room-uni");

  const seenByB: string[] = [];
  b.onMessage((m) => seenByB.push(m.type));
  const seenByC: string[] = [];
  c.onMessage((m) => seenByC.push(m.type));

  a.send("direct", { x: 1 }, b.selfId);
  await nextMacrotask();

  expect(seenByB).toEqual(["direct"]);
  expect(seenByC).toEqual([]);

  // Unicast to self must not deliver.
  const seenByA: string[] = [];
  a.onMessage((m) => seenByA.push(m.type));
  a.send("loopback", {}, a.selfId);
  await nextMacrotask();
  expect(seenByA).toEqual([]);
});
