// @vitest-environment node
import { makeBroadcastChannelFactory } from "./broadcast-channel";

/**
 * BroadcastChannel works between two instances in the same Node process (Node 18+),
 * but the channel.postMessage delivery is async (fires after current microtask queue).
 * We use a small helper to wait until a condition is met.
 */
function waitFor(condition: () => boolean, timeout = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function check() {
      if (condition()) return resolve();
      if (Date.now() - start > timeout) return reject(new Error("waitFor timeout"));
      setTimeout(check, 5);
    }
    check();
  });
}

test("two peers in a room see each other and exchange messages (BroadcastChannel)", async () => {
  const f = makeBroadcastChannelFactory();
  // Use unique room per test to avoid cross-test pollution.
  const room = `bc-test-${crypto.randomUUID()}`;

  const a = await f.join(room);
  const seenByA: string[] = [];
  a.onMessage((m) => seenByA.push(m.type));
  const joinedByA: string[] = [];
  a.onPeerJoin((id) => joinedByA.push(id));

  const b = await f.join(room);
  const joinedByB: string[] = [];
  b.onPeerJoin((id) => joinedByB.push(id));

  // Wait for the presence handshake to complete (both sides know each other).
  await waitFor(() => joinedByA.includes(b.selfId));
  await waitFor(() => joinedByB.includes(a.selfId));

  expect(joinedByA).toContain(b.selfId);
  expect(joinedByB).toContain(a.selfId);

  // Send a message from b to all (broadcast).
  b.send("hello", { x: 1 });
  await waitFor(() => seenByA.includes("hello"));
  expect(seenByA).toContain("hello");

  // Self-filter: a sends a broadcast but should NOT receive its own message.
  const seenByABefore = seenByA.length;
  a.send("self-check", {});
  // Give a moment; seenByA should not grow.
  await new Promise((r) => setTimeout(r, 30));
  expect(seenByA.length).toBe(seenByABefore);

  // Cleanup.
  a.leave();
  b.leave();
});

test("peer leave notifies remaining peers (BroadcastChannel)", async () => {
  const f = makeBroadcastChannelFactory();
  const room = `bc-leave-${crypto.randomUUID()}`;

  const a = await f.join(room);
  const b = await f.join(room);

  const leftA: string[] = [];
  a.onPeerLeave((id) => leftA.push(id));

  // Wait for handshake.
  await waitFor(() => leftA.length >= 0); // just let things settle
  await new Promise((r) => setTimeout(r, 20));

  b.leave();

  await waitFor(() => leftA.includes(b.selfId));
  expect(leftA).toContain(b.selfId);

  a.leave();
});
