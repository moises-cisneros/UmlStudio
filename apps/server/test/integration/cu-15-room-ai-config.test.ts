import { describe, expect, it } from "vitest"
import { loadConfig } from "../../src/config.js"

describe("Room AI configuration", () => {
  it("defaults to one inference and accepts a positive integer override", () => {
    expect(loadConfig({}).AI_MAX_CONCURRENCY).toBe(1)
    expect(loadConfig({ AI_MAX_CONCURRENCY: "3" }).AI_MAX_CONCURRENCY).toBe(3)
    expect(() => loadConfig({ AI_MAX_CONCURRENCY: "0" })).toThrow()
  })

  it("configures the internal AI-service endpoint and keeps its token server-side", () => {
    expect(loadConfig({}).AI_SERVICE_URL).toBe("http://127.0.0.1:8001")
    expect(
      loadConfig({ AI_SERVICE_URL: "http://ai.internal:8001", AI_INTERNAL_TOKEN: "test-only" })
    ).toMatchObject({ AI_SERVICE_URL: "http://ai.internal:8001", AI_INTERNAL_TOKEN: "test-only" })
  })
})
