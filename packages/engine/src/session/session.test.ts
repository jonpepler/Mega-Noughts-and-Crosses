import type { GameDefinition, GameResult, MoveValidation } from "../game";
import { makeMemoryFactory } from "../transport/memory";
import { joinClient, startHost } from "./index";

/** Resolve after a macrotask so deferred join notifications have fired. */
function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

// A trivial 2-player "first to claim cell 0 wins" game definition for the
// tests, so we exercise the runtime, not any real game.
interface TestState {
  players: string[];
  turn: number;
  claimed: Record<number, string>;
}
interface TestMove {
  cell: number;
}

const testDef: GameDefinition<TestState, TestMove> = {
  setup(players): TestState {
    return { players: [...players], turn: 0, claimed: {} };
  },
  currentPlayer(state): string {
    return state.players[state.turn % state.players.length] as string;
  },
  validateMove(state, move): MoveValidation {
    if (move.cell < 0 || move.cell > 8) {
      return { ok: false, reason: "out of range" };
    }
    if (state.claimed[move.cell] !== undefined) {
      return { ok: false, reason: "already claimed" };
    }
    return { ok: true };
  },
  applyMove(state, move, by): TestState {
    return {
      players: state.players,
      turn: state.turn + 1,
      claimed: { ...state.claimed, [move.cell]: by },
    };
  },
  getResult(state): GameResult<string> {
    const owner = state.claimed[0];
    if (owner !== undefined) return { status: "win", winner: owner };
    return { status: "ongoing" };
  },
};

test("host validates, applies, and broadcasts; client move syncs", async () => {
  const f = makeMemoryFactory();
  const ht = await f.join("r");
  const ct = await f.join("r");
  const host = startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });
  const client = joinClient(testDef, ct);
  await tick();

  // host assigns roles: host is players[0], client players[1]
  expect(host.myRole).toBe("p0");
  expect(client.myRole).toBe("p1");

  // it is p0's turn; client (p1) tries to move and is rejected
  client.makeMove({ cell: 0 });
  await tick();
  expect(client.state).toMatchObject({ claimed: {} }); // unchanged

  // host moves, both see it
  host.makeMove({ cell: 0 });
  await tick();
  expect(host.state?.claimed[0]).toBe("p0");
  expect(client.state?.claimed[0]).toBe("p0");
});

test("roles are assigned to host and each joining peer in roster order", async () => {
  const f = makeMemoryFactory();
  const ht = await f.join("r");
  const ct = await f.join("r");
  const host = startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });
  const client = joinClient(testDef, ct);
  await tick();

  expect(host.myRole).toBe("p0");
  expect(client.myRole).toBe("p1");
  expect(host.players).toEqual(["p0", "p1"]);
  expect(client.players).toEqual(["p0", "p1"]);
});

test("a valid client move is applied by the host and synced everywhere", async () => {
  const f = makeMemoryFactory();
  const ht = await f.join("r");
  const ct = await f.join("r");
  const host = startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });
  const client = joinClient(testDef, ct);
  await tick();

  // p0 (host) takes cell 1, then it is p1's (client) turn.
  host.makeMove({ cell: 1 });
  await tick();
  expect(host.currentPlayer).toBe("p1");
  expect(client.currentPlayer).toBe("p1");

  // client makes a legal move; host applies and broadcasts.
  client.makeMove({ cell: 2 });
  await tick();
  expect(host.state?.claimed[2]).toBe("p1");
  expect(client.state?.claimed[2]).toBe("p1");
  expect(host.currentPlayer).toBe("p0");
});

test("an invalid move (already claimed cell) is rejected, state unchanged", async () => {
  const f = makeMemoryFactory();
  const ht = await f.join("r");
  const ct = await f.join("r");
  const host = startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });
  const client = joinClient(testDef, ct);
  await tick();

  // host claims cell 5 (now p1's turn)
  host.makeMove({ cell: 5 });
  await tick();
  // client tries to claim the same cell -> invalid
  client.makeMove({ cell: 5 });
  await tick();

  // cell 5 still owned by p0, still p1's turn (no apply happened)
  expect(host.state?.claimed[5]).toBe("p0");
  expect(client.state?.claimed[5]).toBe("p0");
  expect(host.currentPlayer).toBe("p1");
});

test("subscribe is notified on state change and unsubscribe stops it", async () => {
  const f = makeMemoryFactory();
  const ht = await f.join("r");
  const ct = await f.join("r");
  const host = startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });
  const client = joinClient(testDef, ct);
  await tick();

  let calls = 0;
  const unsub = client.subscribe(() => {
    calls += 1;
  });

  host.makeMove({ cell: 3 });
  await tick();
  expect(calls).toBeGreaterThan(0);

  const afterFirst = calls;
  unsub();
  host.makeMove({ cell: 4 });
  await tick();
  expect(calls).toBe(afterFirst);
});

// A hidden-information game: each player only sees their own claimed cells.
interface HiddenState {
  players: string[];
  turn: number;
  // cell -> owner; "view" hides cells not owned by the recipient.
  claimed: Record<number, string>;
}

const hiddenDef: GameDefinition<HiddenState, TestMove> = {
  setup(players): HiddenState {
    return { players: [...players], turn: 0, claimed: {} };
  },
  currentPlayer(state): string {
    return state.players[state.turn % state.players.length] as string;
  },
  validateMove(state, move): MoveValidation {
    if (state.claimed[move.cell] !== undefined) {
      return { ok: false, reason: "already claimed" };
    }
    return { ok: true };
  },
  applyMove(state, move, by): HiddenState {
    return {
      players: state.players,
      turn: state.turn + 1,
      claimed: { ...state.claimed, [move.cell]: by },
    };
  },
  getResult(): GameResult<string> {
    return { status: "ongoing" };
  },
  view(state, player): HiddenState {
    const visible: Record<number, string> = {};
    for (const [cell, owner] of Object.entries(state.claimed)) {
      if (owner === player) visible[Number(cell)] = owner;
    }
    return { players: state.players, turn: state.turn, claimed: visible };
  },
};

test("view projection: client only receives its own visible state", async () => {
  const f = makeMemoryFactory();
  const ht = await f.join("r");
  const ct = await f.join("r");
  const host = startHost(hiddenDef, ht, { seed: 1, players: ["p0", "p1"] });
  const client = joinClient(hiddenDef, ct);
  await tick();

  // host (p0) claims cell 7; client (p1) must NOT see it under projection.
  host.makeMove({ cell: 7 });
  await tick();

  // host sees its own projection (only p0-owned cells).
  expect(host.state?.claimed).toEqual({ 7: "p0" });
  // client (p1) sees none of p0's cells.
  expect(client.state?.claimed).toEqual({});

  // client claims cell 2; it should see its own, but still not host's.
  client.makeMove({ cell: 2 });
  await tick();
  expect(client.state?.claimed).toEqual({ 2: "p1" });
  expect(host.state?.claimed).toEqual({ 7: "p0" });
});

test("forged state/assign-role from a non-host peer is ignored by the client", async () => {
  const f = makeMemoryFactory();
  const ht = await f.join("r");
  const ct = await f.join("r");
  startHost(testDef, ht, { seed: 1, players: ["p0", "p1"] });
  const client = joinClient(testDef, ct);
  await tick();

  // Confirm legitimate host assignment was received.
  expect(client.myRole).toBe("p1");
  expect(client.state).not.toBeNull();

  // Capture state set by the legitimate host.
  const legitimateState = client.state;
  const legitimateRole = client.myRole;

  // A third peer (spectator) joins the same room.
  const spectatorTransport = await f.join("r");
  await tick();

  // The spectator broadcasts a forged `state` payload claiming a fabricated
  // game state, and a forged `assign-role` claiming a different role.
  const forgedState: TestState = {
    players: ["p0", "p1"],
    turn: 99,
    claimed: { 0: "p0", 1: "p0", 2: "p0" },
  };
  spectatorTransport.send("state", {
    state: forgedState,
    result: { status: "win", winner: "p0" },
    players: ["p0", "p1"],
    currentPlayer: null,
  });
  spectatorTransport.send("assign-role", { playerId: "spectator-impersonator" });
  await tick();

  // The client must NOT have adopted the forged state or role.
  expect(client.state).toEqual(legitimateState);
  expect(client.myRole).toBe(legitimateRole);
  expect(client.result.status).toBe("ongoing");
});
