import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "app/e2e",
  use: {
    baseURL: "http://localhost:4173/Mega-Noughts-and-Crosses/",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command:
      "npm run build -w packages/engine && npm run build -w app && npm run preview -w app -- --port 4173 --strictPort",
    url: "http://localhost:4173/Mega-Noughts-and-Crosses/",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
