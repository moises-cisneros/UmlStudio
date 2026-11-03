import { describe, expect, it, vi } from "vitest"
import { getRedis } from "../../src/__tests__/setup.js"
import { logger } from "../../src/logger.js"
import { k } from "../../src/redis.js"
import { getRoomAiReplicaRequirement } from "../../src/services/room-ai/chat-repository.js"
import {
  ConfirmedInferenceTerminatedError,
  ConfirmedInferenceNotStartedError,
  InferenceTerminationUnconfirmedError,
} from "../../src/services/room-ai/inference-not-started.js"
import { TEST_ROOM_AI_REPLICA } from "./helpers/room-ai-test-support.js"
import {
  createRoomAiTestDispatcher as createRoomAiDispatcher,
  createRoomAiTestService as createRoomAiService,
} from "./helpers/room-ai-test-support.js"
import { RoomQueueFullError } from "../../src/services/room-ai/room-ai-service.js"
import type { RoomAiEvent } from "@umlstudio/core"

describe("Room AI distributed dispatcher", () => {
  it("passes the acknowledged board revision to inference and removes its queue metadata", async () => {
    const redis = await getRedis()
    const diagramId = "replica-requirement-dispatch"
    await redis.set(k.diagram(diagramId), "exists")
    const service = createRoomAiService({ redis, ttlSeconds: 3600 })
    const { messageId } = await service.postMessage({
      diagramId,
      author: { id: "u1", name: "User" } as never,
      text: "question",
      intent: "ask",
    })
    const infer = vi.fn(async () => {})
    const dispatcher = createRoomAiDispatcher({
      redis,
      maxConcurrency: 1,
      getReplicaRequirement: (id, queuedId) => getRoomAiReplicaRequirement(redis, id, queuedId),
      infer,
    })

    await dispatcher.processRoom(diagramId)
    await dispatcher.waitForIdle()

    expect(infer).toHaveBeenCalledWith(diagramId, messageId, TEST_ROOM_AI_REPLICA)
    expect(await redis.get(k.aiReplicaRequirement(diagramId, messageId))).toBeNull()
    await dispatcher.close()
  })

  it("fails queued inference closed when replica acknowledgement metadata expires", async () => {
    const redis = await getRedis()
    const diagramId = "replica-requirement-expired"
    await redis.set(k.diagram(diagramId), "exists")
    const service = createRoomAiService({ redis, ttlSeconds: 3600 })
    const { messageId } = await service.postMessage({
      diagramId,
      author: { id: "u1", name: "User" } as never,
      text: "question",
      intent: "ask",
    })
    await redis.del(k.aiReplicaRequirement(diagramId, messageId))
    const warnSpy = vi.spyOn(logger, "warn")
    const infer = vi.fn(async () => {})
    const dispatcher = createRoomAiDispatcher({
      redis,
      maxConcurrency: 1,
      getReplicaRequirement: (id, queuedId) => getRoomAiReplicaRequirement(redis, id, queuedId),
      infer,
    })

    await dispatcher.processRoom(diagramId)
    await dispatcher.waitForIdle()

    expect(infer).not.toHaveBeenCalled()
    const failedMessage = (await service.listMessages(diagramId)).messages[0] as {
      status?: string
      failureReason?: string
    }
    expect(failedMessage?.status).toBe("failed")
    expect(failedMessage?.failureReason).toBe("Inference unavailable")
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "room_ai.dispatch.inference_not_started",
        diagramId,
        messageId,
        stage: "dispatch_replica_requirement",
        reasonCode: "replica_requirement_unavailable",
        confirmedNotStarted: false,
        errorName: "InferenceNotStartedError",
        timedOut: false,
      }),
      "room AI inference not started; marked Inference unavailable"
    )
    warnSpy.mockRestore()
    await dispatcher.close()
  })

  it("logs bounded pre-inference stage and reasonCode without leaking raw error text while keeping failureReason Inference unavailable", async () => {
    const redis = await getRedis()
    const diagramId = "pre-inference-structured-log"
    const nextDiagramId = "pre-inference-next-room"
    await redis.set(k.diagram(diagramId), "exists")
    await redis.set(k.diagram(nextDiagramId), "exists")
    const service = createRoomAiService({ redis, ttlSeconds: 3600 })
    const { messageId } = await service.postMessage({
      diagramId,
      author: { id: "u1", name: "User" } as never,
      text: "SENSITIVE_QUESTION_CANARY",
      intent: "ask",
    })
    await service.postMessage({
      diagramId: nextDiagramId,
      author: { id: "u2", name: "Next user" } as never,
      text: "Next question",
      intent: "ask",
    })
    const warnSpy = vi.spyOn(logger, "warn")
    let inferenceCalls = 0
    const dispatcher = createRoomAiDispatcher({
      redis,
      maxConcurrency: 1,
      infer: async () => {
        inferenceCalls++
        if (inferenceCalls === 1) {
          throw new ConfirmedInferenceNotStartedError("SENSITIVE_EXCEPTION_CANARY", {
            stage: "responder_http_rejection",
            reasonCode: "inference_endpoint_not_found",
            upstreamStatus: 404,
          })
        }
      },
    })

    await dispatcher.processRoom(diagramId)
    await dispatcher.waitForIdle()

    const failedMessage = (await service.listMessages(diagramId)).messages[0] as {
      status?: string
      failureReason?: string
    }
    expect(failedMessage?.status).toBe("failed")
    expect(failedMessage?.failureReason).toBe("Inference unavailable")
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "room_ai.dispatch.inference_not_started",
        diagramId,
        messageId,
        stage: "responder_http_rejection",
        reasonCode: "inference_endpoint_not_found",
        upstreamStatus: 404,
        confirmedNotStarted: true,
        errorName: "ConfirmedInferenceNotStartedError",
        timedOut: false,
      }),
      "room AI inference not started; marked Inference unavailable"
    )
    const serializedWarnings = JSON.stringify(warnSpy.mock.calls)
    expect(serializedWarnings).not.toContain("SENSITIVE_EXCEPTION_CANARY")
    expect(serializedWarnings).not.toContain("SENSITIVE_QUESTION_CANARY")
    expect(await dispatcher.processRoom(nextDiagramId)).toBe(true)
    await dispatcher.waitForIdle()
    expect(inferenceCalls).toBe(2)
    warnSpy.mockRestore()
    await dispatcher.close()
  })

  it.each(["persist", "publish", "release"] as const)(
    "releases a confirmed inference slot when %s fails",
    async (failure) => {
      const redis = await getRedis()
      for (const room of ["completed", "next"]) {
        await redis.rPush(k.aiQueue(room), room)
        await redis.rPush(
          k.aiChat(room),
          JSON.stringify({ id: room, diagramId: room, status: "queued" })
        )
      }
      let failOnce = true
      let releaseAttempts = 0
      const faulty = new Proxy(redis, {
        get(target, property) {
          if (property === "eval")
            return async (...args: Parameters<typeof redis.eval>) => {
              if (failure === "persist" && failOnce && String(args[0]).includes("LSET")) {
                failOnce = false
                throw new Error("persistence unavailable")
              }
              if (failure === "release" && String(args[0]).includes("SREM")) {
                releaseAttempts++
                if (failOnce) {
                  failOnce = false
                  throw new Error("Redis temporarily unavailable")
                }
              }
              return redis.eval(...args)
            }
          return Reflect.get(target, property, target)
        },
      })
      const first = createRoomAiDispatcher({
        redis: faulty,
        maxConcurrency: 1,
        infer: async () => {},
        publish: (_, event) => {
          if (failure === "publish" && event.type === "message.updated")
            throw new Error("publication unavailable")
        },
      })
      const second = createRoomAiDispatcher({ redis, maxConcurrency: 1, infer: async () => {} })
      expect(await first.processRoom("completed")).toBe(true)
      await first.waitForIdle()
      const [stored] = await redis.lRange(k.aiChat("completed"), 0, -1)
      expect(JSON.parse(stored!).status).toBe(failure === "persist" ? "queued" : "answered")
      if (failure === "release") expect(releaseAttempts).toBe(2)
      expect(await second.processRoom("next")).toBe(true)
      await second.waitForIdle()
      await Promise.all([first.close(), second.close()])
    }
  )
  it("closes promptly while an unconfirmed inference retains its slot", async () => {
    const redis = await getRedis()
    for (const room of ["closing-active", "closing-waiting"]) {
      await redis.rPush(k.aiQueue(room), room)
      await redis.rPush(
        k.aiChat(room),
        JSON.stringify({ id: room, diagramId: room, status: "queued" })
      )
    }
    let finish!: () => void
    const inference = new Promise<void>((resolve) => {
      finish = resolve
    })
    const first = createRoomAiDispatcher({ redis, maxConcurrency: 1, infer: () => inference })
    const second = createRoomAiDispatcher({ redis, maxConcurrency: 1, infer: async () => {} })
    try {
      expect(await first.processRoom("closing-active")).toBe(true)
      const closed = first.close().then(() => true)
      expect(
        await Promise.race([
          closed,
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
        ])
      ).toBe(true)
      expect(await second.processRoom("closing-waiting")).toBe(false)
    } finally {
      finish()
      await first.waitForIdle()
      await second.close()
    }
  })
  it("processes three concurrent questions from separate instances in queue order", async () => {
    const redis = await getRedis()
    const redis2 = redis.duplicate()
    await redis2.connect()
    try {
      const diagramId = "concurrent-room"
      await redis.set(k.diagram(diagramId), "exists")
      const services = [
        createRoomAiService({ redis, ttlSeconds: 3600 }),
        createRoomAiService({ redis: redis2, ttlSeconds: 3600 }),
      ]
      const author = { id: "u1", name: "User" } as never
      const posts = await Promise.all(
        [0, 1, 2].map((i) =>
          services[i % 2]!.postMessage({ diagramId, author, text: `message ${i}`, intent: "ask" })
        )
      )
      const expected = posts
        .toSorted((a, b) => a.queuePosition - b.queuePosition)
        .map((post) => post.messageId)
      const seen: string[] = []
      const worker = createRoomAiDispatcher({
        redis: redis2,
        maxConcurrency: 1,
        infer: async (_, id) => {
          seen.push(id)
        },
      })
      await worker.drainRoom(diagramId)
      await worker.close()
      expect(seen).toEqual(expected)
      expect(
        (await services[0]!.listMessages(diagramId)).messages.map((message) => message.status)
      ).toEqual(["answered", "answered", "answered"])
    } finally {
      await redis2.quit()
    }
  })
  it("waits for an in-flight claim before completing shutdown", async () => {
    const redis = await getRedis()
    await redis.rPush(k.aiQueue("closing"), "message")
    await redis.rPush(
      k.aiChat("closing"),
      JSON.stringify({ id: "message", diagramId: "closing", status: "queued" })
    )
    let unblock!: () => void
    const gate = new Promise<void>((resolve) => {
      unblock = resolve
    })
    const delayed = new Proxy(redis, {
      get(target, property) {
        if (property === "eval")
          return async (...args: Parameters<typeof redis.eval>) => {
            await gate
            return redis.eval(...args)
          }
        return Reflect.get(target, property, target)
      },
    })
    const order: string[] = []
    const worker = createRoomAiDispatcher({
      redis: delayed,
      maxConcurrency: 1,
      infer: async () => {
        order.push("inference")
      },
    })
    const claim = worker.processRoom("closing")
    const closing = worker.close().then(() => {
      order.push("closed")
    })
    unblock()
    await Promise.all([claim, closing])
    await worker.waitForIdle()
    expect(order).toEqual(["inference", "closed"])
  })

  it("publishes idle before another instance can claim the room", async () => {
    const redis = await getRedis()
    for (const id of ["first", "second"]) {
      await redis.rPush(k.aiQueue("ordering"), id)
      await redis.rPush(
        k.aiChat("ordering"),
        JSON.stringify({ id, diagramId: "ordering", status: "queued" })
      )
    }
    let releaseIdle!: () => void
    let idleStarted!: () => void
    const idleGate = new Promise<void>((resolve) => {
      releaseIdle = resolve
    })
    const idleSignal = new Promise<void>((resolve) => {
      idleStarted = resolve
    })
    const first = createRoomAiDispatcher({
      redis,
      maxConcurrency: 1,
      infer: async () => {},
      publish: async (_, event) => {
        if (event.type === "ai.status" && event.status === "idle") {
          idleStarted()
          await idleGate
        }
      },
    })
    const second = createRoomAiDispatcher({ redis, maxConcurrency: 1, infer: async () => {} })
    expect(await first.processRoom("ordering")).toBe(true)
    await idleSignal
    expect(await second.processRoom("ordering")).toBe(false)
    releaseIdle()
    await first.waitForIdle()
    await first.close()
    expect(await second.processRoom("ordering")).toBe(true)
    await second.waitForIdle()
    await second.close()
  })
  it("drains three pending messages in order without manual retries", async () => {
    const redis = await getRedis()
    for (const id of ["first", "second", "third"]) {
      await redis.rPush(k.aiQueue("drain"), id)
      await redis.rPush(
        k.aiChat("drain"),
        JSON.stringify({ id, diagramId: "drain", status: "queued" })
      )
    }
    const seen: string[] = []
    const worker = createRoomAiDispatcher({
      redis,
      maxConcurrency: 1,
      infer: async (_, id) => {
        seen.push(id)
      },
    })
    await worker.drainRoom("drain")
    await worker.close()
    expect(seen).toEqual(["first", "second", "third"])
  })
  it("does not requeue the active message when a new request arrives", async () => {
    const redis = await getRedis()
    const diagramId = "active-room"
    await redis.set(k.diagram(diagramId), "exists")
    const room = createRoomAiService({ redis, ttlSeconds: 3600 })
    const author = { id: "u1", name: "User" } as never
    const first = await room.postMessage({ diagramId, author, text: "A", intent: "ask" })
    const seen: string[] = []
    let finish!: () => void
    const wait = new Promise<void>((resolve) => {
      finish = resolve
    })
    const worker = createRoomAiDispatcher({
      redis,
      maxConcurrency: 1,
      infer: async (_, id) => {
        seen.push(id)
        if (id === first.messageId) await wait
      },
    })
    expect(await worker.processRoom(diagramId)).toBe(true)
    const second = await room.postMessage({ diagramId, author, text: "B", intent: "ask" })
    expect(second.queuePosition).toBe(1)
    finish()
    await worker.waitForIdle()
    expect(await worker.processRoom(diagramId)).toBe(true)
    await worker.waitForIdle()
    expect(await worker.processRoom(diagramId)).toBe(false)
    expect(seen).toEqual([first.messageId, second.messageId])
    await worker.close()
  })

  it("processes a full legacy room even though new admission is rejected", async () => {
    const redis = await getRedis()
    const diagramId = "legacy-full"
    await redis.set(k.diagram(diagramId), "exists")
    for (let i = 0; i < 5; i++) {
      await redis.rPush(
        k.aiChat(diagramId),
        JSON.stringify({ id: `old-${i}`, diagramId, status: "queued" })
      )
    }
    const room = createRoomAiService({ redis, ttlSeconds: 3600 })
    await expect(
      room.postMessage({
        diagramId,
        author: { id: "u1", name: "User" } as never,
        text: "new",
        intent: "ask",
      })
    ).rejects.toBeInstanceOf(RoomQueueFullError)
    const seen: string[] = []
    const worker = createRoomAiDispatcher({
      redis,
      maxConcurrency: 1,
      infer: async (_, id) => {
        seen.push(id)
      },
    })
    expect(await worker.processRoom(diagramId)).toBe(true)
    await worker.waitForIdle()
    await worker.close()
    expect(seen).toEqual(["old-0"])
  })
  it("publishes the room status and remaining queue length", async () => {
    const redis = await getRedis()
    await redis.rPush(k.aiQueue("room"), "first")
    await redis.rPush(
      k.aiChat("room"),
      JSON.stringify({ id: "first", diagramId: "room", status: "queued" })
    )
    const events: RoomAiEvent[] = []
    const worker = createRoomAiDispatcher({
      redis,
      maxConcurrency: 1,
      infer: async () => {},
      publish: (_, event) => events.push(event),
    })
    expect(await worker.processRoom("room")).toBe(true)
    await worker.waitForIdle()
    await worker.close()
    expect(events.filter((event) => event.type === "ai.status")).toEqual([
      { type: "ai.status", status: "thinking", queueLength: 0 },
      { type: "ai.status", status: "idle", queueLength: 0 },
    ])
  })
  it("claims messages in FIFO order and allows only one active job per room", async () => {
    const redis = await getRedis()
    for (const id of ["first", "second", "third"]) {
      await redis.rPush(k.aiQueue("room"), id)
      await redis.rPush(
        k.aiChat("room"),
        JSON.stringify({ id, diagramId: "room", status: "queued" })
      )
    }
    const seen: string[] = []
    let release!: () => void
    const wait = new Promise<void>((resolve) => {
      release = resolve
    })
    const first = createRoomAiDispatcher({
      redis,
      maxConcurrency: 2,
      infer: async (_, id) => {
        seen.push(id)
        await wait
      },
    })
    const second = createRoomAiDispatcher({
      redis,
      maxConcurrency: 2,
      infer: async (_, id) => {
        seen.push(id)
      },
    })
    expect(await first.processRoom("room")).toBe(true)
    expect(await second.processRoom("room")).toBe(false)
    release()
    await first.waitForIdle()
    await first.close()
    expect(await second.processRoom("room")).toBe(true)
    await second.waitForIdle()
    expect(await second.processRoom("room")).toBe(true)
    await second.waitForIdle()
    await second.close()
    expect(seen).toEqual(["first", "second", "third"])
  })

  it("does not release a slot when termination is unconfirmed after an error", async () => {
    const redis = await getRedis()
    for (const room of ["first", "second"]) {
      await redis.rPush(k.aiQueue(room), room)
      await redis.rPush(
        k.aiChat(room),
        JSON.stringify({ id: room, diagramId: room, status: "queued" })
      )
    }
    const first = createRoomAiDispatcher({
      redis,
      maxConcurrency: 1,
      infer: async () => {
        throw new Error("network failure")
      },
    })
    const second = createRoomAiDispatcher({ redis, maxConcurrency: 1, infer: async () => {} })
    expect(await first.processRoom("first")).toBe(true)
    await first.waitForIdle()
    await first.close()
    const [raw] = await redis.lRange(k.aiChat("first"), 0, -1)
    expect(JSON.parse(raw!)).toMatchObject({ status: "failed", failureReason: "network failure" })
    expect(await second.processRoom("second")).toBe(false)
    await second.close()
  })

  it("releases the room and global slots when inference terminates with unusable output", async () => {
    const redis = await getRedis()
    const room = "confirmed-inference-terminated"
    for (const id of ["failed", "next"]) {
      await redis.rPush(k.aiQueue(room), id)
      await redis.rPush(k.aiChat(room), JSON.stringify({ id, diagramId: room, status: "queued" }))
    }
    const seen: string[] = []
    const dispatcher = createRoomAiDispatcher({
      redis,
      maxConcurrency: 1,
      infer: async (_, id) => {
        seen.push(id)
        if (id === "failed")
          throw new ConfirmedInferenceTerminatedError("Room AI response was unusable", {
            stage: "downstream_http_response",
            reasonCode: "invalid_provider_output",
            upstreamStatus: 422,
          })
      },
    })

    await dispatcher.drainRoom(room)
    await dispatcher.waitForIdle()

    const messages = (await redis.lRange(k.aiChat(room), 0, -1)).map((raw) => JSON.parse(raw!))
    expect(seen).toEqual(["failed", "next"])
    expect(messages.map((message) => message.status)).toEqual(["failed", "answered"])
    expect(messages[0]).toMatchObject({
      id: "failed",
      failureReason: "AI could not generate a valid UML change",
    })
    expect(await redis.lRange(k.aiQueue(room), 0, -1)).toEqual([])
    await dispatcher.close()
  })

  it("logs the safe downstream failure stage and HTTP status", async () => {
    const redis = await getRedis()
    const room = "unconfirmed-http-status"
    await redis.rPush(k.aiQueue(room), room)
    await redis.rPush(
      k.aiChat(room),
      JSON.stringify({ id: room, diagramId: room, status: "queued" })
    )
    const errorSpy = vi.spyOn(logger, "error")
    const dispatcher = createRoomAiDispatcher({
      redis,
      maxConcurrency: 1,
      infer: async () => {
        throw new InferenceTerminationUnconfirmedError("Room AI inference failed", {
          stage: "downstream_http_response",
          reasonCode: "non_success_http_status",
          upstreamStatus: 502,
        })
      },
    })

    expect(await dispatcher.processRoom(room)).toBe(true)
    await dispatcher.waitForIdle()

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "room_ai.inference.termination_unconfirmed",
        diagramId: room,
        messageId: room,
        stage: "downstream_http_response",
        reasonCode: "non_success_http_status",
        upstreamStatus: 502,
      }),
      "Room AI downstream returned HTTP 502; inference termination is unconfirmed, so the slot remains reserved."
    )
    await dispatcher.close()
    errorSpy.mockRestore()
  })

  it("holds the global slot after a timeout until the inference settles", async () => {
    const redis = await getRedis()
    for (const room of ["one", "two"]) {
      const message = { id: room, diagramId: room, status: "queued" }
      await redis.rPush(k.aiQueue(room), room)
      await redis.rPush(k.aiChat(room), JSON.stringify(message))
    }
    let finish!: () => void
    const inference = new Promise<void>((resolve) => {
      finish = resolve
    })
    const first = createRoomAiDispatcher({
      redis,
      maxConcurrency: 1,
      timeoutMs: 30,
      infer: () => inference,
    })
    const second = createRoomAiDispatcher({
      redis,
      maxConcurrency: 1,
      timeoutMs: 30,
      infer: async () => {},
    })
    expect(await first.processRoom("one")).toBe(true)
    await vi.waitFor(async () => {
      const [message] = await redis.lRange(k.aiChat("one"), 0, -1)
      expect(JSON.parse(message!).status).toBe("failed")
    })
    expect(await second.processRoom("two")).toBe(false)
    finish()
    await vi.waitFor(async () => expect(await second.processRoom("two")).toBe(true))
    await Promise.all([first.waitForIdle(), second.waitForIdle()])
    await Promise.all([first.close(), second.close()])
  })

  it("emits flood-safe [ROOM AI: DISPATCH BLOCKED] diagnostics only when ROOM_AI_DEV_LOGS=1 across repeated 100ms waits", async () => {
    const redis = await getRedis()
    const previousDevLogs = process.env.ROOM_AI_DEV_LOGS
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    let dispatcher: ReturnType<typeof createRoomAiDispatcher> | undefined
    try {
      await redis.set(k.aiActive("locked-room"), "SENSITIVE_LOCK_TOKEN_CANARY")
      await redis.sAdd("umlstudio:room-ai:inference-slots", "SENSITIVE_LOCK_TOKEN_CANARY")
      await redis.set("umlstudio:room-ai:inference-limit", "1")
      for (const id of ["m1", "m2", "m3", "m4"]) {
        await redis.rPush(k.aiQueue("locked-room"), id)
        await redis.rPush(
          k.aiChat("locked-room"),
          JSON.stringify({
            id,
            diagramId: "locked-room",
            text: "SENSITIVE_QUESTION_CANARY",
            author: { id: "u1", name: "SENSITIVE_AUTHOR_CANARY", kind: "user" },
            status: "queued",
          })
        )
      }

      process.env.ROOM_AI_DEV_LOGS = ""
      const disabledDispatcher = createRoomAiDispatcher({
        redis,
        maxConcurrency: 1,
        infer: async () => {},
      })
      expect(await disabledDispatcher.processRoom("locked-room")).toBe(false)
      expect(logSpy).not.toHaveBeenCalled()
      await disabledDispatcher.close()

      process.env.ROOM_AI_DEV_LOGS = "1"
      const seen: string[] = []
      dispatcher = createRoomAiDispatcher({
        redis,
        maxConcurrency: 1,
        infer: async (_diagramId, messageId) => {
          seen.push(messageId)
        },
      })

      const drainPromise = dispatcher.drainRoom("locked-room")
      await new Promise((resolve) => setTimeout(resolve, 260))

      const blockedLogsWhileLocked = logSpy.mock.calls
        .map((call) => String(call[0] ?? ""))
        .filter((entry) => entry.includes("[ROOM AI: DISPATCH BLOCKED]"))
      expect(blockedLogsWhileLocked).toHaveLength(1)
      expect(blockedLogsWhileLocked[0]).toContain("Reason: room_lock_held")
      expect(blockedLogsWhileLocked[0]).toContain("Queue depth: 4 / 5")
      expect(blockedLogsWhileLocked[0]).toContain("Room active lock: present")
      expect(blockedLogsWhileLocked[0]).toContain("Global inference slots: 1 / 1")
      expect(blockedLogsWhileLocked[0]).not.toContain("SENSITIVE_QUESTION_CANARY")
      expect(blockedLogsWhileLocked[0]).not.toContain("SENSITIVE_AUTHOR_CANARY")
      expect(blockedLogsWhileLocked[0]).not.toContain("SENSITIVE_LOCK_TOKEN_CANARY")

      await redis.rPush(k.aiQueue("other-room"), "other-m1")
      await redis.rPush(
        k.aiChat("other-room"),
        JSON.stringify({
          id: "other-m1",
          diagramId: "other-room",
          text: "SENSITIVE_OTHER_QUESTION_CANARY",
          status: "queued",
        })
      )
      expect(await dispatcher.processRoom("other-room")).toBe(false)
      expect(await dispatcher.processRoom("other-room")).toBe(false)

      const allBlockedLogs = logSpy.mock.calls
        .map((call) => String(call[0] ?? ""))
        .filter((entry) => entry.includes("[ROOM AI: DISPATCH BLOCKED]"))
      expect(allBlockedLogs).toHaveLength(2)
      expect(allBlockedLogs[1]).toContain("Reason: global_capacity_full")
      expect(allBlockedLogs[1]).toContain("Queue depth: 1 / 5")
      expect(allBlockedLogs[1]).toContain("Room active lock: absent")
      expect(allBlockedLogs[1]).toContain("Global inference slots: 1 / 1")
      expect(allBlockedLogs[1]).not.toContain("SENSITIVE_OTHER_QUESTION_CANARY")
      expect(allBlockedLogs[1]).not.toContain("SENSITIVE_LOCK_TOKEN_CANARY")

      await redis.del(k.aiActive("locked-room"))
      await redis.sRem("umlstudio:room-ai:inference-slots", "SENSITIVE_LOCK_TOKEN_CANARY")
      await drainPromise
      expect(seen).toEqual(["m1", "m2", "m3", "m4"])
    } finally {
      await dispatcher?.close()
      logSpy.mockRestore()
      if (previousDevLogs === undefined) delete process.env.ROOM_AI_DEV_LOGS
      else process.env.ROOM_AI_DEV_LOGS = previousDevLogs
    }
  })
})
