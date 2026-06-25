import React, { useState } from "react";

export interface LobbyProps {
  onCreate(): void;
  onJoin(code: string): void;
}

export function Lobby({ onCreate, onJoin }: LobbyProps): React.JSX.Element {
  const [code, setCode] = useState("");

  // flex:1 makes this container grow to fill the ThemeProvider's flex column,
  // ensuring the lobby is vertically centered in the full viewport.
  const containerStyle: React.CSSProperties = {
    flex: "1",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--space-gap)",
    padding: "2rem 1rem",
    boxSizing: "border-box",
  };

  const headingStyle: React.CSSProperties = {
    fontSize: "clamp(1.5rem, 5vw, 2.5rem)",
    fontWeight: 700,
    marginBottom: "calc(var(--space-gap) * 2)",
    color: "var(--color-text)",
  };

  const sectionStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "var(--space-gap)",
    width: "100%",
    maxWidth: "320px",
  };

  const dividerStyle: React.CSSProperties = {
    color: "var(--color-muted)",
    fontSize: "0.875rem",
    margin: "calc(var(--space-gap) * 1) 0",
  };

  const buttonStyle: React.CSSProperties = {
    padding: "0.75em 2em",
    fontSize: "1rem",
    fontFamily: "var(--font-family)",
    fontWeight: 600,
    border: "2px solid var(--color-accent)",
    borderRadius: "var(--space-radius)",
    backgroundColor: "var(--color-accent)",
    color: "var(--color-bg)",
    cursor: "pointer",
    width: "100%",
  };

  const inputStyle: React.CSSProperties = {
    padding: "0.6em 1em",
    fontSize: "1rem",
    fontFamily: "var(--font-family)",
    border: "2px solid var(--color-line)",
    borderRadius: "var(--space-radius)",
    backgroundColor: "var(--color-surface)",
    color: "var(--color-text)",
    width: "100%",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "0.875rem",
    color: "var(--color-muted)",
    alignSelf: "flex-start",
  };

  const joinRowStyle: React.CSSProperties = {
    display: "flex",
    gap: "var(--space-gap)",
    width: "100%",
  };

  const joinButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    width: "auto",
    flexShrink: 0,
  };

  function handleJoin() {
    const trimmed = code.trim().toLowerCase();
    if (trimmed) {
      onJoin(trimmed);
    }
  }

  return (
    <div style={containerStyle}>
      <h1 style={headingStyle}>Mega Noughts and Crosses</h1>

      <div style={sectionStyle}>
        <button style={buttonStyle} onClick={onCreate}>
          Create room
        </button>

        <span style={dividerStyle}>or join an existing room</span>

        <label htmlFor="lobby-room-code" style={labelStyle}>
          Room code
        </label>
        <div style={joinRowStyle}>
          <input
            id="lobby-room-code"
            type="text"
            style={inputStyle}
            aria-label="Room code"
            placeholder="e.g. ab3x"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleJoin();
            }}
          />
          <button style={joinButtonStyle} onClick={handleJoin}>
            Join
          </button>
        </div>
      </div>
    </div>
  );
}
