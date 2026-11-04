import { describe, expect, it } from "vitest"
import { loadConfig } from "./config.js"

describe("server configuration", () => {
  it("rejects summary batches larger than the bounded summarizer input", () => {
    expect(() => loadConfig({ ROOM_AI_SUMMARY_EVERY: "11" } as NodeJS.ProcessEnv)).toThrow(
      "ROOM_AI_SUMMARY_EVERY"
    )
  })

  it("requires a Postgres URL when durable Room AI memory selects Postgres", () => {
    expect(() => loadConfig({ ROOM_MEMORY: "postgres" } as NodeJS.ProcessEnv)).toThrow(
      "MEMORY_DATABASE_URL"
    )
  })
})
