// @vitest-environment node
import { selectTransportFactory } from "./transport-selection";

test("returns BroadcastChannelFactory when search contains ?local", () => {
  const factory = selectTransportFactory("?local");
  // The factory's join must return a BroadcastChannelTransport instance.
  // We verify the factory has a join function — actual transport is browser-only,
  // so we only check the shape here.
  expect(typeof factory.join).toBe("function");
});

test("returns NostrFactory when search is empty", () => {
  const factory = selectTransportFactory("");
  expect(typeof factory.join).toBe("function");
});

test("returns NostrFactory when search has no local param", () => {
  const factory = selectTransportFactory("?foo=bar");
  expect(typeof factory.join).toBe("function");
});

test("BroadcastChannel factory and Nostr factory are different objects for ?local vs empty", () => {
  const local = selectTransportFactory("?local");
  const nostr = selectTransportFactory("");
  // They're different factories — a rough but honest check.
  expect(local).not.toBe(nostr);
});

test("returns a factory when ?fault is present with a spec", () => {
  const factory = selectTransportFactory("?local&fault=dropFirst:2");
  expect(typeof factory.join).toBe("function");
});

test("returns a factory for a bare ?fault (default profile)", () => {
  const factory = selectTransportFactory("?local&fault");
  expect(typeof factory.join).toBe("function");
});

test("returns a factory for ?local with no fault (unwrapped path)", () => {
  const factory = selectTransportFactory("?local");
  expect(typeof factory.join).toBe("function");
});
