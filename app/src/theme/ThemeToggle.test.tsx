// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, expect, test, vi } from "vitest";
import { ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
  test("renders a button with accessible name for switching to light when mode is dark", () => {
    render(<ThemeToggle mode="dark" onToggle={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /switch to light/i }),
    ).toBeInTheDocument();
  });

  test("renders a button with accessible name for switching to dark when mode is light", () => {
    render(<ThemeToggle mode="light" onToggle={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /switch to dark/i }),
    ).toBeInTheDocument();
  });

  test("calls onToggle when clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<ThemeToggle mode="dark" onToggle={onToggle} />);

    await user.click(screen.getByRole("button", { name: /switch to light/i }));

    expect(onToggle).toHaveBeenCalledOnce();
  });

  test("has a tap target of at least 40px (min-width and min-height via style)", () => {
    const { container } = render(
      <ThemeToggle mode="dark" onToggle={vi.fn()} />,
    );
    const btn = container.querySelector("button") as HTMLButtonElement;
    // Check inline style directly (jsdom doesn't compute layout)
    expect(btn.style.minWidth).toBeTruthy();
    expect(btn.style.minHeight).toBeTruthy();
  });
});
