import { describe, expect, it, vi } from "vitest"
import {
  createLongTermMemory,
  createRedisLongTermMemory,
  RoomLongTermMemoryDeletionPendingError,
  type RememberRoomMemoryInput,
} from "./room-long-term-memory.js"

function memoryInput(overrides: Partial<RememberRoomMemoryInput> = {}): RememberRoomMemoryInput {
  return {
    diagramId: "room-a",
    userId: "ana",
    scope: "room",
    kind: "decision",
    title: "Naming rule",
    content: "Use PascalCase for classes",
    ...overrides,
  }
}

function createRedisDouble() {
  const values = new Map<string, string>()
  const hashes = new Map<string, Record<string, string>>()
  return {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      values.set(key, value)
    }),
    del: vi.fn(async (key: string) => Number(values.delete(key))),
    hSet: vi.fn(async (key: string, field: string, value: string) => {
      hashes.set(key, { ...(hashes.get(key) ?? {}), [field]: value })
    }),
    hDel: vi.fn(async (key: string, field: string) => {
      const hash = hashes.get(key) ?? {}
      const deleted = Number(field in hash)
      delete hash[field]
      hashes.set(key, hash)
      return deleted
    }),
    hGetAll: vi.fn(async (key: string) => hashes.get(key) ?? {}),
  }
}

describe("Room long-term memory", () => {
  it("upserts a topic key and increments its revision in Redis fallback", async () => {
    const redis = createRedisDouble()
    const memory = createRedisLongTermMemory(redis as never, 3600)

    const first = await memory.remember(memoryInput({ topicKey: "naming" }))
    const second = await memory.remember(
      memoryInput({ topicKey: "naming", content: "Use CamelCase" })
    )

    expect(second.id).toBe(first.id)
    expect(second.revision).toBe(2)
    await expect(
      memory.recall({ diagramId: "room-a", userId: "ana", query: "CamelCase" })
    ).resolves.toEqual([expect.objectContaining({ content: "Use CamelCase", revision: 2 })])
  })

  it("does not recall another user's personal memory", async () => {
    const memory = createRedisLongTermMemory(createRedisDouble() as never, 3600)
    await memory.remember(
      memoryInput({ scope: "user", userId: "juan", content: "Juan private note" })
    )

    await expect(
      memory.recall({ diagramId: "room-a", userId: "ana", query: "private" })
    ).resolves.toEqual([])
    await expect(
      memory.recall({ diagramId: "room-a", userId: "juan", query: "private" })
    ).resolves.toHaveLength(1)
  })

  it("uses Redis only when Postgres is unavailable", async () => {
    const redis = createRedisDouble()
    const memory = createLongTermMemory({
      mode: "postgres",
      databaseUrl: "postgres://umlstudio_app:umlstudio_local_app@127.0.0.1:1/umlstudio",
      redis: redis as never,
      ttlSeconds: 3600,
    })

    await expect(memory.remember(memoryInput())).resolves.toEqual(
      expect.objectContaining({ revision: 1 })
    )
    expect(redis.set).toHaveBeenCalledOnce()
    await memory.close?.()
  })

  it("blocks diagram deletion and records a retry when Postgres is unavailable", async () => {
    const redis = createRedisDouble()
    const memory = createLongTermMemory({
      mode: "postgres",
      databaseUrl: "postgres://umlstudio_app:umlstudio_local_app@127.0.0.1:1/umlstudio",
      redis: redis as never,
      ttlSeconds: 3600,
    })

    await expect(memory.forget({ diagramId: "room-a", userId: "ana" })).rejects.toBeInstanceOf(
      RoomLongTermMemoryDeletionPendingError
    )
    expect(redis.hSet).toHaveBeenCalledWith(
      "room-ai:long-term-memory:pending-deletes",
      "room-a",
      "ana"
    )
    await memory.close?.()
  })
})
