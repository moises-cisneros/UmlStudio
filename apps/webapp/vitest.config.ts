import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      assets: resolve(__dirname, "assets"),
    },
  },
  assetsInclude: ["**/*.png", "**/*.svg"],
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    server: {
      deps: {
        inline: [/@umlstudio\/umlstudio/],
      },
    },
  },
});
