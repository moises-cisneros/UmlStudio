import { defineConfig } from "vitest/config"

// Root-level tests for repository tooling only (scripts/). Each package keeps its own config.
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/**/*.test.mjs"],
  },
})
