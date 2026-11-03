import { describe, expect, it, vi } from "vitest"
import { logger } from "../../logger.js"
import type { Redis } from "../../redis.js"
import * as chatRepositoryModule from "./chat-repository.js"
import { StaleInferenceClaimError } from "./inference-not-started.js"
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
  getBoard: () => unknown | Promise<unknown> = () => ({ id: "room-1", nodes: [], edges: [] }),
  requester = requesterMessage
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
    lRange: vi.fn(async () => [JSON.stringify(requester)]),
    multi: vi.fn(() => multi),
  } as unknown as Redis
  const rawChat = chatRepositoryModule.createChatRepository(redis, 3600)
  const chat = {
    append: vi.fn(rawChat.append),
    update: vi.fn(rawChat.update),
    commitAnswer: vi.fn(async () => true),
    list: vi.fn(rawChat.list),
  }
  const createChatRepositorySpy = vi
    .spyOn(chatRepositoryModule, "createChatRepository")
    .mockReturnValueOnce(chat as never)
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
  createChatRepositorySpy.mockRestore()
  return {
    redis,
    profileRevisions,
    orchestrator,
    recordPublicMessage,
    publish,
    multi,
    chat,
  }
}

describe("Room AI public publication boundary", () => {
  it("passes only the allowlisted profile to shared inference, never the private note", async () => {
    const respond = vi.fn(async () => ({
      text: "Here is a step-by-step explanation.",
      provider: "local",
    }))
    const harness = createHarness(respond)
    const callOrder: string[] = []
    harness.chat.commitAnswer.mockImplementation(async () => {
      callOrder.push("commitAnswer")
      return true
    })
    harness.publish.mockImplementation(async () => {
      callOrder.push("publish")
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

    await harness.orchestrator.infer("room-1", requesterMessage.id, {
      generation: "a".repeat(64),
      revision: 1,
    })

    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ teachingProfile: profile }))
    expect(JSON.stringify(respond.mock.calls)).not.toContain("PRIVATE_NOTE_CANARY")
    expect(JSON.stringify(harness.redis.multi.mock.calls)).not.toContain("PRIVATE_NOTE_CANARY")
    expect(harness.chat.append).not.toHaveBeenCalled()
    expect(harness.chat.commitAnswer).toHaveBeenCalledOnce()
    expect(harness.chat.commitAnswer).toHaveBeenCalledWith(
      "room-1",
      requesterMessage,
      expect.objectContaining({
        diagramId: "room-1",
        author: { id: "room-ai", name: "Room AI", kind: "ai" },
        intent: "ask",
        text: "Here is a step-by-step explanation.",
        replyTo: requesterMessage.id,
        provider: "local",
      })
    )
    expect(harness.publish).toHaveBeenCalledWith(
      "room-1",
      expect.objectContaining({ type: "message.created" })
    )
    expect(callOrder).toEqual(["commitAnswer", "publish"])
  })

  it("persists a change response as a pending proposal with its replica base", async () => {
    const proposal = { add: { elements: [], relationships: [] } }
    const changeRequester = { ...requesterMessage, intent: "change" as const }
    const respond = vi.fn(async () => ({
      text: "I prepared the change.",
      provider: "local",
      diff: proposal,
    }))
    const harness = createHarness(respond, undefined, changeRequester)
    await harness.profileRevisions.revokeRevision("room-1", "user-1")
    const currentRevision = await harness.profileRevisions.getOrCreateRevision("room-1", "user-1")
    harness.redis.eval = vi.fn(async () =>
      JSON.stringify({ requesterId: "user-1", teachingProfile: profile, revision: currentRevision })
    ) as never

    await harness.orchestrator.infer("room-1", changeRequester.id, {
      generation: "b".repeat(64),
      revision: 7,
    })

    expect(harness.chat.commitAnswer).toHaveBeenCalledWith(
      "room-1",
      changeRequester,
      expect.objectContaining({
        intent: "change",
        proposal: {
          diff: proposal,
          status: "pending",
          baseGeneration: "b".repeat(64),
          baseRev: 7,
        },
      })
    )
  })

  it("does not publish an assistant answer event or return success when commitAnswer returns false", async () => {
    const respond = vi.fn(async () => ({
      text: "Here is a step-by-step explanation.",
      provider: "local",
    }))
    const harness = createHarness(respond)
    harness.chat.commitAnswer.mockResolvedValueOnce(false)
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
    ).rejects.toThrow(StaleInferenceClaimError)

    expect(harness.chat.append).not.toHaveBeenCalled()
    expect(harness.chat.commitAnswer).toHaveBeenCalledOnce()
    expect(harness.publish).not.toHaveBeenCalled()
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
    ).rejects.toMatchObject({
      stage: "orchestrator_profile_revision_before_commit",
      reasonCode: "teaching_profile_revoked",
    })
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

    await expect(inference).rejects.toMatchObject({
      stage: "orchestrator_profile_revision_pre_inference",
      reasonCode: "teaching_profile_revoked",
    })
    expect(respond).not.toHaveBeenCalled()
    expect(harness.recordPublicMessage).not.toHaveBeenCalled()
    expect(harness.redis.multi).not.toHaveBeenCalled()
    expect(harness.publish).not.toHaveBeenCalled()
  })

  it("emits safe structured lifecycle logs and pre-board revocation codes without sensitive content", async () => {
    const infoSpy = vi.spyOn(logger, "info")
    const respond = vi.fn(async () => ({
      text: "Here is a step-by-step explanation.",
      provider: "self_hosted",
    }))
    const harness = createHarness(respond)

    await expect(
      harness.orchestrator.infer("room-1", requesterMessage.id, {
        generation: "a".repeat(64),
        revision: 1,
      })
    ).rejects.toMatchObject({
      stage: "orchestrator_profile_revision_pre_board",
      reasonCode: "teaching_profile_revoked",
    })

    const currentRevision = await harness.profileRevisions.getOrCreateRevision("room-1", "user-1")
    harness.redis.eval = vi.fn(async () =>
      JSON.stringify({
        requesterId: "user-1",
        teachingProfile: profile,
        revision: currentRevision,
      })
    ) as never

    infoSpy.mockClear()
    await harness.orchestrator.infer("room-1", requesterMessage.id, {
      generation: "a".repeat(64),
      revision: 1,
    })

    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "room_ai.inference.request_starting",
        diagramId: "room-1",
        messageId: requesterMessage.id,
        intent: "ask",
        route: "shared",
        hasTeachingProfile: true,
      }),
      "starting downstream Room AI inference request"
    )
    expect(respond).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: requesterMessage.id })
    )
    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "room_ai.inference.response_received",
        diagramId: "room-1",
        messageId: requesterMessage.id,
        provider: "self_hosted",
      }),
      "received downstream Room AI inference response"
    )
    const serializedLogs = JSON.stringify(infoSpy.mock.calls)
    expect(serializedLogs).not.toContain(requesterMessage.text)
    expect(serializedLogs).not.toContain("step_by_step")
    expect(serializedLogs).not.toContain("Shared")
    infoSpy.mockRestore()
  })
})
