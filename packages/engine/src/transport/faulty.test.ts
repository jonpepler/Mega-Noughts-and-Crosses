// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PeerId,
  Transport,
  TransportFactory,
  TransportMessage,
} from "./transport";
import { makeFaultyFactory } from "./faulty";

// ── helpers ──────────────────────────────────────────────────────────────────

interface Stub {
  t: Transport;
  sends: { type: string; payload: unknown; to?: PeerId }[];
  peerJoinCbs: ((id: PeerId) => void)[];
  peerLeaveCbs: ((id: PeerId) => void)[];
  messageCbs: ((m: TransportMessage) => void)[];
  leaveCalls: number;
}

/** Build a minimal stub Transport that records interactions. */
function stubTransport(selfId = "peer-a"): Stub {
  const sends: { type: string; payload: unknown; to?: PeerId }[] = [];
  const peerJoinCbs: ((id: PeerId) => void)[] = [];
  const peerLeaveCbs: ((id: PeerId) => void)[] = [];
  const messageCbs: ((m: TransportMessage) => void)[] = [];
  const stub: Stub = {
    sends,
    peerJoinCbs,
    peerLeaveCbs,
    messageCbs,
    leaveCalls: 0,
    t: {
      selfId,
      onPeerJoin(cb) {
        peerJoinCbs.push(cb);
        return () => {
          const i = peerJoinCbs.indexOf(cb);
          if (i >= 0) peerJoinCbs.splice(i, 1);
        };
      },
      onPeerLeave(cb) {
        peerLeaveCbs.push(cb);
        return () => {
          const i = peerLeaveCbs.indexOf(cb);
          if (i >= 0) peerLeaveCbs.splice(i, 1);
        };
      },
      onMessage(cb) {
        messageCbs.push(cb);
        return () => {
          const i = messageCbs.indexOf(cb);
          if (i >= 0) messageCbs.splice(i, 1);
        };
      },
      send(type, payload, to) {
        sends.push({ type, payload, to });
      },
      leave() {
        stub.leaveCalls += 1;
      },
    },
  };
  return stub;
}

function stubFactory(t: Transport): TransportFactory {
  return {
    async join() {
      return t;
    },
  };
}

// ── dropFirstSends ─────────────────────────────────────────────────────────

describe("dropFirstSends", () => {
  it("drops exactly the first N outbound sends, then passes through", async () => {
    const s = stubTransport();
    const ft = await makeFaultyFactory(stubFactory(s.t), {
      dropFirstSends: 3,
    }).join("room");
    ft.send("a", {});
    ft.send("b", {});
    ft.send("c", {});
    expect(s.sends).toHaveLength(0);
    ft.send("d", {});
    ft.send("e", {});
    expect(s.sends.map((x) => x.type)).toEqual(["d", "e"]);
  });

  it("passes all sends when dropFirstSends is 0/undefined", async () => {
    const s = stubTransport();
    const ft = await makeFaultyFactory(stubFactory(s.t), {}).join("room");
    ft.send("x", {});
    expect(s.sends).toHaveLength(1);
  });
});

// ── dropRate ───────────────────────────────────────────────────────────────

describe("dropRate", () => {
  it("drops a deterministic subset with a fixed seed", async () => {
    const s1 = stubTransport();
    const ft1 = await makeFaultyFactory(stubFactory(s1.t), {
      dropRate: 0.5,
      seed: 42,
    }).join("room");
    for (let i = 0; i < 20; i++) ft1.send(`m${i}`, {});

    const delivered1 = s1.sends.map((x) => x.type);
    expect(delivered1.length).toBeGreaterThan(0);
    expect(delivered1.length).toBeLessThan(20);

    // Same seed -> identical set of delivered messages.
    const s2 = stubTransport();
    const ft2 = await makeFaultyFactory(stubFactory(s2.t), {
      dropRate: 0.5,
      seed: 42,
    }).join("room");
    for (let i = 0; i < 20; i++) ft2.send(`m${i}`, {});
    expect(s2.sends.map((x) => x.type)).toEqual(delivered1);
  });

  it("passes all sends when dropRate is 0", async () => {
    const s = stubTransport();
    const ft = await makeFaultyFactory(stubFactory(s.t), {
      dropRate: 0,
    }).join("room");
    ft.send("a", {});
    ft.send("b", {});
    expect(s.sends).toHaveLength(2);
  });
});

// ── joinDelayMs ──────────────────────────────────────────────────────────────

describe("joinDelayMs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("delays the onPeerJoin callback by joinDelayMs", async () => {
    const s = stubTransport();
    const ft = await makeFaultyFactory(stubFactory(s.t), {
      joinDelayMs: 500,
    }).join("room");
    const joins: PeerId[] = [];
    ft.onPeerJoin((id) => joins.push(id));
    s.peerJoinCbs[0]?.("peer-b");
    expect(joins).toHaveLength(0);
    vi.advanceTimersByTime(499);
    expect(joins).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(joins).toEqual(["peer-b"]);
  });

  it("fires onPeerJoin immediately when joinDelayMs is 0/undefined", async () => {
    const s = stubTransport();
    const ft = await makeFaultyFactory(stubFactory(s.t), {}).join("room");
    const joins: PeerId[] = [];
    ft.onPeerJoin((id) => joins.push(id));
    s.peerJoinCbs[0]?.("peer-b");
    expect(joins).toEqual(["peer-b"]);
  });

  it("unsubscribing from onPeerJoin stops a delayed callback", async () => {
    const s = stubTransport();
    const ft = await makeFaultyFactory(stubFactory(s.t), {
      joinDelayMs: 500,
    }).join("room");
    const joins: PeerId[] = [];
    const unsub = ft.onPeerJoin((id) => joins.push(id));
    s.peerJoinCbs[0]?.("peer-b");
    unsub();
    vi.advanceTimersByTime(600);
    expect(joins).toHaveLength(0);
    // Also detaches from the inner transport.
    expect(s.peerJoinCbs).toHaveLength(0);
  });

  it("leave() clears pending join-delay timers", async () => {
    const s = stubTransport();
    const ft = await makeFaultyFactory(stubFactory(s.t), {
      joinDelayMs: 500,
    }).join("room");
    const joins: PeerId[] = [];
    ft.onPeerJoin((id) => joins.push(id));
    s.peerJoinCbs[0]?.("peer-b");
    ft.leave();
    vi.advanceTimersByTime(600);
    expect(joins).toHaveLength(0);
  });
});

// ── failWindowMs ──────────────────────────────────────────────────────────────

describe("failWindowMs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("drops all outbound sends within the window, passes after", async () => {
    // Drive the wrapper's clock from the fake timer system.
    vi.setSystemTime(0);
    const s = stubTransport();
    const ft = await makeFaultyFactory(stubFactory(s.t), {
      failWindowMs: 1000,
      now: () => Date.now(),
    }).join("room");
    ft.send("early", {});
    vi.setSystemTime(999);
    ft.send("still-early", {});
    expect(s.sends).toHaveLength(0);
    vi.setSystemTime(1000);
    ft.send("after", {});
    expect(s.sends.map((x) => x.type)).toEqual(["after"]);
  });
});

// ── passthrough + plumbing ───────────────────────────────────────────────────

describe("passthrough", () => {
  it("forwards selfId from the inner transport", async () => {
    const s = stubTransport("my-id");
    const ft = await makeFaultyFactory(stubFactory(s.t), {}).join("room");
    expect(ft.selfId).toBe("my-id");
  });

  it("passes onMessage callbacks through and supports unsubscribe", async () => {
    const s = stubTransport();
    const ft = await makeFaultyFactory(stubFactory(s.t), {}).join("room");
    const msgs: string[] = [];
    const unsub = ft.onMessage((m) => msgs.push(m.type));
    s.messageCbs[0]?.({ type: "ping", payload: {}, from: "x" });
    expect(msgs).toEqual(["ping"]);
    unsub();
    expect(s.messageCbs).toHaveLength(0);
  });

  it("passes onPeerLeave callbacks through and supports unsubscribe", async () => {
    const s = stubTransport();
    const ft = await makeFaultyFactory(stubFactory(s.t), {}).join("room");
    const leaves: PeerId[] = [];
    const unsub = ft.onPeerLeave((id) => leaves.push(id));
    s.peerLeaveCbs[0]?.("gone");
    expect(leaves).toEqual(["gone"]);
    unsub();
    expect(s.peerLeaveCbs).toHaveLength(0);
  });

  it("forwards leave() to the inner transport", async () => {
    const s = stubTransport();
    const ft = await makeFaultyFactory(stubFactory(s.t), {}).join("room");
    ft.leave();
    expect(s.leaveCalls).toBe(1);
  });
});
