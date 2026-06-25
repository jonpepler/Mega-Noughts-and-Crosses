import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Engine import boundary: forbid engine from importing app or game-specific modules
    files: ["packages/engine/**/*.ts", "packages/engine/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/app/**", "../app/**", "../../app/**"],
              message:
                "The engine package must not import from the app. Keep it game-agnostic.",
            },
          ],
        },
      ],
    },
  },
);
