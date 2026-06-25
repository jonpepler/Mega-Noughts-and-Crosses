import { render } from "@testing-library/react";
import { ThemeProvider } from "./ThemeProvider";
import { defaultTheme } from "./default-theme";
import type { ThemeRepository, ThemeTokens } from "./tokens";

describe("ThemeProvider", () => {
  test("wrapper carries the default --color-x CSS variable", () => {
    const { container } = render(
      <ThemeProvider>
        <div>child</div>
      </ThemeProvider>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.getPropertyValue("--color-x")).toBe(
      defaultTheme.color.x,
    );
  });

  test("custom theme repository overrides --color-x", () => {
    const customTokens: ThemeTokens = {
      ...defaultTheme,
      color: { ...defaultTheme.color, x: "#ff0000" },
    };
    const customRepo: ThemeRepository = { get: () => customTokens };

    const { container } = render(
      <ThemeProvider theme={customRepo}>
        <div>child</div>
      </ThemeProvider>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.getPropertyValue("--color-x")).toBe("#ff0000");
  });

  test("renders children", () => {
    const { getByText } = render(
      <ThemeProvider>
        <div>hello world</div>
      </ThemeProvider>,
    );
    expect(getByText("hello world")).toBeDefined();
  });
});
