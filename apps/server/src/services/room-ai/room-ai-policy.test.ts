import { describe, expect, it, vi } from "vitest"
import type { Redis } from "../../redis.js"
import { k } from "../../redis.js"
import {
  DEFAULT_ROOM_AI_POLICY,
  RoomAiPolicySchema,
  createRoomAiPolicyRepository,
} from "./room-ai-policy.js"

function createMockRedis() {
  const hashes = new Map<string, Record<string, string>>()
  const ttls = new Map<string, number>()
  const multiOps: Array<() => void> = []

  const redis = {
    hGetAll: vi.fn(async (key: string) => ({ ...(hashes.get(key) ?? {}) })),
    multi: vi.fn(() => {
      multiOps.length = 0
      const chain = {
        hSet: vi.fn((key: string, fields: Record<string, string>) => {
          multiOps.push(() => {
            hashes.set(key, { ...(hashes.get(key) ?? {}), ...fields })
          })
          return chain
        }),
        expire: vi.fn((key: string, ttl: number) => {
          multiOps.push(() => {
            ttls.set(key, ttl)
          })
          return chain
        }),
        exec: vi.fn(async () => {
          for (const op of multiOps) op()
          return []
        }),
      }
      return chain
    }),
  }

  return {
    redis: redis as unknown as Redis,
    hashes,
    ttls,
  }
}

describe("Room AI policy repository", () => {
  it("returns the default policy when no Redis hash exists for the diagram", async () => {
    const { redis } = createMockRedis()
    const repo = createRoomAiPolicyRepository(redis, 3600)

    const policy = await repo.get("room-1")

    expect(policy).toEqual(DEFAULT_ROOM_AI_POLICY)
    expect(policy).toEqual({
      enabled: true,
      allowChanges: false,
      applyMode: "confirm",
      proactive: false,
    })
  })

  it("persists the policy in diagram:{id}:ai:policy as a Redis HASH with the diagram TTL and reads it back", async () => {
    const { redis, hashes, ttls } = createMockRedis()
    const repo = createRoomAiPolicyRepository(redis, 7200)
    const updated = {
      enabled: true,
      allowChanges: false,
      applyMode: "auto" as const,
      proactive: true,
    }

    const saved = await repo.set("room-1", updated)

    expect(saved).toEqual(updated)
    expect(hashes.get(k.aiPolicy("room-1"))).toEqual({
      enabled: "true",
      allowChanges: "false",
      applyMode: "auto",
      proactive: "true",
    })
    expect(ttls.get(k.aiPolicy("room-1"))).toBe(7200)
    await expect(repo.get("room-1")).resolves.toEqual(updated)
  })

  it("validates only exact RoomAiPolicy fields and rejects unknown keys or invalid applyMode", () => {
    expect(
      RoomAiPolicySchema.parse({
        enabled: false,
        allowChanges: false,
        applyMode: "confirm",
        proactive: false,
      })
    ).toEqual({
      enabled: false,
      allowChanges: false,
      applyMode: "confirm",
      proactive: false,
    })

    expect(() =>
      RoomAiPolicySchema.parse({
        enabled: true,
        allowChanges: true,
        applyMode: "invalid",
        proactive: false,
      })
    ).toThrow()

    expect(() =>
      RoomAiPolicySchema.parse({
        enabled: true,
        allowChanges: true,
        applyMode: "confirm",
        proactive: false,
        userId: "forged-owner",
      })
    ).toThrow()
  })
})
