import { describe, expect, it, vi } from "vitest"
import { getRedis } from "../../src/__tests__/setup.js"
import { k } from "../../src/redis.js"
import { createChatRepository } from "../../src/services/room-ai/chat-repository.js"
import { ConfirmedInferenceNotStartedError } from "../../src/services/room-ai/inference-not-started.js"
import {
  GLOBAL_LIMIT,
  GLOBAL_SLOTS,
  GLOBAL_SLOT_EXPIRES,
} from "../../src/services/room-ai/inference-slots.js"
import { createRoomAiEventBus } from "../../src/services/room-ai/room-ai-event-bus.js"
import {
  runWithRoomAiDispatchClaimContext,
  StaleInferenceClaimError,
} from "../../src/services/room-ai/inference-not-started.js"
import { createRoomAiOrchestrator } from "../../src/services/room-ai/room-ai-orchestrator.js"
import {
  createRoomAiTestDispatcher,
  createRoomAiTestService,
} from "./helpers/room-ai-test-support.js"

describe("Room AI Fenced Recovery (T1)", () => {
  it("recovers an abandoned claim after bounded lease timeout and maintains FIFO order", async () => {
    const redis = await getRedis()
    const diagramId = "abandoned-fifo-room"
    await redis.set(k.diagram(diagramId), "exists")

    const service = createRoomAiTestService({ redis, ttlSeconds: 3600 })
    const user = { id: "u1", name: "User" } as never

    // Post message 1 and message 2
    const post1 = await service.postMessage({
      diagramId,
      author: user,
      text: "First question",
      intent: "ask",
    })
    const post2 = await service.postMessage({
      diagramId,
      author: user,
      text: "Second question",
      intent: "ask",
    })

    // Simulate Worker 1 claiming message 1 with an abandoned claim (e.g. simulated crash)
    // Worker 1 has claimLeaseMs of 100ms
    const worker1 = createRoomAiTestDispatcher({
      redis,
      maxConcurrency: 1,
      claimLeaseMs: 100,
      infer: async () => {
        // Worker 1 hangs/crashes and never resolves or releases
        await new Promise(() => {})
      },
    })

    expect(await worker1.processRoom(diagramId)).toBe(true)
    // Immediately, worker 2 cannot claim because lease is still active
    const processedMessages: string[] = []
    const worker2 = createRoomAiTestDispatcher({
      redis,
      maxConcurrency: 1,
      claimLeaseMs: 500,
      infer: async (_diagramId, messageId) => {
        processedMessages.push(messageId)
      },
    })

    expect(await worker2.processRoom(diagramId)).toBe(false)

    // Wait for the lease of message 1 to expire (>100ms)
    await new Promise((resolve) => setTimeout(resolve, 150))

    // Worker 2 should now automatically recover the abandoned claim for message 1
    expect(await worker2.processRoom(diagramId)).toBe(true)
    await worker2.waitForIdle()

    // And then Worker 2 can process message 2 (FIFO preserved)
    expect(await worker2.processRoom(diagramId)).toBe(true)
    await worker2.waitForIdle()

    expect(processedMessages).toEqual([post1.messageId, post2.messageId])

    await worker1.close()
    await worker2.close()
  })

  it("wakes recovery when a new request is rejected by a full persisted queue", async () => {
    const redis = await getRedis()
    const diagramId = "restart-full-queue-room"
    await redis.set(k.diagram(diagramId), "exists")

    const seen: string[] = []
    let recoveryDrain: Promise<void> | undefined
    const dispatcher = createRoomAiTestDispatcher({
      redis,
      maxConcurrency: 1,
      claimLeaseMs: 100,
      infer: async (_roomId, messageId) => {
        seen.push(messageId)
      },
    })
    const serviceOptions = {
      redis,
      ttlSeconds: 3600,
      onQueueFull: (roomId: string) => {
        recoveryDrain = dispatcher.drainRoom(roomId)
      },
    }
    const service = createRoomAiTestService(
      serviceOptions as Parameters<typeof createRoomAiTestService>[0]
    )
    const user = { id: "u1", name: "User" } as never
    const queuedIds: string[] = []

    for (let index = 0; index < 5; index++) {
      const result = await service.postMessage({
        diagramId,
        author: user,
        text: `Queued question ${index + 1}`,
        intent: "ask",
      })
      queuedIds.push(result.messageId)
    }

    const staleToken = "abandoned-worker-before-restart"
    await redis.rPush(
      k.aiChat(diagramId),
      JSON.stringify({
        id: "completed-before-restart",
        diagramId,
        text: "Previous answer",
        author: { id: "u1", name: "User", kind: "user" },
        status: "answered",
      })
    )
    await redis.set(k.aiActive(diagramId), staleToken)
    await redis.set(k.aiActiveLease(diagramId), String(Date.now() - 1_000))
    await redis.set(k.aiActiveMessage(diagramId), "completed-before-restart")
    await redis.set(GLOBAL_LIMIT, "1")
    await redis.sAdd(GLOBAL_SLOTS, staleToken)
    await redis.zAdd(GLOBAL_SLOT_EXPIRES, { score: Date.now() - 1_000, value: staleToken })

    await expect(
      service.postMessage({
        diagramId,
        author: user,
        text: "Request that triggers restart recovery",
        intent: "ask",
      })
    ).rejects.toMatchObject({ name: "RoomQueueFullError" })

    expect(recoveryDrain).toBeDefined()
    await recoveryDrain

    expect(seen).toEqual(queuedIds)
    expect(await redis.lLen(k.aiQueue(diagramId))).toBe(0)
    expect(await redis.exists(k.aiActive(diagramId))).toBe(0)
    expect(await redis.sCard(GLOBAL_SLOTS)).toBe(0)
    await dispatcher.close()
  })

  it("fences stale completion: recovered claim rejects stale inference commits and side effects", async () => {
    const redis = await getRedis()
    const diagramId = "fenced-stale-room"
    await redis.set(k.diagram(diagramId), "exists")

    const service = createRoomAiTestService({ redis, ttlSeconds: 3600 })
    const user = { id: "u1", name: "User" } as never
    const profileRevision = await service.getPersonalProfileRevision(diagramId, "u1")
    const teachingProfile = { detailLevel: "step_by_step", exampleStyle: "code" } as const

    const initialPost = await service.postMessage({
      diagramId,
      author: user,
      text: "Stale question",
      intent: "ask",
      teachingProfile,
      profileRevision,
    })

    let worker1Complete!: () => void
    const worker1Gate = new Promise<void>((resolve) => {
      worker1Complete = resolve
    })

    let worker1AttemptedCommit = false
    let worker1SeenProfile: unknown
    const worker1RecordPublicMessage = vi.fn(async () => {})
    const worker1Events: Array<{ type: string; status?: string }> = []
    const orchestrator1 = createRoomAiOrchestrator({
      redis,
      ttlSeconds: 3600,
      getBoard: () => ({ nodes: [], edges: [] }) as never,
      getMemory: async () => ({ summary: "", decisions: [] }),
      getAuthorship: async () => ({}),
      recordPublicMessage: worker1RecordPublicMessage,
      publish: (_diagramId, event) => {
        worker1Events.push(event)
      },
      respond: async (req) => {
        worker1SeenProfile = req.teachingProfile
        // Wait until recovery has occurred before responding
        await worker1Gate
        worker1AttemptedCommit = true
        return { text: "Stale answer from worker 1", provider: "stale-provider" }
      },
    })

    const worker1 = createRoomAiTestDispatcher({
      redis,
      maxConcurrency: 1,
      claimLeaseMs: 100,
      publish: (_diagramId, event) => {
        worker1Events.push(event)
      },
      infer: (diagramId, messageId, replica) => orchestrator1.infer(diagramId, messageId, replica),
    })

    expect(await worker1.processRoom(diagramId)).toBe(true)

    // Wait for worker 1's claim lease to expire
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(worker1SeenProfile).toEqual({ ...teachingProfile, preferences: [] })
    worker1Events.length = 0

    // Worker 2 recovers the claim and still receives the preserved personal profile sidecar
    let worker2Ran = false
    let worker2SeenProfile: unknown
    const worker2RecordPublicMessage = vi.fn(async () => {})
    const orchestrator2 = createRoomAiOrchestrator({
      redis,
      ttlSeconds: 3600,
      getBoard: () => ({ nodes: [], edges: [] }) as never,
      getMemory: async () => ({ summary: "", decisions: [] }),
      getAuthorship: async () => ({}),
      recordPublicMessage: worker2RecordPublicMessage,
      respond: async (req) => {
        worker2Ran = true
        worker2SeenProfile = req.teachingProfile
        return { text: "Fresh answer from worker 2", provider: "fresh-provider" }
      },
    })

    const worker2 = createRoomAiTestDispatcher({
      redis,
      maxConcurrency: 1,
      claimLeaseMs: 2000,
      infer: orchestrator2.infer,
    })

    expect(await worker2.processRoom(diagramId)).toBe(true)
    await worker2.waitForIdle()
    expect(worker2Ran).toBe(true)
    expect(worker2SeenProfile).toEqual({ ...teachingProfile, preferences: [] })
    expect(worker2RecordPublicMessage).toHaveBeenCalledTimes(2)
    expect(await redis.get(k.aiPersonalProfile(diagramId, initialPost.messageId))).toBeNull()

    // Post a second message and have worker 2 hold an active claim while worker 1 completes late
    await service.postMessage({
      diagramId,
      author: user,
      text: "Follow-up while worker 1 finishes late",
      intent: "ask",
    })
    let releaseWorker2FollowUp!: () => void
    const worker2FollowUpGate = new Promise<void>((resolve) => {
      releaseWorker2FollowUp = resolve
    })
    const worker2Active = createRoomAiTestDispatcher({
      redis,
      maxConcurrency: 1,
      claimLeaseMs: 2000,
      infer: async () => {
        await worker2FollowUpGate
      },
    })
    expect(await worker2Active.processRoom(diagramId)).toBe(true)
    const activeTokenBeforeStaleFinish = await redis.get(k.aiActive(diagramId))
    expect(activeTokenBeforeStaleFinish).toBeTruthy()

    // Now let worker 1 complete late while worker2Active holds the room claim & global slot
    worker1Complete()
    await worker1.waitForIdle()
    expect(worker1AttemptedCommit).toBe(true)

    // Stale worker 1 must not record public memory, emit events/status, or release worker 2's active claim/slot
    expect(worker1RecordPublicMessage).not.toHaveBeenCalled()
    expect(worker1Events).toEqual([])
    expect(await redis.get(k.aiActive(diagramId))).toBe(activeTokenBeforeStaleFinish)
    expect(await redis.sCard(GLOBAL_SLOTS)).toBe(1)

    releaseWorker2FollowUp()
    await worker2Active.waitForIdle()

    // Verify chat messages: only worker 2's answer is appended, NOT worker 1's stale answer
    const { messages } = await service.listMessages(diagramId)
    const answers = messages.filter((m) => m.author.kind === "ai")
    expect(answers).toHaveLength(1)
    expect(answers[0]?.text).toContain("Fresh answer from worker 2")

    await worker1.close()
    await worker2.close()
    await worker2Active.close()
  })

  it("releases slots idempotently without underflowing global capacity even on duplicate or stale release", async () => {
    const redis = await getRedis()
    const diagramId = "idempotent-release-room"
    await redis.set(k.diagram(diagramId), "exists")

    const service = createRoomAiTestService({ redis, ttlSeconds: 3600 })
    const user = { id: "u1", name: "User" } as never

    await service.postMessage({
      diagramId,
      author: user,
      text: "Release test",
      intent: "ask",
    })

    const worker = createRoomAiTestDispatcher({
      redis,
      maxConcurrency: 2,
      claimLeaseMs: 1000,
      infer: async () => {},
    })

    expect(await worker.processRoom(diagramId)).toBe(true)
    await worker.waitForIdle()

    // Global slots should be 0 after successful completion
    expect(await redis.sCard(GLOBAL_SLOTS)).toBe(0)

    // Attempting duplicate release should not throw or underflow
    await worker.close()
    expect(await redis.sCard(GLOBAL_SLOTS)).toBe(0)
  })

  it("T5: stale inference cleanup cannot delete replacement sidecars after claim takeover", async () => {
    const redis = await getRedis()
    const diagramId = "t5-sidecar-cleanup-race-room"
    await redis.set(k.diagram(diagramId), "exists")

    const service = createRoomAiTestService({ redis, ttlSeconds: 3600 })
    const { messageId } = await service.postMessage({
      diagramId,
      author: { id: "u1", name: "User" } as never,
      text: "Sidecar cleanup race",
      intent: "ask",
    })
    const replicaKey = k.aiReplicaRequirement(diagramId, messageId)
    const profileKey = k.aiPersonalProfile(diagramId, messageId)
    await redis.set(replicaKey, "old-replica-sidecar")
    await redis.set(profileKey, "old-profile-sidecar")

    let resumeCleanup!: () => void
    const cleanupGate = new Promise<void>((resolve) => {
      resumeCleanup = resolve
    })
    let cleanupPaused!: () => void
    const cleanupPausedPromise = new Promise<void>((resolve) => {
      cleanupPaused = resolve
    })
    const originalEval = redis.eval.bind(redis)
    let paused = false
    const evalSpy = vi.spyOn(redis, "eval").mockImplementation(async function (...args) {
      const [script, options] = args
      if (script.includes("room_ai_sidecar_cleanup") && !paused) {
        paused = true
        cleanupPaused()
        await cleanupGate
      }
      return Reflect.apply(originalEval, redis, [script, options])
    })

    const worker = createRoomAiTestDispatcher({
      redis,
      maxConcurrency: 1,
      claimLeaseMs: 2000,
      infer: async () => {
        throw new ConfirmedInferenceNotStartedError("test rejection", {
          stage: "responder_config",
          reasonCode: "service_url_missing",
        })
      },
    })

    try {
      expect(await worker.processRoom(diagramId)).toBe(true)
      await cleanupPausedPromise

      // Take over while the old worker is paused after its ownership check.
      await redis.set(k.aiActive(diagramId), "replacement-owner")
      await redis.set(k.aiActiveLease(diagramId), String(Date.now() + 60_000))
      await redis.set(replicaKey, "replacement-replica-sidecar")
      await redis.set(profileKey, "replacement-profile-sidecar")
      resumeCleanup()
      await worker.waitForIdle()

      expect(await redis.get(replicaKey)).toBe("replacement-replica-sidecar")
      expect(await redis.get(profileKey)).toBe("replacement-profile-sidecar")
      expect(await redis.get(k.aiActive(diagramId))).toBe("replacement-owner")
    } finally {
      resumeCleanup()
      evalSpy.mockRestore()
      await worker.close()
      await redis.del(
        replicaKey,
        profileKey,
        k.aiActive(diagramId),
        k.aiActiveLease(diagramId),
        k.aiActiveMessage(diagramId)
      )
    }
  })

  it("T5: sidecar cleanup rejects an EVAL delayed past the lease expiry", async () => {
    const redis = await getRedis()
    const diagramId = "t5-sidecar-cleanup-expired-lease-room"
    const leaseMs = 1000
    await redis.set(k.diagram(diagramId), "exists")

    const service = createRoomAiTestService({ redis, ttlSeconds: 3600 })
    const { messageId } = await service.postMessage({
      diagramId,
      author: { id: "u1", name: "User" } as never,
      text: "Delayed sidecar cleanup",
      intent: "ask",
    })
    const replicaKey = k.aiReplicaRequirement(diagramId, messageId)
    const profileKey = k.aiPersonalProfile(diagramId, messageId)
    await redis.set(replicaKey, "initial-replica-sidecar")
    await redis.set(profileKey, "initial-profile-sidecar")

    const originalEval = redis.eval.bind(redis)
    let cleanupPaused!: () => void
    const cleanupPausedPromise = new Promise<void>((resolve) => {
      cleanupPaused = resolve
    })
    let paused = false
    const evalSpy = vi.spyOn(redis, "eval").mockImplementation(async (...args) => {
      const [script, options] = args
      if (script.includes("room_ai_sidecar_cleanup") && !paused) {
        paused = true
        cleanupPaused()
        await new Promise((resolve) => setTimeout(resolve, leaseMs + 100))
        await redis.set(replicaKey, "replacement-replica-sidecar")
        await redis.set(profileKey, "replacement-profile-sidecar")
      }
      return Reflect.apply(originalEval, redis, [script, options])
    })

    const worker = createRoomAiTestDispatcher({
      redis,
      maxConcurrency: 1,
      claimLeaseMs: leaseMs,
      infer: async () => {
        throw new ConfirmedInferenceNotStartedError("test rejection", {
          stage: "responder_config",
          reasonCode: "service_url_missing",
        })
      },
    })

    try {
      expect(await worker.processRoom(diagramId)).toBe(true)
      await cleanupPausedPromise
      await worker.waitForIdle()

      expect(await redis.get(replicaKey)).toBe("replacement-replica-sidecar")
      expect(await redis.get(profileKey)).toBe("replacement-profile-sidecar")
    } finally {
      evalSpy.mockRestore()
      await worker.close()
      await redis.del(replicaKey, profileKey)
    }
  })

  it("allows current claim to update status and fences stale/expired claim at UPDATE_BY_ID", async () => {
    const redis = await getRedis()
    const diagramId = "fenced-update-by-id-room"
    await redis.set(k.diagram(diagramId), "exists")

    const service = createRoomAiTestService({ redis, ttlSeconds: 3600 })
    const user = { id: "u1", name: "User" } as never

    const first = await service.postMessage({
      diagramId,
      author: user,
      text: "First request",
      intent: "ask",
    })

    // 1. Current claim can update status via atomic UPDATE_BY_ID
    const currentWorker = createRoomAiTestDispatcher({
      redis,
      maxConcurrency: 2,
      claimLeaseMs: 2000,
      infer: async () => {},
    })
    expect(await currentWorker.processRoom(diagramId)).toBe(true)
    await currentWorker.waitForIdle()
    await currentWorker.close()

    const afterCurrent = await service.listMessages(diagramId)
    expect(afterCurrent.messages.find((m) => m.id === first.messageId)?.status).toBe("answered")

    // 2. Stale/expired claim cannot update status even if claim expires after pre-check and before UPDATE_BY_ID
    const second = await service.postMessage({
      diagramId,
      author: user,
      text: "Second request",
      intent: "ask",
    })

    let releaseInfer!: () => void
    const inferGate = new Promise<void>((resolve) => {
      releaseInfer = resolve
    })
    const staleEvents: unknown[] = []

    const originalEval = redis.eval.bind(redis)
    let expireBeforeUpdateById = false
    const evalSpy = vi.spyOn(redis, "eval").mockImplementation((async (
      script: string,
      options: Parameters<typeof redis.eval>[1]
    ) => {
      if (expireBeforeUpdateById && script.includes("LSET")) {
        // Claim expires right after pre-checks and chat.list, immediately before UPDATE_BY_ID executes
        await redis.set(k.aiActiveLease(diagramId), String(Date.now() - 10))
      }
      return originalEval(script, options)
    }) as typeof redis.eval)

    try {
      const staleWorker = createRoomAiTestDispatcher({
        redis,
        maxConcurrency: 2,
        claimLeaseMs: 5000,
        infer: async () => {
          await inferGate
          expireBeforeUpdateById = true
          throw new Error("stale failure after lease expiry")
        },
        publish: async (_room, event) => {
          if (event.type === "message.updated") staleEvents.push(event)
        },
      })

      expect(await staleWorker.processRoom(diagramId)).toBe(true)
      releaseInfer()
      await staleWorker.waitForIdle()
      await staleWorker.close()
    } finally {
      evalSpy.mockRestore()
    }

    const afterStale = await service.listMessages(diagramId)
    const secondMsg = afterStale.messages.find((m) => m.id === second.messageId)
    expect(secondMsg?.status).toBe("queued")
    expect(staleEvents).toEqual([])
  })

  it("T2A: atomically commits requester answered status and assistant answer once under valid claim, rejecting stale or expired claims", async () => {
    const redis = await getRedis()
    const diagramId = "t2a-commit-answer-room"
    const ttlSeconds = 3600
    await redis.set(k.diagram(diagramId), "exists")

    type TestChatMessage = {
      id: string
      status: "queued" | "answered" | "failed"
      text: string
      replyToMessageId?: string
    }

    const chat = createChatRepository<TestChatMessage>(redis, ttlSeconds)
    const service = createRoomAiTestService({ redis, ttlSeconds })
    const user = { id: "u1", name: "User" } as never

    // 1. Valid claim commits answered status + appends assistant answer once (deduped by answer.id)
    const first = await service.postMessage({
      diagramId,
      author: user,
      text: "First question",
      intent: "ask",
    })
    const firstAnswer: TestChatMessage = {
      id: `${first.messageId}:answer`,
      status: "answered",
      text: "First assistant answer",
      replyToMessageId: first.messageId,
    }

    const validWorker = createRoomAiTestDispatcher({
      redis,
      maxConcurrency: 1,
      claimLeaseMs: 2000,
      infer: async (_room, messageId) => {
        const page = await chat.list(diagramId)
        const requester = page.messages.find((m) => m.id === messageId)
        expect(requester?.status).toBe("queued")

        const committedFirst = await chat.commitAnswer(diagramId, requester!, firstAnswer)
        const committedDuplicate = await chat.commitAnswer(diagramId, requester!, firstAnswer)
        const committedConflicting = await chat.commitAnswer(diagramId, requester!, {
          id: `${first.messageId}:conflicting-answer`,
          status: "answered",
          text: "Conflicting second answer for already-answered requester",
          replyToMessageId: first.messageId,
        })
        expect(committedFirst).toBe(true)
        expect(committedDuplicate).toBe(true)
        expect(committedConflicting).toBe(false)
      },
    })

    expect(await validWorker.processRoom(diagramId)).toBe(true)
    await validWorker.waitForIdle()
    await validWorker.close()

    const afterValid = await chat.list(diagramId)
    expect(afterValid.messages.map((m) => ({ id: m.id, status: m.status, text: m.text }))).toEqual([
      { id: first.messageId, status: "answered", text: "First question" },
      { id: firstAnswer.id, status: "answered", text: "First assistant answer" },
    ])
    expect(await redis.ttl(k.aiChat(diagramId))).toBeGreaterThan(0)

    // 2. Calling commitAnswer without an active claim context throws StaleInferenceClaimError
    await expect(
      chat.commitAnswer(
        diagramId,
        { id: first.messageId, status: "queued", text: "First question" },
        { id: "no-claim-answer", status: "answered", text: "Should fail" }
      )
    ).rejects.toBeInstanceOf(StaleInferenceClaimError)

    // 3. Stale/replaced or expired claim cannot alter requester status or append an answer
    const second = await service.postMessage({
      diagramId,
      author: user,
      text: "Second question",
      intent: "ask",
    })

    const staleWorkerErrors: unknown[] = []
    const staleWorker = createRoomAiTestDispatcher({
      redis,
      maxConcurrency: 1,
      claimLeaseMs: 2000,
      infer: async (_room, messageId) => {
        const page = await chat.list(diagramId)
        const requester = page.messages.find((m) => m.id === messageId)!

        // Simulate claim token replacement before commit
        const originalToken = await redis.get(k.aiActive(diagramId))
        await redis.set(k.aiActive(diagramId), "replaced-claim-token")
        try {
          await chat.commitAnswer(diagramId, requester, {
            id: `${messageId}:stale-token-answer`,
            status: "answered",
            text: "Should be rejected due to replaced token",
          })
        } catch (err) {
          staleWorkerErrors.push(err)
        }

        // Restore token, then simulate lease expiry before commit
        if (originalToken) {
          await redis.set(k.aiActive(diagramId), originalToken)
        }
        await redis.set(k.aiActiveLease(diagramId), String(Date.now() - 10))
        try {
          await chat.commitAnswer(diagramId, requester, {
            id: `${messageId}:expired-lease-answer`,
            status: "answered",
            text: "Should be rejected due to expired lease",
          })
        } catch (err) {
          staleWorkerErrors.push(err)
        }
      },
    })

    expect(await staleWorker.processRoom(diagramId)).toBe(true)
    await staleWorker.waitForIdle()
    await staleWorker.close()

    expect(staleWorkerErrors).toHaveLength(2)
    expect(staleWorkerErrors[0]).toBeInstanceOf(StaleInferenceClaimError)
    expect(staleWorkerErrors[1]).toBeInstanceOf(StaleInferenceClaimError)

    const afterStaleAttempts = await chat.list(diagramId)
    expect(
      afterStaleAttempts.messages.map((m) => ({ id: m.id, status: m.status, text: m.text }))
    ).toEqual([
      { id: first.messageId, status: "answered", text: "First question" },
      { id: firstAnswer.id, status: "answered", text: "First assistant answer" },
      { id: second.messageId, status: "queued", text: "Second question" },
    ])
  })

  it("T2A Rule A: stored requester marked failed remains failed and no assistant answer is appended even when caller snapshot was queued", async () => {
    const redis = await getRedis()
    const diagramId = "t2a-rule-a-failed-requester-room"
    const ttlSeconds = 3600
    await redis.set(k.diagram(diagramId), "exists")

    type TestChatMessage = {
      id: string
      status: "queued" | "answered" | "failed"
      text: string
      replyToMessageId?: string
    }

    const chat = createChatRepository<TestChatMessage>(redis, ttlSeconds)
    const service = createRoomAiTestService({ redis, ttlSeconds })
    const user = { id: "u1", name: "User" } as never

    const post = await service.postMessage({
      diagramId,
      author: user,
      text: "Question that fails before commit",
      intent: "ask",
    })

    let commitResult: boolean | undefined
    let afterCommitAttemptMessages: Array<Pick<TestChatMessage, "id" | "status" | "text">> = []
    const worker = createRoomAiTestDispatcher({
      redis,
      maxConcurrency: 1,
      claimLeaseMs: 2000,
      infer: async (_room, messageId) => {
        const page = await chat.list(diagramId)
        const queuedSnapshot = page.messages.find((m) => m.id === messageId)!
        expect(queuedSnapshot.status).toBe("queued")

        // Stored requester transitions to failed after the caller took its snapshot
        expect(
          await chat.update(diagramId, {
            ...queuedSnapshot,
            status: "failed",
          })
        ).toBe(true)

        commitResult = await chat.commitAnswer(diagramId, queuedSnapshot, {
          id: `${messageId}:answer`,
          status: "answered",
          text: "Assistant answer that must not be committed",
          replyToMessageId: messageId,
        })

        const afterCommitAttempt = await chat.list(diagramId)
        afterCommitAttemptMessages = afterCommitAttempt.messages.map((m) => ({
          id: m.id,
          status: m.status,
          text: m.text,
        }))
      },
    })

    expect(await worker.processRoom(diagramId)).toBe(true)
    await worker.waitForIdle()
    await worker.close()

    expect(commitResult).toBe(false)
    expect(afterCommitAttemptMessages).toEqual([
      { id: post.messageId, status: "failed", text: "Question that fails before commit" },
    ])
  })

  it("T2A Rule B: with 200 chat entries and active requester oldest, commit keeps list length 200, keeps answered requester and assistant answer, and drops oldest non-requester entry", async () => {
    const redis = await getRedis()
    const diagramId = "t2a-rule-b-cap-preserves-requester-room"
    const ttlSeconds = 3600
    await redis.set(k.diagram(diagramId), "exists")

    type TestChatMessage = {
      id: string
      status: "queued" | "answered" | "failed"
      text: string
      replyToMessageId?: string
    }

    const chat = createChatRepository<TestChatMessage>(redis, ttlSeconds)
    const service = createRoomAiTestService({ redis, ttlSeconds })
    const user = { id: "u1", name: "User" } as never

    const post = await service.postMessage({
      diagramId,
      author: user,
      text: "Oldest active requester",
      intent: "ask",
    })

    for (let i = 1; i <= 199; i++) {
      await chat.append(diagramId, {
        id: `filler-${i}`,
        status: "answered",
        text: `Filler message ${i}`,
      })
    }
    expect(await redis.lLen(k.aiChat(diagramId))).toBe(200)

    const answer: TestChatMessage = {
      id: `${post.messageId}:answer`,
      status: "answered",
      text: "Answer at 200 cap",
      replyToMessageId: post.messageId,
    }

    const worker = createRoomAiTestDispatcher({
      redis,
      maxConcurrency: 1,
      claimLeaseMs: 2000,
      infer: async (_room, messageId) => {
        const page = await chat.list(diagramId, { limit: 200 })
        const requester = page.messages.find((m) => m.id === messageId)!
        expect(requester.status).toBe("queued")
        expect(page.messages[0]?.id).toBe(messageId)

        expect(await chat.commitAnswer(diagramId, requester, answer)).toBe(true)
        expect(await chat.commitAnswer(diagramId, requester, answer)).toBe(true)
      },
    })

    expect(await worker.processRoom(diagramId)).toBe(true)
    await worker.waitForIdle()
    await worker.close()

    expect(await redis.lLen(k.aiChat(diagramId))).toBe(200)
    const afterCommit = await chat.list(diagramId, { limit: 200 })
    expect(afterCommit.messages).toHaveLength(200)

    const storedRequester = afterCommit.messages.find((m) => m.id === post.messageId)
    expect(storedRequester).toMatchObject({
      id: post.messageId,
      status: "answered",
      text: "Oldest active requester",
    })
    expect(afterCommit.messages[afterCommit.messages.length - 1]).toEqual(answer)
    expect(afterCommit.messages.some((m) => m.id === "filler-1")).toBe(false)
    expect(afterCommit.messages.some((m) => m.id === "filler-2")).toBe(true)
  })

  it("T3: atomic answer-commit race: paused old COMMIT_ANSWER rejects with StaleInferenceClaimError after claim takeover", async () => {
    const redis = await getRedis()
    const diagramId = "t3-answer-commit-race-room"
    const ttlSeconds = 3600
    await redis.set(k.diagram(diagramId), "exists")

    type TestChatMessage = {
      id: string
      status: "queued" | "answered" | "failed"
      text: string
      replyToMessageId?: string
    }

    const chat = createChatRepository<TestChatMessage>(redis, ttlSeconds)
    const service = createRoomAiTestService({ redis, ttlSeconds })
    const user = { id: "u1", name: "User" } as never

    // 1. Seed a queued requester and install an old active token + unexpired lease in test Redis.
    const post = await service.postMessage({
      diagramId,
      author: user,
      text: "Race requester question",
      intent: "ask",
    })

    const oldToken = "old-worker-claim-token"
    const leaseExpiryMs = Date.now() + 60_000
    await redis.set(k.aiActive(diagramId), oldToken)
    await redis.set(k.aiActiveLease(diagramId), String(leaseExpiryMs))

    const oldAnswer: TestChatMessage = {
      id: `${post.messageId}:old-answer`,
      status: "answered",
      text: "Stale answer from old worker",
      replyToMessageId: post.messageId,
    }

    const freshAnswer: TestChatMessage = {
      id: `${post.messageId}:fresh-answer`,
      status: "answered",
      text: "Fresh answer from new worker",
      replyToMessageId: post.messageId,
    }

    // 2. Start the old worker's commit under runWithRoomAiDispatchClaimContext; prove its ownership check succeeds.
    // Intercept Redis eval for that old token's COMMIT_ANSWER and pause immediately before the Lua call executes.
    let oldOwnershipCheckPassed = false
    let oldCommitEnteredLuaGate = false

    let pauseOldCommitResolve!: () => void
    const pauseOldCommitPromise = new Promise<void>((resolve) => {
      pauseOldCommitResolve = resolve
    })

    let oldCommitPausedResolve!: () => void
    const oldCommitPausedPromise = new Promise<void>((resolve) => {
      oldCommitPausedResolve = resolve
    })

    const originalEval = redis.eval.bind(redis)
    const evalSpy = vi.spyOn(redis, "eval").mockImplementation(function (
      this: unknown,
      ...args: unknown[]
    ) {
      const [script, options] = args as [
        string,
        { keys?: string[]; arguments?: string[] } | undefined,
      ]
      if (
        typeof script === "string" &&
        script.includes("requesterStatus == 'answered'") &&
        Array.isArray(options?.arguments) &&
        options.arguments.includes(oldToken)
      ) {
        oldCommitEnteredLuaGate = true
        oldCommitPausedResolve()
        return pauseOldCommitPromise.then(
          () => Reflect.apply(originalEval, redis, args) as Promise<unknown>
        )
      }
      return Reflect.apply(originalEval, redis, args) as Promise<unknown>
    })

    let oldWorkerError: unknown = null

    try {
      const oldWorkerCommitPromise = (async () => {
        const page = await chat.list(diagramId)
        const requester = page.messages.find((m) => m.id === post.messageId)!
        expect(requester).toBeDefined()
        expect(requester.status).toBe("queued")

        const oldContext = {
          claimToken: oldToken,
          async assertCurrentClaim(): Promise<void> {
            const activeToken = await redis.get(k.aiActive(diagramId))
            const leaseRaw = await redis.get(k.aiActiveLease(diagramId))
            const leaseTime = leaseRaw ? Number(leaseRaw) : 0
            if (activeToken !== oldToken || leaseTime <= Date.now()) {
              throw new StaleInferenceClaimError()
            }
          },
        }

        try {
          await runWithRoomAiDispatchClaimContext(oldContext, async () => {
            // Prove its ownership check succeeds prior to commit
            await oldContext.assertCurrentClaim()
            oldOwnershipCheckPassed = true

            await chat.commitAnswer(diagramId, requester, oldAnswer)
          })
        } catch (err) {
          oldWorkerError = err
        }
      })()

      // Wait deterministically until old commit is intercepted right before Lua execution
      await oldCommitPausedPromise
      expect(oldOwnershipCheckPassed).toBe(true)
      expect(oldCommitEnteredLuaGate).toBe(true)

      // 3. While paused, replace the active token/lease with a new token (test takeover),
      // and commit a distinct fresh answer under the new context.
      const newToken = "new-takeover-claim-token"
      await redis.set(k.aiActive(diagramId), newToken)
      await redis.set(k.aiActiveLease(diagramId), String(Date.now() + 60_000))

      const newContext = {
        claimToken: newToken,
        async assertCurrentClaim(): Promise<void> {
          const activeToken = await redis.get(k.aiActive(diagramId))
          const leaseRaw = await redis.get(k.aiActiveLease(diagramId))
          const leaseTime = leaseRaw ? Number(leaseRaw) : 0
          if (activeToken !== newToken || leaseTime <= Date.now()) {
            throw new StaleInferenceClaimError()
          }
        },
      }

      await runWithRoomAiDispatchClaimContext(newContext, async () => {
        await newContext.assertCurrentClaim()
        const page = await chat.list(diagramId)
        const queuedRequester = page.messages.find((m) => m.id === post.messageId)!
        expect(queuedRequester.status).toBe("queued")
        const freshCommitted = await chat.commitAnswer(diagramId, queuedRequester, freshAnswer)
        expect(freshCommitted).toBe(true)
      })

      // 4. Resume the old COMMIT_ANSWER. It must reject with StaleInferenceClaimError.
      pauseOldCommitResolve()
      await oldWorkerCommitPromise

      expect(oldWorkerError).toBeInstanceOf(StaleInferenceClaimError)

      // 5. Assert the requester is answered, only the fresh answer exists exactly once,
      // stale answer is absent, and Redis still holds the new token.
      const finalList = await chat.list(diagramId)
      const finalRequester = finalList.messages.find((m) => m.id === post.messageId)
      expect(finalRequester?.status).toBe("answered")

      const freshAnswers = finalList.messages.filter((m) => m.id === freshAnswer.id)
      expect(freshAnswers).toHaveLength(1)
      expect(freshAnswers[0]).toMatchObject(freshAnswer)

      const staleAnswers = finalList.messages.filter((m) => m.id === oldAnswer.id)
      expect(staleAnswers).toHaveLength(0)

      const currentActiveToken = await redis.get(k.aiActive(diagramId))
      expect(currentActiveToken).toBe(newToken)
    } finally {
      evalSpy.mockRestore()
    }
  })

  it("does not invoke recordPublicMessage until requester and answer are durably committed", async () => {
    const redis = await getRedis()
    const diagramId = "fenced-memory-after-commit-room"
    const ttlSeconds = 3600
    await redis.set(k.diagram(diagramId), "exists")

    type TestChatMessage = {
      id: string
      status?: "queued" | "answered" | "failed"
      text: string
      replyTo?: string
    }

    const chat = createChatRepository<TestChatMessage>(redis, ttlSeconds)
    const service = createRoomAiTestService({ redis, ttlSeconds })
    const user = { id: "u1", name: "User" } as never

    const post = await service.postMessage({
      diagramId,
      author: user,
      text: "Explain class diagrams",
      intent: "ask",
    })

    const snapshots: Array<{
      text: string
      requesterStatus: string | undefined
      answerCommitted: boolean
    }> = []

    const recordPublicMessage = vi.fn(async (_roomId: string, publicText: string) => {
      const currentChat = await chat.list(diagramId)
      const requester = currentChat.messages.find((m) => m.id === post.messageId)
      const committedAnswer = currentChat.messages.find((m) => m.replyTo === post.messageId)
      snapshots.push({
        text: publicText,
        requesterStatus: requester?.status,
        answerCommitted: Boolean(committedAnswer),
      })
    })

    const originalEval = redis.eval.bind(redis)
    let fencedFirstCommit = false
    const evalSpy = vi.spyOn(redis, "eval").mockImplementation(async (...args: unknown[]) => {
      const [script] = args
      if (
        !fencedFirstCommit &&
        typeof script === "string" &&
        script.includes("requesterStatus == 'answered'")
      ) {
        fencedFirstCommit = true
        await redis.set(k.aiActive(diagramId), "expired-claim-token")
        await redis.set(k.aiActiveLease(diagramId), "1")
      }
      return Reflect.apply(originalEval, redis, args) as Promise<unknown>
    })

    const orchestrator1 = createRoomAiOrchestrator({
      redis,
      ttlSeconds,
      getBoard: () => ({ nodes: [], edges: [] }) as never,
      getMemory: async () => ({ summary: "", decisions: [] }),
      getAuthorship: async () => ({}),
      recordPublicMessage,
      respond: async () => ({
        text: "Uncommitted stale answer",
        provider: "stale-provider",
      }),
    })

    const worker1 = createRoomAiTestDispatcher({
      redis,
      maxConcurrency: 1,
      claimLeaseMs: 2000,
      infer: orchestrator1.infer,
    })

    const orchestrator2 = createRoomAiOrchestrator({
      redis,
      ttlSeconds,
      getBoard: () => ({ nodes: [], edges: [] }) as never,
      getMemory: async () => ({ summary: "", decisions: [] }),
      getAuthorship: async () => ({}),
      recordPublicMessage,
      respond: async () => ({
        text: "Committed recovered answer",
        provider: "fresh-provider",
      }),
    })

    const worker2 = createRoomAiTestDispatcher({
      redis,
      maxConcurrency: 1,
      claimLeaseMs: 2000,
      infer: orchestrator2.infer,
    })

    try {
      expect(await worker1.processRoom(diagramId)).toBe(true)
      await worker1.waitForIdle()

      const afterFencedAttempt = await chat.list(diagramId)
      const stillQueuedRequester = afterFencedAttempt.messages.find((m) => m.id === post.messageId)
      expect(stillQueuedRequester?.status).toBe("queued")
      expect(afterFencedAttempt.messages.filter((m) => m.replyTo === post.messageId)).toHaveLength(
        0
      )
      expect(snapshots).toEqual([])

      expect(await worker2.processRoom(diagramId)).toBe(true)
      await worker2.waitForIdle()

      expect(snapshots).toEqual([
        {
          text: "Explain class diagrams",
          requesterStatus: "answered",
          answerCommitted: true,
        },
        {
          text: "Committed recovered answer",
          requesterStatus: "answered",
          answerCommitted: true,
        },
      ])
    } finally {
      evalSpy.mockRestore()
      await worker1.close()
      await worker2.close()
    }
  })

  it("does not publish a stale idle status after another worker takes over", async () => {
    const redis = await getRedis()
    const diagramId = "fenced-stale-idle-status-room"
    await redis.set(k.diagram(diagramId), "exists")

    const service = createRoomAiTestService({ redis, ttlSeconds: 3600 })
    const user = { id: "u1", name: "User" } as never
    await service.postMessage({ diagramId, author: user, text: "First", intent: "ask" })
    await service.postMessage({ diagramId, author: user, text: "Second", intent: "ask" })

    const statusEvents: Array<{ status: "thinking" | "idle"; queueLength: number }> = []
    const eventBus = await createRoomAiEventBus(redis, (_room, event) => {
      if (event.type === "ai.status") {
        statusEvents.push({ status: event.status, queueLength: event.queueLength })
      }
    })

    let releaseWinner!: () => void
    const winnerGate = new Promise<void>((resolve) => {
      releaseWinner = resolve
    })
    const winner = createRoomAiTestDispatcher({
      redis,
      maxConcurrency: 1,
      claimLeaseMs: 2000,
      publish: (room, event) => eventBus.publish(room, event),
      publishStatusIfCurrentClaim: (room, status, token) =>
        eventBus.publishStatusIfCurrentClaim(room, status, token),
      infer: async () => winnerGate,
    })

    let takeoverStarted = false
    let winnerToken: string | null = null
    const startWinner = async () => {
      if (takeoverStarted) return
      takeoverStarted = true
      await redis.set(k.aiActiveLease(diagramId), String(Date.now() - 10))
      expect(await winner.processRoom(diagramId)).toBe(true)
      winnerToken = await redis.get(k.aiActive(diagramId))
    }

    const originalEval = redis.eval.bind(redis)
    const evalSpy = vi.spyOn(redis, "eval").mockImplementation((async (script, options) => {
      if (script.includes("room_ai_status_publish_fenced") && options.arguments[1] === "idle") {
        await startWinner()
      }
      return originalEval(script, options)
    }) as typeof redis.eval)

    const staleWorker = createRoomAiTestDispatcher({
      redis,
      maxConcurrency: 1,
      claimLeaseMs: 2000,
      publishStatusIfCurrentClaim: (room, status, token) =>
        eventBus.publishStatusIfCurrentClaim(room, status, token),
      publish: async (room, event) => {
        if (event.type === "ai.status" && event.status === "idle") await startWinner()
        await eventBus.publish(room, event)
      },
      infer: async () => {},
    })

    const waitForStatusBarrier = async (queueLength: number) => {
      const deadline = Date.now() + 2000
      while (!statusEvents.some((event) => event.queueLength === queueLength)) {
        if (Date.now() >= deadline) throw new Error("timed out waiting for Room AI status event")
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
    }

    try {
      expect(await staleWorker.processRoom(diagramId)).toBe(true)
      const staleToken = await redis.get(k.aiActive(diagramId))
      expect(staleToken).toBeTruthy()
      await staleWorker.waitForIdle()

      expect(takeoverStarted).toBe(true)
      expect(winnerToken).toBeTruthy()
      expect(winnerToken).not.toBe(staleToken)

      const firstBarrier = 987321
      await eventBus.publish(diagramId, {
        type: "ai.status",
        status: "thinking",
        queueLength: firstBarrier,
      })
      await waitForStatusBarrier(firstBarrier)
      expect(statusEvents.filter((event) => event.status === "idle")).toEqual([])

      releaseWinner()
      await winner.waitForIdle()
      const secondBarrier = 987322
      await eventBus.publish(diagramId, {
        type: "ai.status",
        status: "thinking",
        queueLength: secondBarrier,
      })
      await waitForStatusBarrier(secondBarrier)
      expect(statusEvents.filter((event) => event.status === "idle")).toEqual([
        { status: "idle", queueLength: 0 },
      ])
    } finally {
      releaseWinner()
      evalSpy.mockRestore()
      await staleWorker.waitForIdle()
      await winner.waitForIdle()
      await staleWorker.close()
      await winner.close()
      await eventBus.close()
    }
  })
})
