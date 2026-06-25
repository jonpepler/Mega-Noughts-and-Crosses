import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/Mega-Noughts-and-Crosses/",
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    exclude: ["e2e/**", "dist/**", "node_modules/**"],
  },
});
