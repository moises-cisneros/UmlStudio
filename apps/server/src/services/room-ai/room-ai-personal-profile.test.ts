import { describe, expect, it, vi } from "vitest"
import type { Redis } from "../../redis.js"
import {
  RoomAiTeachingProfileSchema,
  createRoomAiPersonalProfileRevisionCoordinator,
} from "./room-ai-personal-profile.js"

function createRedis() {
  const values = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      values.set(key, value)
      return "OK"
    }),
  } as unknown as Redis
}

describe("Room AI personal teaching profiles", () => {
  it("accepts only the exact allowlisted teaching controls", () => {
    expect(
      RoomAiTeachingProfileSchema.parse({ detailLevel: "step_by_step", exampleStyle: "uml" })
    ).toEqual({ detailLevel: "step_by_step", exampleStyle: "uml" })
    expect(() =>
      RoomAiTeachingProfileSchema.parse({
        detailLevel: "balanced",
        exampleStyle: "uml",
        personalFact: "must not be here",
      })
    ).toThrow()
    expect(() =>
      RoomAiTeachingProfileSchema.parse({ detailLevel: "secret", exampleStyle: "uml" })
    ).toThrow()
  })

  it("serializes revocation with an in-progress public commit and rejects the stale revision afterward", async () => {
    const coordinator = createRoomAiPersonalProfileRevisionCoordinator(createRedis(), 3600)
    const oldRevision = await coordinator.getOrCreateRevision("room-1", "user-1")
    let releaseCommit!: () => void
    let markCommitStarted!: () => void
    const commitStarted = new Promise<void>((resolve) => {
      markCommitStarted = resolve
    })
    const commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve
    })
    const order: string[] = []

    const commit = coordinator.withRoomLock("room-1", async () => {
      expect(await coordinator.isCurrentRevision("room-1", "user-1", oldRevision)).toBe(true)
      markCommitStarted()
      await commitGate
      order.push("public commit finished")
    })
    await commitStarted
    const revoke = coordinator.revokeRevision("room-1", "user-1").then(() => {
      order.push("revocation acknowledged")
    })
    await Promise.resolve()
    expect(order).toEqual([])

    releaseCommit()
    await Promise.all([commit, revoke])
    expect(order).toEqual(["public commit finished", "revocation acknowledged"])
    expect(await coordinator.isCurrentRevision("room-1", "user-1", oldRevision)).toBe(false)
  })

  it("does not allow the same profile revision to cross user or diagram scopes", async () => {
    const coordinator = createRoomAiPersonalProfileRevisionCoordinator(createRedis(), 3600)
    const first = await coordinator.getOrCreateRevision("room-1", "user-1")

    expect(await coordinator.isCurrentRevision("room-1", "user-2", first)).toBe(false)
    expect(await coordinator.isCurrentRevision("room-2", "user-1", first)).toBe(false)
  })
})
