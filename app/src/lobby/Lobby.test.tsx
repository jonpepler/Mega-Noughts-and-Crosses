// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { Lobby } from "./Lobby";

describe("Lobby", () => {
  test("clicking Create calls onCreate", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const onJoin = vi.fn();
    render(<Lobby onCreate={onCreate} onJoin={onJoin} />);

    await user.click(screen.getByRole("button", { name: /create room/i }));

    expect(onCreate).toHaveBeenCalledOnce();
    expect(onJoin).not.toHaveBeenCalled();
  });

  test("typing a code and clicking Join calls onJoin with the lowercased, trimmed code", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const onJoin = vi.fn();
    render(<Lobby onCreate={onCreate} onJoin={onJoin} />);

    const input = screen.getByRole("textbox", { name: /room code/i });
    await user.type(input, "  ABCD  ");
    await user.click(screen.getByRole("button", { name: /join/i }));

    expect(onJoin).toHaveBeenCalledWith("abcd");
    expect(onCreate).not.toHaveBeenCalled();
  });

  test("Join button calls onJoin with only the lowercased code (no surrounding spaces)", async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn();
    render(<Lobby onCreate={vi.fn()} onJoin={onJoin} />);

    const input = screen.getByRole("textbox", { name: /room code/i });
    await user.type(input, "XY12");
    await user.click(screen.getByRole("button", { name: /join/i }));

    expect(onJoin).toHaveBeenCalledWith("xy12");
  });
});
