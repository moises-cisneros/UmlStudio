import { describe, it, expect, beforeEach } from "vitest"
import { getRedis } from "../../src/__tests__/setup.js"
import { k, type Redis } from "../../src/redis.js"
import {
  CHAT_MAX_MESSAGES,
  createChatRepository,
  type ChatRepository,
} from "../../src/services/room-ai/chat-repository.js"

interface TestMessage {
  id: string
  author: string
  text: string
}

const TTL = 3600
const msg = (n: number, text = `message ${n}`): TestMessage => ({
  id: `m${n}`,
  author: "user-1",
  text,
})

describe("INT-CU15: room chat repository (Redis)", () => {
  let redis: Redis
  let repo: ChatRepository<TestMessage>

  beforeEach(async () => {
    redis = await getRedis()
    repo = createChatRepository<TestMessage>(redis, TTL)
  })

  it("appends messages and lists them oldest first", async () => {
    await repo.append("d1", msg(1))
    await repo.append("d1", msg(2))
    const page = await repo.list("d1")
    expect(page.messages.map((m) => m.id)).toEqual(["m1", "m2"])
    expect(page.hasMore).toBe(false)
  })

  it("returns an empty page for a room without chat", async () => {
    expect(await repo.list("unknown")).toEqual({ messages: [], hasMore: false })
  })

  it("isolates rooms from each other", async () => {
    await repo.append("d1", msg(1))
    await repo.append("d2", msg(2))
    expect((await repo.list("d1")).messages.map((m) => m.id)).toEqual(["m1"])
  })

  it("updates a message by id and keeps its position", async () => {
    await repo.append("d1", msg(1))
    await repo.append("d1", msg(2))
    expect(await repo.update("d1", msg(1, "edited"))).toBe(true)
    const { messages } = await repo.list("d1")
    expect(messages.map((m) => m.text)).toEqual(["edited", "message 2"])
  })

  it("reports false when updating an unknown message", async () => {
    await repo.append("d1", msg(1))
    expect(await repo.update("d1", msg(99))).toBe(false)
    expect(await repo.update("empty", msg(1))).toBe(false)
  })

  it("paginates backwards with before and limit", async () => {
    for (let n = 1; n <= 10; n++) await repo.append("d1", msg(n))

    const last = await repo.list("d1", { limit: 4 })
    expect(last.messages.map((m) => m.id)).toEqual(["m7", "m8", "m9", "m10"])
    expect(last.hasMore).toBe(true)

    const prev = await repo.list("d1", { before: "m7", limit: 4 })
    expect(prev.messages.map((m) => m.id)).toEqual(["m3", "m4", "m5", "m6"])
    expect(prev.hasMore).toBe(true)

    const first = await repo.list("d1", { before: "m3", limit: 4 })
    expect(first.messages.map((m) => m.id)).toEqual(["m1", "m2"])
    expect(first.hasMore).toBe(false)
  })

  it("returns nothing for an unknown before cursor", async () => {
    await repo.append("d1", msg(1))
    expect(await repo.list("d1", { before: "gone" })).toEqual({ messages: [], hasMore: false })
  })

  it("trims the conversation to the last 200 messages", async () => {
    for (let n = 1; n <= CHAT_MAX_MESSAGES + 5; n++) await repo.append("d1", msg(n))
    expect(await redis.lLen(k.aiChat("d1"))).toBe(CHAT_MAX_MESSAGES)
    const { messages } = await repo.list("d1", { limit: CHAT_MAX_MESSAGES })
    expect(messages[0]?.id).toBe("m6")
    expect(messages.at(-1)?.id).toBe(`m${CHAT_MAX_MESSAGES + 5}`)
  })

  it("sets the diagram TTL on the chat key", async () => {
    await repo.append("d1", msg(1))
    const ttl = await redis.ttl(k.aiChat("d1"))
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(TTL)
  })
})
