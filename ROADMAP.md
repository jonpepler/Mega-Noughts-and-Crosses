# Roadmap

This is the living backlog for Mega Noughts and Crosses and its engine. It is the
place to record planned work and deferred decisions. Planned work must not
contradict anything documented here or in the design notes. When there is no
committed work in flight, pick up the next item.

## Near term

### UI polish (from the visual review)

- Vertically centre the status and board group. There is too much empty space
  above the content on both mobile and desktop.
- Fix the status panel hierarchy. The current turn line should be the primary,
  high contrast line; "you are playing as X" should be a smaller caption.
- Style the share link as a code badge rather than a raw wrapped URL, and make
  the Copy button full width and use the amber button treatment (it currently
  renders as a default browser button).
- Colour the O glyph in the status line with the O token, matching how the X
  glyph already uses the X colour.
- Constrain the status panel width to match the board width on desktop so the
  two form one column.
- Make the lobby join input and Join button fill the row so they match the width
  of the Create room button.
- Keep the forced board highlight from visually bleeding into the row below
  (use an inset outline or a slightly larger grid gap).
- Smaller touches: a subtle inner shadow on empty cells, a little padding around
  the mark glyph at small sizes, and slightly higher contrast on secondary text.

### Engine boundary tidy-ups (from the final review, cosmetic)

- Default the persistence key to a neutral value (for example `game:room`) and let
  the app pass `mnac:room`, so the engine carries no game branding.
- Consolidate the duplicated `makeSet` listener helper shared by the memory,
  broadcast-channel, and Nostr transports into one internal module.
- After the game is over, prefer a "game is already over" rejection message over
  "not your turn".
- Drop the unused `def` parameter from `joinClient` until client side prediction
  actually needs it.

### Verification still to finish

- Run the adversarial game panel and record its triage in
  `docs/engine-generality.md` (see below). The first run was interrupted, so the
  generality review is still pending.
- Live smoke test of the Nostr transport: confirm two real peers connect over a
  public relay at least once.
- Deploy to GitHub Pages and confirm the live URL loads and plays. This needs
  the repository Pages source set to "GitHub Actions" in Settings, Pages.

## Engine generality

The adversarial game panel has run. Its full findings and the reasoning behind
each decision are recorded in `docs/engine-generality.md`. In short, the engine
is generic along the axes that matter (N players, turn order read from state,
hidden information via a view projection, a seeded random generator, scored
results, generic moves, and opaque state), and the panel confirmed this by
attacking it with eleven games.

Two cheap, honesty preserving items were adopted now:

- Surface the move rejection reason to the player (the host already sent it; the
  client and hook now expose it).
- Conformance fixtures proving a non noughts and crosses game shape round trips
  through the runtime.

The following were deferred with reasons (see `docs/engine-generality.md` for
the detail). They are listed here so future work does not contradict them. Build
each only when a concrete game needs it, designing against that real use.

- Delegate "who may act now" from the runtime to the game, plus a non move
  control channel for out of turn actions (resign, draw offer, trade response).
- Simultaneous, commit and reveal moves (Rock Paper Scissors, Battleship
  placement, the Galaxy Trucker build phase).
- Host driven timers and tick events (chess clocks, build timers, turn timeouts).
- Richer terminal metadata: a termination cause, an explicit winner on the
  scored variant, and per category score breakdowns.
- In session rematch and multi round reset, and mid game disconnect resolution.
- A first class negotiation, trade, or chat side channel on the game room.
- Confidentiality of hidden state against the host peer itself.
- A solo or host driven automated opponent.
- Spectators receiving projected state, and an open lobby with a variable roster.

## Possible future games

The game registry makes adding another room code game a matter of providing a new
`GameDefinition` and its UI. Likely first candidates, in rough order of how well
they fit the current engine:

- Connect Four (turn based, simple win check).
- Reversi or Othello (needs a pass when there is no legal move).
- Dots and Boxes (needs extra turns, already expressible via currentPlayer).
- Battleship (needs the view projection for hidden boards).

## Notes

- Documentation lives in the repository. The design notes are kept locally and
  are not committed; this roadmap and `docs/engine-generality.md` are the
  committed record.
- Commit and writing style is plain and human, with no emdashes.
