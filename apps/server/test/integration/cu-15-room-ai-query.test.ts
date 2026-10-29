import { describe, expect, it, vi } from "vitest"
import type { RoomAiEvent, UMLModel } from "@umlstudio/core"
import { getRedis } from "../../src/__tests__/setup.js"
import { k } from "../../src/redis.js"
import {
  createRoomAiTestDispatcher as createRoomAiDispatcher,
  createRoomAiTestService as createRoomAiService,
  TEST_ROOM_AI_REPLICA,
} from "./helpers/room-ai-test-support.js"
import { createRoomAiOrchestrator } from "../../src/services/room-ai/room-ai-orchestrator.js"
import { InferenceNotStartedError } from "../../src/services/room-ai/inference-not-started.js"
import { createRoomAiResponder } from "../../src/services/room-ai/room-ai-responder.js"
import { createRoomMemoryRepository } from "../../src/services/room-ai/room-memory-repository.js"
import { GLOBAL_SLOTS } from "../../src/services/room-ai/inference-slots.js"

describe("Room AI query flow", () => {
  it.each([413, 503])(
    "releases capacity after the internal service confirms inference did not start (%i)",
    async (status) => {
      const redis = await getRedis()
      const diagramId = `query-confirmed-rejection-${status}`
      await redis.set(k.diagram(diagramId), "exists")
      const fetcher = vi.fn(async () => new Response(null, { status }))
      const respond = createRoomAiResponder({
        serviceUrl: "https://ai.internal",
        internalToken: "test-token",
        fetcher,
      })
      const service = createRoomAiService({ redis, ttlSeconds: 3600 })
      const orchestrator = createRoomAiOrchestrator({
        redis,
        ttlSeconds: 3600,
        getBoard: () => ({ nodes: [], edges: [] }) as unknown as UMLModel,
        getMemory: async () => ({ summary: "", decisions: [] }),
        getAuthorship: async () => ({}),
        respond,
      })
      const dispatcher = createRoomAiDispatcher({
        redis,
        maxConcurrency: 1,
        infer: orchestrator.infer,
      })

      for (const text of ["first question", "second question"]) {
        await service.postMessage({
          diagramId,
          author: { id: "alice", name: "Alice" } as never,
          text,
          intent: "ask",
        })
        await dispatcher.drainRoom(diagramId)
        expect(await redis.sCard(GLOBAL_SLOTS)).toBe(0)
      }

      expect(fetcher).toHaveBeenCalledTimes(2)
      await dispatcher.close()
    }
  )

  it("retains the slot and stops follow-up summaries after an unconfirmed failure", async () => {
    const redis = await getRedis()
    const diagramId = "query-summary-unconfirmed"
    await redis.set(k.diagram(diagramId), "exists")
    const fetcher = vi.fn(async () => {
      throw new Error("network failure")
    })
    const summarize = createRoomAiResponder({
      serviceUrl: "https://ai.internal",
      internalToken: "test-token",
      fetcher,
    })
    const memory = createRoomMemoryRepository(redis, {
      ttlSeconds: 3600,
      every: 1,
      summarize: async (summary, messages, roomId = diagramId) => {
        const result = await summarize({
          route: "shared",
          requester: { id: "room-ai-memory", name: "Room AI" },
          intent: "ask",
          question: "Update the shared summary",
          board: { id: roomId, nodes: [], edges: [] } as unknown as UMLModel,
          contextJson: JSON.stringify({ summary, messages }),
        })
        return result.text
      },
    })
    const service = createRoomAiService({ redis, ttlSeconds: 3600 })
    await service.postMessage({
      diagramId,
      author: { id: "alice", name: "Alice" } as never,
      text: "shared question",
      intent: "ask",
    })
    const orchestrator = createRoomAiOrchestrator({
      redis,
      ttlSeconds: 3600,
      getBoard: () => ({ nodes: [], edges: [] }) as unknown as UMLModel,
      getMemory: async () => ({ summary: "", decisions: [] }),
      getAuthorship: async () => ({}),
      respond: async () => ({ text: "shared answer", provider: "self-hosted" }),
      recordPublicMessage: (roomId, text) => memory.recordPublicMessage(roomId, text),
    })
    const dispatcher = createRoomAiDispatcher({
      redis,
      maxConcurrency: 1,
      infer: orchestrator.infer,
    })

    await dispatcher.drainRoom(diagramId)

    expect(fetcher).toHaveBeenCalledOnce()
    expect(await redis.sCard(GLOBAL_SLOTS)).toBe(1)
    const { messages } = await service.listMessages(diagramId)
    expect(messages.some((message) => message.author.kind === "ai")).toBe(false)
    await dispatcher.close()
  })

  it("retains the slot if the provider throws a pre-inference error after it was called", async () => {
    const redis = await getRedis()
    const diagramId = "query-provider-error"
    await redis.set(k.diagram(diagramId), "exists")
    const service = createRoomAiService({ redis, ttlSeconds: 3600 })
    await service.postMessage({
      diagramId,
      author: { id: "alice", name: "Alice" } as never,
      text: "question",
      intent: "ask",
    })
    const orchestrator = createRoomAiOrchestrator({
      redis,
      ttlSeconds: 3600,
      getBoard: () => ({ nodes: [], edges: [] }) as unknown as UMLModel,
      getMemory: async () => ({ summary: "", decisions: [] }),
      getAuthorship: async () => ({}),
      respond: async () => {
        throw new InferenceNotStartedError("unexpected provider error")
      },
    })
    const dispatcher = createRoomAiDispatcher({
      redis,
      maxConcurrency: 1,
      infer: orchestrator.infer,
    })
    await dispatcher.processRoom(diagramId)
    await dispatcher.waitForIdle()
    expect(await redis.get(k.aiActive(diagramId))).not.toBeNull()
    await dispatcher.close()
  })
  it("fails closed when direct private inference is unavailable without queueing the request", async () => {
    const redis = await getRedis()
    const diagramId = "query-private-no-delivery"
    await redis.set(k.diagram(diagramId), "exists")
    const service = createRoomAiService({ redis, ttlSeconds: 3600 })
    await expect(
      service.postPrivateMessage({
        diagramId,
        author: { id: "alice", name: "Alice" } as never,
        text: "question",
        replicaGeneration: TEST_ROOM_AI_REPLICA.generation,
        replicaRevision: TEST_ROOM_AI_REPLICA.revision,
      })
    ).rejects.toThrow("private room AI is unavailable")
    expect((await service.listMessages(diagramId)).messages).toEqual([])
    expect(await redis.lLen(k.aiQueue(diagramId))).toBe(0)
  })
  it("keeps private questions and replies out of shared history and events", async () => {
    const redis = await getRedis()
    const diagramId = "query-private-room"
    await redis.set(k.diagram(diagramId), "exists")
    const secret = "personal-context-only"
    const requests: { route: string; contextJson: string; privateContext?: string }[] = []
    const events: RoomAiEvent[] = []
    const orchestrator = createRoomAiOrchestrator({
      redis,
      ttlSeconds: 3600,
      publish: (_, event) => {
        events.push(event)
      },
      getBoard: () => ({ nodes: [], edges: [] }) as unknown as UMLModel,
      getMemory: async () => ({ summary: "shared", decisions: [] }),
      getAuthorship: async () => ({}),
      respond: async (request) => {
        requests.push(request)
        return { text: request.privateContext ?? "answer", provider: "self-hosted" }
      },
    })
    const service = createRoomAiService({
      redis,
      ttlSeconds: 3600,
      publish: (_, event) => events.push(event),
      respondPrivately: orchestrator.respondPrivately,
    })
    const privateReply = await service.postPrivateMessage({
      diagramId,
      author: { id: "alice", name: "Alice" } as never,
      text: "private question",
      privateContext: secret,
      replicaGeneration: TEST_ROOM_AI_REPLICA.generation,
      replicaRevision: TEST_ROOM_AI_REPLICA.revision,
    })
    const shared = await service.postMessage({
      diagramId,
      author: { id: "bob", name: "Bob" } as never,
      text: "shared question",
      intent: "ask",
    })
    const dispatcher = createRoomAiDispatcher({
      redis,
      maxConcurrency: 1,
      infer: orchestrator.infer,
    })
    await dispatcher.drainRoom(diagramId)
    await dispatcher.close()
    expect(requests.map((request) => request.route)).toEqual(["private", "shared"])
    expect(requests[0]?.privateContext).toBe(secret)
    expect(requests[0]?.contextJson).not.toContain(secret)
    expect(requests[1]?.contextJson).not.toContain(secret)
    expect(requests[1]?.privateContext).toBeUndefined()
    expect(privateReply.text).toBe("Alice: personal-context-only")
    expect(JSON.stringify(events)).not.toContain(secret)
    const messages = (await service.listMessages(diagramId)).messages
    expect(messages.map((message) => message.text)).not.toContain("private question")
    expect(messages.some((message) => message.replyTo === shared.messageId)).toBe(true)
  })
  it("persists and broadcasts a named answer for each requester", async () => {
    const redis = await getRedis()
    const diagramId = "query-room"
    await redis.set(k.diagram(diagramId), "exists")
    const events: RoomAiEvent[] = []
    const publish = (_: string, event: RoomAiEvent) => {
      events.push(event)
    }
    const service = createRoomAiService({ redis, ttlSeconds: 3600, publish })
    const [alice, bob] = await Promise.all([
      service.postMessage({
        diagramId,
        author: { id: "alice", name: "Alice" } as never,
        text: "Alice's question",
        intent: "ask",
      }),
      service.postMessage({
        diagramId,
        author: { id: "bob", name: "Bob" } as never,
        text: "Bob's question",
        intent: "ask",
      }),
    ])
    const respond = vi.fn(async () => ({ text: "Here is the answer", provider: "self-hosted" }))
    const orchestrator = createRoomAiOrchestrator({
      redis,
      ttlSeconds: 3600,
      publish,
      getBoard: () => ({ nodes: [], edges: [] }) as unknown as UMLModel,
      getMemory: async () => ({ summary: "shared", decisions: [] }),
      getAuthorship: async () => ({}),
      respond,
    })
    const dispatcher = createRoomAiDispatcher({
      redis,
      maxConcurrency: 1,
      infer: orchestrator.infer,
      publish,
    })
    await dispatcher.drainRoom(diagramId)
    await dispatcher.close()
    const messages = (await service.listMessages(diagramId)).messages
    const answers = messages.filter((message) => message.author.kind === "ai")
    expect(answers).toHaveLength(2)
    expect(answers.find((message) => message.replyTo === alice.messageId)?.text).toBe(
      "Alice: Here is the answer"
    )
    expect(answers.find((message) => message.replyTo === bob.messageId)?.text).toBe(
      "Bob: Here is the answer"
    )
    expect(answers.every((message) => message.provider === "self-hosted")).toBe(true)
    expect(events.filter((event) => event.type === "message.created")).toHaveLength(4)
    expect(respond).toHaveBeenCalledTimes(2)
  })
})
