import { describe, expect, it } from "vitest"
import { getRedis } from "../../src/__tests__/setup.js"
import { k } from "../../src/redis.js"
import { createRoomMemoryRepository } from "../../src/services/room-ai/room-memory-repository.js"

const summarize = async (summary: string, messages: string[]) =>
  [summary, ...messages].filter(Boolean).join(",")

describe("shared room memory", () => {
  it("summarizes each complete batch and isolates rooms", async () => {
    const redis = await getRedis()
    const repo = createRoomMemoryRepository(redis, { ttlSeconds: 3600, every: 2, summarize })
    await redis.set(k.diagram("a"), "existing")
    await repo.recordPublicMessage("a", "one")
    expect(await repo.snapshot("a")).toEqual({ summary: "", decisions: [] })
    await repo.recordPublicMessage("a", "two")
    await repo.recordPublicMessage("a", "three")
    await repo.recordPublicMessage("a", "four")
    expect(await repo.snapshot("a")).toEqual({ summary: "one,two,three,four", decisions: [] })
    expect(await repo.snapshot("b")).toEqual({ summary: "", decisions: [] })
    expect(await redis.get(k.diagram("a"))).toBe("existing")
  })
  it("keeps an accepted batch when summarization fails and allows a retry", async () => {
    let fail = true
    const repo = createRoomMemoryRepository(await getRedis(), {
      ttlSeconds: 3600,
      every: 2,
      summarize: async (summary, messages) => {
        if (fail) throw new Error("model unavailable")
        return summarize(summary, messages)
      },
    })
    await repo.recordPublicMessage("a", "one")
    await expect(repo.recordPublicMessage("a", "two")).rejects.toThrow("model unavailable")
    expect((await repo.snapshot("a")).summary).toBe("")
    fail = false
    await repo.flush("a")
    expect((await repo.snapshot("a")).summary).toBe("one,two")
  })

  it("flushes a full pending queue before rejecting a new public message", async () => {
    const redis = await getRedis()
    const repo = createRoomMemoryRepository(redis, {
      ttlSeconds: 3600,
      every: 1000,
      summarize: async (_summary, messages) => `summarized ${messages.length} messages`,
    })
    await redis.rPush(
      k.aiSummaryPending("a"),
      Array.from({ length: 1000 }, (_, i) => `old-${i}`)
    )

    await expect(repo.recordPublicMessage("a", "new message")).resolves.toBeUndefined()

    expect((await repo.snapshot("a")).summary).toBe("summarized 1000 messages")
    expect(await redis.lRange(k.aiSummaryPending("a"), 0, -1)).toEqual(["new message"])
  })

  it("pins unique decisions without crossing rooms", async () => {
    const repo = createRoomMemoryRepository(await getRedis(), {
      ttlSeconds: 3600,
      every: 2,
      summarize,
    })
    await Promise.all([
      repo.pinDecision("a", "Use UUIDs"),
      repo.pinDecision("a", "Use UUIDs"),
      repo.pinDecision("a", "Use UTC"),
    ])
    expect((await repo.snapshot("a")).decisions.sort()).toEqual(["Use UTC", "Use UUIDs"])
    expect((await repo.snapshot("b")).decisions).toEqual([])
  })
  it("retains all concurrent messages and rejects stale summaries", async () => {
    let release!: () => void
    let started!: () => void
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    let calls = 0
    const repo = createRoomMemoryRepository(await getRedis(), {
      ttlSeconds: 3600,
      every: 2,
      summarize: async (summary, messages) => {
        if (++calls === 1) {
          started()
          await blocked
        }
        return summarize(summary, messages)
      },
    })
    await repo.recordPublicMessage("a", "one")
    const slow = repo.recordPublicMessage("a", "two")
    await entered
    await Promise.all([
      repo.recordPublicMessage("a", "three"),
      repo.recordPublicMessage("a", "four"),
    ])
    release()
    await slow
    expect((await repo.snapshot("a")).summary).toBe("one,two,three,four")
  })
})
