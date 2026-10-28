import { describe, expect, it, vi } from "vitest"
import { getRedis } from "../../src/__tests__/setup.js"
import { k } from "../../src/redis.js"
import { createRoomAiDispatcher } from "../../src/services/room-ai/room-ai-dispatcher.js"
import {
  createRoomAiService,
  RoomQueueFullError,
} from "../../src/services/room-ai/room-ai-service.js"
import type { RoomAiEvent } from "@umlstudio/core"

describe("Room AI distributed dispatcher", () => {
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
})
