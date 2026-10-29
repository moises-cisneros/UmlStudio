import { describe, expect, it, vi } from "vitest"
import type { Redis } from "../../redis.js"
import { InferenceNotStartedError } from "./inference-not-started.js"
import { createRoomAiPersonalProfileRevisionCoordinator } from "./room-ai-personal-profile.js"
import { createRoomAiOrchestrator } from "./room-ai-orchestrator.js"

const revision = "11111111-1111-4111-8111-111111111111"
const profile = { detailLevel: "step_by_step" as const, exampleStyle: "uml" as const }
const requesterMessage = {
  id: "question-1",
  diagramId: "room-1",
  author: { id: "user-1", name: "Ada", kind: "user" as const },
  intent: "ask" as const,
  text: "Explain the diagram",
  status: "queued" as const,
  createdAt: "2026-10-29T00:00:00.000Z",
}

function createHarness(
  respond: ReturnType<typeof vi.fn>,
  getBoard: () => unknown | Promise<unknown> = () => ({ id: "room-1", nodes: [], edges: [] })
) {
  const values = new Map<string, string>()
  const multi = {
    rPush: vi.fn(() => multi),
    lTrim: vi.fn(() => multi),
    expire: vi.fn(() => multi),
    exec: vi.fn(async () => []),
  }
  const redis = {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      values.set(key, value)
      return "OK"
    }),
    eval: vi.fn(async () =>
      JSON.stringify({
        requesterId: "user-1",
        teachingProfile: profile,
        revision,
      })
    ),
    lRange: vi.fn(async () => [JSON.stringify(requesterMessage)]),
    multi: vi.fn(() => multi),
  } as unknown as Redis
  const profileRevisions = createRoomAiPersonalProfileRevisionCoordinator(redis, 3600)
  const recordPublicMessage = vi.fn(async () => undefined)
  const publish = vi.fn(async () => undefined)
  const orchestrator = createRoomAiOrchestrator({
    redis,
    ttlSeconds: 3600,
    getBoard: getBoard as never,
    getMemory: async () => ({ summary: "Shared", decisions: [] }),
    getAuthorship: async () => ({}),
    profileRevisions,
    respond,
    recordPublicMessage,
    publish,
  })
  return { redis, profileRevisions, orchestrator, recordPublicMessage, publish, multi }
}

describe("Room AI public publication boundary", () => {
  it("passes only the allowlisted profile to shared inference, never the private note", async () => {
    const respond = vi.fn(async () => ({
      text: "Here is a step-by-step explanation.",
      provider: "local",
    }))
    const harness = createHarness(respond)
    await harness.profileRevisions.revokeRevision("room-1", "user-1")
    const currentRevision = await harness.profileRevisions.getOrCreateRevision("room-1", "user-1")
    harness.redis.eval = vi.fn(async () =>
      JSON.stringify({
        requesterId: "user-1",
        teachingProfile: profile,
        revision: currentRevision,
      })
    ) as never

    await harness.orchestrator.infer("room-1", requesterMessage.id, {
      generation: "a".repeat(64),
      revision: 1,
    })

    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ teachingProfile: profile }))
    expect(JSON.stringify(respond.mock.calls)).not.toContain("PRIVATE_NOTE_CANARY")
    expect(JSON.stringify(harness.redis.multi.mock.calls)).not.toContain("PRIVATE_NOTE_CANARY")
    expect(harness.publish).toHaveBeenCalledWith(
      "room-1",
      expect.objectContaining({ type: "message.created" })
    )
  })

  it("suppresses every shared sink when revocation wins before the publication lock", async () => {
    const respond = vi.fn(async () => ({ text: "Must not be published", provider: "local" }))
    const harness = createHarness(respond)
    respond.mockImplementation(async () => {
      await harness.profileRevisions.revokeRevision("room-1", "user-1")
      return { text: "Must not be published", provider: "local" }
    })
    await harness.profileRevisions.revokeRevision("room-1", "user-1")
    const currentRevision = await harness.profileRevisions.getOrCreateRevision("room-1", "user-1")
    harness.redis.eval = vi.fn(async () =>
      JSON.stringify({
        requesterId: "user-1",
        teachingProfile: profile,
        revision: currentRevision,
      })
    ) as never

    await expect(
      harness.orchestrator.infer("room-1", requesterMessage.id, {
        generation: "a".repeat(64),
        revision: 1,
      })
    ).rejects.toBeInstanceOf(InferenceNotStartedError)
    expect(harness.recordPublicMessage).not.toHaveBeenCalled()
    expect(harness.redis.multi).not.toHaveBeenCalled()
    expect(harness.publish).not.toHaveBeenCalled()
  })

  it("does not start inference when revocation wins during context loading", async () => {
    let releaseBoard!: () => void
    let signalBoardStarted!: () => void
    const boardBarrier = new Promise<void>((resolve) => {
      releaseBoard = resolve
    })
    const boardStarted = new Promise<void>((resolve) => {
      signalBoardStarted = resolve
    })
    const respond = vi.fn(async () => ({ text: "Must not be generated", provider: "local" }))
    const harness = createHarness(respond, async () => {
      signalBoardStarted()
      await boardBarrier
      return { id: "room-1", nodes: [], edges: [] }
    })
    await harness.profileRevisions.revokeRevision("room-1", "user-1")
    const currentRevision = await harness.profileRevisions.getOrCreateRevision("room-1", "user-1")
    harness.redis.eval = vi.fn(async () =>
      JSON.stringify({ requesterId: "user-1", teachingProfile: profile, revision: currentRevision })
    ) as never

    const inference = harness.orchestrator.infer("room-1", requesterMessage.id, {
      generation: "a".repeat(64),
      revision: 1,
    })
    await boardStarted
    await harness.profileRevisions.revokeRevision("room-1", "user-1")
    releaseBoard()

    await expect(inference).rejects.toBeInstanceOf(InferenceNotStartedError)
    expect(respond).not.toHaveBeenCalled()
    expect(harness.recordPublicMessage).not.toHaveBeenCalled()
    expect(harness.redis.multi).not.toHaveBeenCalled()
    expect(harness.publish).not.toHaveBeenCalled()
  })
})
