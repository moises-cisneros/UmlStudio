import { describe, expect, it } from "vitest"
import { loadConfig } from "../../src/config.js"

describe("Room AI configuration", () => {
  it("defaults to one inference and accepts a positive integer override", () => {
    expect(loadConfig({}).AI_MAX_CONCURRENCY).toBe(1)
    expect(loadConfig({ AI_MAX_CONCURRENCY: "3" }).AI_MAX_CONCURRENCY).toBe(3)
    expect(() => loadConfig({ AI_MAX_CONCURRENCY: "0" })).toThrow()
  })
})
