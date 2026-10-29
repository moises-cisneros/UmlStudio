import { describe, expect, it, vi } from "vitest"
import type { Redis } from "../../redis.js"
import type { RoomAiTeachingProfile } from "./room-ai-personal-profile.js"
import { createRoomAiService } from "./room-ai-service.js"

function createRedis(evalResult: number | [number, number] = 1) {
  const values = new Map<string, string>()
  return {
    exists: vi.fn(async () => 1),
    eval: vi.fn(async () => evalResult),
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      values.set(key, value)
      return "OK"
    }),
  } as unknown as Redis
}

const replica = {
  isComplete: () => true,
  getModel: () => ({ id: "room-1", nodes: [], edges: [] }),
}

describe("Room AI service privacy boundary", () => {
  it("learns from the requester's interaction and queues only the resulting closed profile", async () => {
    const redis = createRedis([1, 0])
    const chat = {
      append: vi.fn(),
      update: vi.fn(),
      list: vi.fn(async () => ({ messages: [], hasMore: false })),
    }
    const publish = vi.fn()
    const previousProfile = { detailLevel: "balanced", exampleStyle: "none" } as const
    const learnedProfile = { detailLevel: "balanced", exampleStyle: "uml" } as const
    const profileDeriver = vi.fn(async () => learnedProfile)
    const service = createRoomAiService({
      redis,
      ttlSeconds: 3600,
      chat: chat as never,
      publish,
      profileDeriver,
      getSharedBoardReplicaAtLeast: () => replica as never,
    })
    const profileRevision = await service.getPersonalProfileRevision("room-1", "user-1")

    const result = await service.postMessage({
      diagramId: "room-1",
      author: { id: "user-1", email: "user@example.test", name: "User" },
      text: "Please use a UML example",
      intent: "ask",
      replica: { generation: "a".repeat(64), revision: 3 },
      teachingProfile: previousProfile,
      profileRevision,
    })

    expect(profileDeriver).toHaveBeenCalledWith(previousProfile, "Please use a UML example")
    const [, options] = vi.mocked(redis.eval).mock.calls[0]!
    const sidecar = JSON.parse(options.arguments[5]!)
    expect(sidecar).toMatchObject({ requesterId: "user-1", teachingProfile: learnedProfile })
    expect(sidecar.revision).not.toBe(profileRevision)
    expect(result.profileUpdate).toEqual({ profile: learnedProfile, revision: sidecar.revision })
    expect(options.arguments[1]).not.toContain("personalMemory")
    expect(JSON.stringify(publish.mock.calls)).not.toContain(JSON.stringify(learnedProfile))

    await expect(
      service.postMessage({
        diagramId: "room-1",
        author: { id: "user-1", email: "user@example.test", name: "User" },
        text: "A second question based on the old profile",
        intent: "ask",
        replica: { generation: "a".repeat(64), revision: 3 },
        teachingProfile: previousProfile,
        profileRevision,
      })
    ).rejects.toMatchObject({ name: "RoomAiPersonalProfileStaleError" })
    expect(redis.eval).toHaveBeenCalledOnce()
  })

  it("keeps the existing profile and still queues the public question when learning fails", async () => {
    const redis = createRedis([1, 0])
    const service = createRoomAiService({
      redis,
      ttlSeconds: 3600,
      profileDeriver: vi.fn(async () => {
        throw new Error("learner unavailable")
      }),
      getSharedBoardReplicaAtLeast: () => replica as never,
    })
    const teachingProfile = { detailLevel: "step_by_step", exampleStyle: "code" } as const
    const profileRevision = await service.getPersonalProfileRevision("room-1", "user-1")

    const result = await service.postMessage({
      diagramId: "room-1",
      author: { id: "user-1", email: "user@example.test", name: "User" },
      text: "Explain this diagram",
      intent: "ask",
      replica: { generation: "a".repeat(64), revision: 3 },
      teachingProfile,
      profileRevision,
    })

    const [, options] = vi.mocked(redis.eval).mock.calls[0]!
    expect(JSON.parse(options.arguments[5]!)).toEqual({
      requesterId: "user-1",
      teachingProfile,
      revision: profileRevision,
    })
    expect(result.profileLearningFailed).toBe(true)
    expect(result.profileUpdate).toBeUndefined()
  })

  it("rolls back the profile revision when the shared queue rejects the message", async () => {
    const redis = createRedis([0, 0])
    const service = createRoomAiService({
      redis,
      ttlSeconds: 3600,
      profileDeriver: vi.fn(async () => ({ detailLevel: "concise", exampleStyle: "code" })),
      getSharedBoardReplicaAtLeast: () => replica as never,
    })
    const profileRevision = await service.getPersonalProfileRevision("room-1", "user-1")

    await expect(
      service.postMessage({
        diagramId: "room-1",
        author: { id: "user-1", email: "user@example.test", name: "User" },
        text: "Please use code examples",
        intent: "ask",
        replica: { generation: "a".repeat(64), revision: 3 },
        teachingProfile: { detailLevel: "balanced", exampleStyle: "none" },
        profileRevision,
      })
    ).rejects.toMatchObject({ name: "RoomQueueFullError" })

    expect(await service.getPersonalProfileRevision("room-1", "user-1")).toBe(profileRevision)
  })

  it("allows only one concurrent profile update from the same starting revision", async () => {
    const redis = createRedis([1, 0])
    const releases: Array<() => void> = []
    let markBothStarted!: () => void
    const bothStarted = new Promise<void>((resolve) => {
      markBothStarted = resolve
    })
    const profileDeriver = vi.fn(async (_profile: RoomAiTeachingProfile, interaction: string) => {
      if (releases.length === 1) markBothStarted()
      await new Promise<void>((resolve) => releases.push(resolve))
      return {
        detailLevel: "balanced" as const,
        exampleStyle: interaction === "first" ? ("code" as const) : ("uml" as const),
      }
    })
    const service = createRoomAiService({
      redis,
      ttlSeconds: 3600,
      profileDeriver,
      getSharedBoardReplicaAtLeast: () => replica as never,
    })
    const profileRevision = await service.getPersonalProfileRevision("room-1", "user-1")
    const input = (text: string) => ({
      diagramId: "room-1",
      author: { id: "user-1", email: "user@example.test", name: "User" },
      text,
      intent: "ask" as const,
      replica: { generation: "a".repeat(64), revision: 3 },
      teachingProfile: { detailLevel: "balanced" as const, exampleStyle: "none" as const },
      profileRevision,
    })

    const first = service.postMessage(input("first"))
    const second = service.postMessage(input("second"))
    await bothStarted
    releases[0]!()
    await expect(first).resolves.toMatchObject({
      profileUpdate: { profile: { exampleStyle: "code" } },
    })
    releases[1]!()
    await expect(second).rejects.toMatchObject({ name: "RoomAiPersonalProfileStaleError" })
    expect(redis.eval).toHaveBeenCalledOnce()
  })

  it("rejects a profile revision after it has changed", async () => {
    const redis = createRedis([1, 0])
    const service = createRoomAiService({
      redis,
      ttlSeconds: 3600,
      getSharedBoardReplicaAtLeast: () => replica as never,
    })
    const revision = await service.getPersonalProfileRevision("room-1", "user-1")
    await service.revokePersonalProfile("room-1", "user-1")

    await expect(
      service.postMessage({
        diagramId: "room-1",
        author: { id: "user-1", email: "user@example.test", name: "User" },
        text: "Explain this diagram",
        intent: "ask",
        replica: { generation: "a".repeat(64), revision: 3 },
        teachingProfile: { detailLevel: "balanced", exampleStyle: "analogy" },
        profileRevision: revision,
      })
    ).rejects.toMatchObject({ name: "RoomAiPersonalProfileStaleError" })
    expect(redis.eval).not.toHaveBeenCalled()
  })
})
