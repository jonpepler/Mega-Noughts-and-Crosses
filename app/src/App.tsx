import React, { useState, useMemo, useEffect } from "react";
import { useGameRoom, makeLocalStoragePersistence } from "@mnac/engine";
import { ThemeProvider } from "./theme/ThemeProvider";
import { useThemePreference } from "./theme/use-theme-preference";
import { lightTheme } from "./theme/light-theme";
import { defaultTheme } from "./theme/default-theme";
import { ThemeToggle } from "./theme/ThemeToggle";
import { Lobby } from "./lobby/Lobby";
import { Board } from "./games/mnac/Board";
import { mnacGame } from "./games/mnac/mnac-game";
import { mnacSetup } from "./games/mnac/rules";
import type { Mark, MnacState, MnacMove } from "./games/mnac/rules";
import { selectTransportFactory } from "./transport-selection";
import type { ThemeRepository } from "./theme/tokens";

// ---------------------------------------------------------------------------
// Diagnostic build tag — shown on-screen during connecting/waiting so users
// can confirm they are not running a cached bundle. Easy to remove later.
// ---------------------------------------------------------------------------

const BUILD_TAG = "CONN-DIAG-1";

// ---------------------------------------------------------------------------
// Persistence (module-level singleton so it survives React renders)
// ---------------------------------------------------------------------------

const persistence = makeLocalStoragePersistence({ key: "mnac:room" });

// ---------------------------------------------------------------------------
// Seed derivation — deterministic, derived from room code.
// We hash the room code to a 32-bit integer using a simple djb2-style hash.
// Both host and join derive the same seed from the same code.
// ---------------------------------------------------------------------------

function seedFromCode(code: string): number {
  let h = 5381;
  for (let i = 0; i < code.length; i++) {
    h = (Math.imul(h, 33) ^ code.charCodeAt(i)) >>> 0;
  }
  return h;
}

// ---------------------------------------------------------------------------
// Room code generator — 4 lowercase letters + digits
// ---------------------------------------------------------------------------

const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

function getSearch(): string {
  return typeof window !== "undefined" ? window.location.search : "";
}

function buildSearch(roomCode: string, hasLocal: boolean): string {
  const params = new URLSearchParams();
  params.set("room", roomCode);
  if (hasLocal) params.set("local", "");
  // URLSearchParams encodes empty string as "local=" — trim trailing "="
  return "?" + params.toString().replace(/=(?=&|$)/g, "");
}

// ---------------------------------------------------------------------------
// Host/join decision rule:
//
// When entering a room, we check localStorage via the persistence layer:
//   - If saved data has role="host" AND roomCode matches the URL param → HOST
//   - Otherwise → JOIN
//
// This ensures the person who created the room (who wrote role="host" to
// localStorage) stays host even on page reload.  Anyone else opening the
// same shared link (with no matching localStorage entry) joins.
// ---------------------------------------------------------------------------

function resolveRole(
  roomCode: string,
  urlRole?: string | null,
): "host" | "join" {
  // Explicit ?role=host or ?role=join URL param takes precedence
  if (urlRole === "host") return "host";
  if (urlRole === "join") return "join";
  // Fall back to localStorage-based rule
  const saved = persistence.loadRoom();
  if (saved && saved.roomCode === roomCode && saved.role === "host") {
    return "host";
  }
  return "join";
}

// ---------------------------------------------------------------------------
// GameView — mounts after lobby; responsible for the in-game UI
// ---------------------------------------------------------------------------

interface GameViewProps {
  roomCode: string;
  role: "host" | "join";
  seed: number;
  search: string;
}

function GameView({
  roomCode,
  role,
  seed,
  search,
}: GameViewProps): React.JSX.Element {
  const factory = useMemo(() => selectTransportFactory(search), [search]);

  const { state, status, myRole, currentPlayer, makeMove, result, debug } =
    useGameRoom<MnacState, MnacMove>({
      definition: mnacGame,
      factory,
      roomCode,
      role,
      players: role === "host" ? ["X", "O"] : undefined,
      seed,
    });

  // Show a hint when the connection has been in "connecting" state for too long.
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (status !== "connecting") {
      setStalled(false);
      return;
    }
    const timer = setTimeout(() => setStalled(true), 10_000);
    return () => clearTimeout(timer);
  }, [status]);

  // Shareable link — always omit ?local so remote peers use the default
  // (Nostr) transport. ?local keeps working for the local dev/test flow when
  // a user sets it manually in their own URL; only the outgoing share link
  // must be clean.
  const shareUrl = (() => {
    const base =
      typeof window !== "undefined"
        ? `${window.location.origin}${window.location.pathname}`
        : "";
    return base + buildSearch(roomCode, false);
  })();

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Silently ignore — clipboard may be unavailable in test environments
    }
  }

  // ---------- styles ----------

  // GameView fills the flex column from ThemeProvider and centers its content.
  // The board is sized with vmin (see Board.tsx) so it always fits in the
  // viewport without overflow; this wrapper just needs to center it.
  const containerStyle: React.CSSProperties = {
    flex: "1",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.75rem",
    padding: "1rem",
    boxSizing: "border-box",
  };

  // Status bar matches the board width so the two form one centered column.
  const statusBarStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.35em",
    padding: "0.7em 1em",
    borderRadius: "var(--space-radius)",
    backgroundColor: "var(--color-surface)",
    color: "var(--color-muted)",
    width: "min(92vmin, 560px)",
    maxWidth: "100%",
    boxSizing: "border-box",
  };

  // The current status (turn / waiting / result) is the primary, prominent line.
  const primaryStatusStyle: React.CSSProperties = {
    fontSize: "1.15rem",
    fontWeight: 600,
    color: "var(--color-text)",
    textAlign: "center",
  };

  const shareLinkStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.5em",
    fontSize: "0.8rem",
    color: "var(--color-muted)",
    width: "100%",
  };

  const shareCodeStyle: React.CSSProperties = {
    fontFamily: "var(--font-family)",
    fontSize: "0.85rem",
    color: "var(--color-text)",
    backgroundColor: "var(--color-bg)",
    border: "1px solid var(--color-line)",
    borderRadius: "var(--space-radius)",
    padding: "0.35em 0.6em",
    maxWidth: "100%",
    overflowX: "auto",
    whiteSpace: "nowrap",
  };

  const copyButtonStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.55em 0.9em",
    fontSize: "0.9rem",
    fontWeight: 600,
    fontFamily: "var(--font-family)",
    border: "none",
    borderRadius: "var(--space-radius)",
    backgroundColor: "var(--color-accent)",
    color: "var(--color-bg)",
    cursor: "pointer",
  };

  // "You are playing as X" is a small caption below the primary line.
  const captionStyle: React.CSSProperties = {
    fontSize: "0.8rem",
    color: "var(--color-muted)",
  };

  // Muted hint shown when connecting takes longer than expected.
  const stalledHintStyle: React.CSSProperties = {
    fontSize: "0.78rem",
    color: "var(--color-muted)",
    textAlign: "center",
    lineHeight: 1.45,
  };

  // Small monospace diagnostic line shown during connecting/waiting.
  // Temporary — easy to remove by deleting this style + the JSX below.
  const diagStyle: React.CSSProperties = {
    fontSize: "0.7rem",
    fontFamily: "monospace",
    color: "var(--color-muted)",
    textAlign: "center",
    opacity: 0.75,
    userSelect: "text",
  };

  // Colour a player's mark glyph with its theme token (X coral, O blue).
  const markColor = (mark: string): string =>
    mark === "X" ? "var(--color-x)" : "var(--color-o)";

  // ---------- status text ----------

  let statusText: string;
  if (status === "connecting") {
    statusText = "Connecting…";
  } else if (status === "waiting") {
    statusText = "Waiting for opponent…";
  } else if (status === "playing") {
    const isMyTurn =
      currentPlayer !== null && myRole !== null && currentPlayer === myRole;
    statusText = isMyTurn ? "Your turn" : `${currentPlayer ?? "?"}'s turn`;
  } else {
    // ended
    if (result.status === "win") {
      statusText =
        result.winner === myRole
          ? "You won!"
          : `${result.winner} wins`;
    } else {
      statusText = "Draw!";
    }
  }

  const boardState = state ?? mnacSetup();

  return (
    <div style={containerStyle}>
      <div style={statusBarStyle} role="status" aria-live="polite">
        <span style={primaryStatusStyle}>{statusText}</span>

        {status === "waiting" && (
          <span style={shareLinkStyle}>
            <span>Share this link to invite your opponent</span>
            <code style={shareCodeStyle}>{shareUrl}</code>
            <button style={copyButtonStyle} onClick={() => void copyLink()}>
              Copy link
            </button>
          </span>
        )}

        {status === "connecting" && stalled && (
          <span style={stalledHintStyle}>
            This is taking longer than usual. Check the room code is correct
            and that the other player has opened the link.
          </span>
        )}

        {(status === "connecting" || status === "waiting") && (
          <span style={diagStyle} data-testid="conn-diag">
            {`build ${BUILD_TAG} | peers ${debug.transportPeers} | hello ${debug.helloAttempts} | role ${debug.hasRole ? "yes" : "no"} | state ${debug.hasState ? "yes" : "no"}`}
          </span>
        )}

        {status === "playing" && myRole !== null && (
          <span style={captionStyle}>
            You are{" "}
            <strong style={{ color: markColor(myRole) }}>{myRole}</strong>
          </span>
        )}
      </div>

      <Board
        state={boardState}
        myMark={(myRole as Mark) ?? null}
        currentPlayer={(currentPlayer as Mark) ?? null}
        onMove={makeMove}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App(): React.JSX.Element {
  const { mode, toggle } = useThemePreference();
  const themeRepo: ThemeRepository = useMemo(
    () => ({ get: () => (mode === "light" ? lightTheme : defaultTheme) }),
    [mode],
  );

  const search = getSearch();
  const params = new URLSearchParams(search);
  const urlRoomCode = params.get("room");
  const hasLocal = params.has("local");
  const urlRole = params.get("role"); // ?role=host or ?role=join override

  // Local state drives view when navigating without reload (lobby → game)
  const [gameRoom, setGameRoom] = useState<{
    roomCode: string;
    role: "host" | "join";
    seed: number;
  } | null>(() => {
    if (urlRoomCode) {
      const role = resolveRole(urlRoomCode, urlRole);
      const seed = seedFromCode(urlRoomCode);
      return { roomCode: urlRoomCode, role, seed };
    }
    return null;
  });

  function handleCreate() {
    const code = generateRoomCode();
    const seed = seedFromCode(code);
    // Persist as host
    persistence.saveRoom({ roomCode: code, role: "host", seed });
    // Update URL
    const newSearch = buildSearch(code, hasLocal);
    window.history.pushState({}, "", newSearch);
    // Switch to game view
    setGameRoom({ roomCode: code, role: "host", seed });
  }

  function handleJoin(rawCode: string) {
    const code = rawCode.trim();
    if (!code) return;
    const seed = seedFromCode(code);
    // Persist as join (so reload doesn't flip us to host)
    persistence.saveRoom({ roomCode: code, role: "join", seed });
    // Update URL
    const newSearch = buildSearch(code, hasLocal);
    window.history.pushState({}, "", newSearch);
    // Switch to game view
    setGameRoom({ roomCode: code, role: "join", seed });
  }

  const currentSearch = gameRoom
    ? buildSearch(gameRoom.roomCode, hasLocal)
    : search;

  return (
    <ThemeProvider theme={themeRepo}>
      <ThemeToggle mode={mode} onToggle={toggle} />
      {gameRoom ? (
        <GameView
          roomCode={gameRoom.roomCode}
          role={gameRoom.role}
          seed={gameRoom.seed}
          search={currentSearch}
        />
      ) : (
        <Lobby onCreate={handleCreate} onJoin={handleJoin} />
      )}
    </ThemeProvider>
  );
}
