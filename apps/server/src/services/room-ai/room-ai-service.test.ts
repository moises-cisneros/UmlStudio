import { describe, expect, it, vi } from "vitest"
import type { Redis } from "../../redis.js"
import type { RoomAiTeachingProfile } from "./room-ai-personal-profile.js"
import { createRoomAiService } from "./room-ai-service.js"

function createRedis(evalResult: number | [number, number] = 1) {
  const values = new Map<string, string>()
  return {
    exists: vi.fn(async () => 1),
    hGetAll: vi.fn(async () => ({})),
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
    const profileDeriver = vi.fn(
      async (_profile: typeof previousProfile, _interaction: string, messageId: string) => {
        expect(messageId).toMatch(/^[0-9a-f-]{36}$/i)
        return learnedProfile
      }
    )
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

    expect(profileDeriver).toHaveBeenCalledWith(
      { ...previousProfile, preferences: [] },
      "Please use a UML example",
      result.messageId
    )
    const [, options] = vi.mocked(redis.eval).mock.calls[0]!
    const sidecar = JSON.parse(options.arguments[5]!)
    expect(sidecar).toMatchObject({ requesterId: "user-1", teachingProfile: learnedProfile })
    expect(sidecar.revision).not.toBe(profileRevision)
    expect(result.profileUpdate).toEqual({
      profile: { ...learnedProfile, preferences: [] },
      revision: sidecar.revision,
    })
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
      teachingProfile: { ...teachingProfile, preferences: [] },
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

  it("does not emit [ROOM AI: QUEUE REJECTED] dev diagnostic when ROOM_AI_DEV_LOGS is disabled", async () => {
    const previousDevLogs = process.env.ROOM_AI_DEV_LOGS
    process.env.ROOM_AI_DEV_LOGS = ""
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    try {
      const redis = createRedis([0, 0])
      const service = createRoomAiService({
        redis,
        ttlSeconds: 3600,
        getSharedBoardReplicaAtLeast: () => replica as never,
      })

      await expect(
        service.postMessage({
          diagramId: "room-1",
          author: { id: "user-1", email: "user@example.test", name: "SENSITIVE_AUTHOR_CANARY" },
          text: "SENSITIVE_QUESTION_CANARY",
          intent: "ask",
          replica: { generation: "a".repeat(64), revision: 3 },
        })
      ).rejects.toMatchObject({ name: "RoomQueueFullError" })

      expect(logSpy).not.toHaveBeenCalled()
    } finally {
      logSpy.mockRestore()
      if (previousDevLogs === undefined) delete process.env.ROOM_AI_DEV_LOGS
      else process.env.ROOM_AI_DEV_LOGS = previousDevLogs
    }
  })

  it("emits a readable [ROOM AI: QUEUE REJECTED] diagnostic behind ROOM_AI_DEV_LOGS=1 without leaking sensitive fields", async () => {
    const previousDevLogs = process.env.ROOM_AI_DEV_LOGS
    process.env.ROOM_AI_DEV_LOGS = "1"
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    try {
      const redis = {
        ...createRedis([0, 0]),
        lLen: vi.fn(async () => 5),
        sCard: vi.fn(async () => 1),
        get: vi.fn(async (key: string) =>
          key === "umlstudio:room-ai:inference-limit" ? "1" : null
        ),
      } as unknown as Redis
      const service = createRoomAiService({
        redis,
        ttlSeconds: 3600,
        getSharedBoardReplicaAtLeast: () =>
          ({
            isComplete: () => true,
            getModel: () => ({ id: "SENSITIVE_BOARD_CANARY", nodes: [], edges: [] }),
          }) as never,
      })

      await expect(
        service.postMessage({
          diagramId: "room-1",
          author: { id: "user-1", email: "secret@example.test", name: "SENSITIVE_AUTHOR_CANARY" },
          text: "SENSITIVE_QUESTION_CANARY",
          intent: "ask",
          replica: { generation: "a".repeat(64), revision: 3 },
        })
      ).rejects.toMatchObject({ name: "RoomQueueFullError" })

      await vi.waitFor(() => {
        expect(logSpy).toHaveBeenCalledOnce()
      })
      const output = String(logSpy.mock.calls[0]?.[0] ?? "")
      expect(output).toContain("[ROOM AI: QUEUE REJECTED]")
      expect(output).toContain("ROOM_AI_QUEUE_FULL")
      expect(output).toMatch(/Message ID:\s+[0-9a-f-]{36}/i)
      expect(output).toContain("Queue depth: 5 / 5")
      expect(output).toContain("Room active lock: present")
      expect(output).toContain("Global inference slots: 1 / 1")
      expect(output).not.toContain("SENSITIVE_QUESTION_CANARY")
      expect(output).not.toContain("SENSITIVE_AUTHOR_CANARY")
      expect(output).not.toContain("secret@example.test")
      expect(output).not.toContain("SENSITIVE_BOARD_CANARY")
    } finally {
      logSpy.mockRestore()
      if (previousDevLogs === undefined) delete process.env.ROOM_AI_DEV_LOGS
      else process.env.ROOM_AI_DEV_LOGS = previousDevLogs
    }
  })

  it("promptly rejects with RoomQueueFullError even when a diagnostic-only Redis read never resolves", async () => {
    const previousDevLogs = process.env.ROOM_AI_DEV_LOGS
    process.env.ROOM_AI_DEV_LOGS = "1"
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    try {
      const lLen = vi.fn(() => new Promise<number>(() => {}))
      const redis = {
        ...createRedis([0, 0]),
        lLen,
      } as unknown as Redis
      const service = createRoomAiService({
        redis,
        ttlSeconds: 3600,
        getSharedBoardReplicaAtLeast: () =>
          ({
            isComplete: () => true,
            getModel: () => ({ id: "room-1", nodes: [], edges: [] }),
          }) as never,
      })

      await expect(
        service.postMessage({
          diagramId: "room-1",
          author: { id: "user-1", email: "user@example.test", name: "User" },
          text: "Explain this diagram",
          intent: "ask",
          replica: { generation: "a".repeat(64), revision: 3 },
        })
      ).rejects.toMatchObject({ name: "RoomQueueFullError" })

      expect(lLen).toHaveBeenCalledOnce()
      expect(logSpy).not.toHaveBeenCalled()
    } finally {
      logSpy.mockRestore()
      if (previousDevLogs === undefined) delete process.env.ROOM_AI_DEV_LOGS
      else process.env.ROOM_AI_DEV_LOGS = previousDevLogs
    }
  })
})
