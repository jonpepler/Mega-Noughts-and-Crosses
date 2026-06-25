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

### Verification still to finish

- Run the adversarial game panel and record its triage in
  `docs/engine-generality.md` (see below). The first run was interrupted, so the
  generality review is still pending.
- Live smoke test of the Nostr transport: confirm two real peers connect over a
  public relay at least once.
- Deploy to GitHub Pages and confirm the live URL loads and plays. This needs
  the repository Pages source set to "GitHub Actions" in Settings, Pages.

## Engine generality (deferred, with reasons)

The engine is built to host more than one room code game. The `GameDefinition`
already supports a list of players (not just two), a `currentPlayer` read from
state (so turns need not strictly alternate), a `view(state, player)` projection
for hidden information, a result type of ongoing, win, draw, or scored, and a
seeded random generator passed to setup and applyMove.

The following capabilities are not needed for Mega Noughts and Crosses and are
deferred. They are recorded so future work does not assume they exist or quietly
contradict these decisions. The adversarial game panel will confirm and add to
this list in `docs/engine-generality.md`.

- Simultaneous or real time moves (for example Rock Paper Scissors, parts of
  Galaxy Trucker and Project L). The current model is turn based. Adding a
  commit and reveal phase or a simultaneous move mode is a larger change to the
  session protocol.
- Host driven timers and timed phases (Galaxy Trucker). The session has no clock.
- Non move game events such as resign, draw offer, and repetition claims (Chess).
  Today only moves change state.
- Inter player negotiation and trading side channels (Catan). Peers can only send
  move intents to the host.
- Subjective, human judged results and rotating judge roles (Cards Against
  Humanity). Results are computed by the game definition, not voted on.
- A shared deterministic random stream for ongoing draws and shuffles beyond the
  initial seed (Catan dice, card draws). Today the seed is for setup and apply.

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
