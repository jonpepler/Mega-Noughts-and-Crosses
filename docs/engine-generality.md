# Engine generality review

The engine is meant to host more than one room code game. Mega Noughts and
Crosses is the first game built on it. To check that the engine is genuinely
generic and not quietly shaped only around noughts and crosses, an adversarial
panel reviewed it: one agent advocated for each of eleven games and attacked the
interface, looking for places it is over specific and for edge cases their game
needs that the interface cannot express. A second, skeptical pass then triaged
the findings, demoting anything the existing interface already expresses and
keeping only what is genuinely cheap and honest to adopt now.

The games on the panel were Connect Four, Reversi, Dots and Boxes, Battleship,
Chess, Catan, Harmonies, Project L, Cards Against Humanity, Galaxy Trucker, and
Rock Paper Scissors.

## What the engine already does well

The panel confirmed the engine is generic along the axes that matter, without
any change:

- A list based roster. `setup(players)` with sequential slot assignment supports
  N players, so three to six player Catan, two to four player Harmonies, and
  party sized Cards Against Humanity all fit. Nothing assumes two players.
- `currentPlayer(state)` is read from state, so turn order need not alternate.
  Extra turns (Dots and Boxes completing a box, Project L taking three actions a
  turn), a rotating judge (the Cards Against Humanity card czar), and snake order
  setup (Catan initial placement) all work by having the game decide who is next.
- `view(state, player)` plus per recipient broadcasts model hidden information
  cleanly: Battleship boards, and the hidden hands in Catan, Cards Against
  Humanity, and Project L. Noughts and crosses simply omits `view`.
- The seeded random generator is threaded into both `setup` and `applyMove`, so
  dice, deck shuffles, and mid game refills are deterministic and reproducible
  across host rebroadcasts. Noughts and crosses never calls it.
- The `scored` result variant expresses win by count outcomes (Dots and Boxes,
  Reversi majority, Cards Against Humanity points).
- `Move` is fully generic, so column drops, chess promotion, compound sub phase
  moves, and an explicit pass all type check with no engine change.
- State is opaque to the engine, so games keep their own history (chess
  repetition and the fifty move rule) and encode phase machines (placement
  versus combat) entirely in state.
- A subjective, human judged winner is just a move the judge makes during a
  judging phase, not a gap.
- Late joiners and spectators get a full projected state snapshot on join.

## Adopted now

Two items were cheap and worth doing now because they keep the interface honest.

1. Surface the move rejection reason to the player. The host already computes and
   sends a reason when it rejects a move, but the client dropped it and the hook
   exposed nothing. The expensive half was already paid; only the read side was
   missing. Seven of the panel games asked for it.
2. Conformance fixtures. Many capabilities were marked already expressible (extra
   turns, pass as a move, dice via the seeded generator, hidden hands via view,
   scored results, and so on). Those claims only stay true if a test proves a non
   noughts and crosses game shape round trips through the runtime, otherwise the
   generality rots silently because the only real game is trivial.

## Deferred, with reasons

Nothing was put in the build now bucket. The strongest structural finding, that
the runtime rather than the game owns the turn gate, is real and widely cited,
but it is a change to the engine's core authority rule with wide blast radius,
and no game we are actually building needs it yet. The right time to design that
abstraction is against a real second game, not a hypothetical panel.

The following are recorded so future work does not contradict them. They also
appear on the roadmap.

- Delegate "who may act now" from the runtime to the game, plus a non move
  control channel for out of turn actions (resign, draw offer, discard on seven,
  trade response). Deepest finding, widest blast radius, no current game needs it.
- Simultaneous, commit and reveal moves. Genuinely inexpressible today and the
  defining mechanic of Rock Paper Scissors, Cards Against Humanity submission,
  Battleship placement, and the Galaxy Trucker build phase. Large protocol and
  runtime addition; revisit when a simultaneous game is committed.
- Host driven timers and tick events. Needed for chess clocks and build timers.
  Every game is playable without them, so deferring keeps the engine
  deterministic and easy to test.
- Richer terminal metadata: a termination cause on the result, an explicit winner
  on the scored variant, and per category breakdowns. Presentational; games can
  carry this in their own state for now.
- In session rematch and multi round reset, and mid game disconnect resolution.
  Teardown and rejoin is an acceptable interim. Reconnect to role needs an
  identity model the transport does not have yet.
- A first class negotiation, trade, or chat side channel on the game room. The
  raw transport already carries arbitrary messages, so this is expressible below
  the abstraction; only a convenience layer is missing.
- Confidentiality of hidden state against the host peer itself. The host holds
  canonical state, so a curious host can read it. Solving this needs commitment
  or zero knowledge crypto, out of scope unless an adversarial host is a goal.
- A solo or automated opponent driven by the host. Niche, and a special case of
  host originated non move transitions, which is already deferred.
- Spectators receiving projected state, and an open lobby with a variable roster.
  The engine is fully functional for a fixed roster; this is a modest extension.

## Per game verdict

- Connect Four: hosted essentially as is. Only generic conveniences are missing.
- Reversi: data shapes fit, but the mandatory pass cannot auto fire and must be
  modelled as an explicit pass move.
- Dots and Boxes: extra turns and scoring are first class; out of turn actions
  need a control channel.
- Battleship: hidden boards work via view; concurrent ship placement needs the
  simultaneous move work.
- Chess: board moves fit; resign, draw offers, clocks, and termination reasons
  need new vocabulary.
- Catan: dice, N players, and hidden hands fit; trading and the discard on seven
  need the turn gate and a control channel.
- Harmonies: hosted well as is; only disconnect resilience and a scoring
  breakdown are missing.
- Project L: turn based version fits; the real time variant needs the
  simultaneous move work.
- Cards Against Humanity: roster, rotating judge, and hidden hands fit; the
  simultaneous submission phase does not.
- Galaxy Trucker: structure fits; the real time timed build phase needs
  simultaneous moves and timers.
- Rock Paper Scissors: everything fits except the simultaneous commit and reveal,
  which is the whole game.
