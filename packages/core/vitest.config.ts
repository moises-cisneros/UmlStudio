import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import { resolve } from "path"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@/assets/fonts": resolve(__dirname, "../../assets/fonts"),
      "@fonts": resolve(__dirname, "../../assets/fonts"),
      "@": resolve(__dirname, "lib"),
      "@/": resolve(__dirname, "lib/"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["lib/**/*.{ts,tsx}"],
      exclude: ["lib/**/index.{ts,tsx}", "lib/**/*.d.ts", "lib/styles/**", "lib/constants/**"],
    },
  },
})
