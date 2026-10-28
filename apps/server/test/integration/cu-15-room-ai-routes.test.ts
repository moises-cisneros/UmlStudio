import { describe, it, expect, beforeEach } from "vitest"
import { Hono } from "hono"
import type { AppEnv } from "../../src/http/env.js"
import { errorHandler } from "../../src/http/middleware/errors.js"
import { getRedis } from "../../src/__tests__/setup.js"
import { gzipJson, k, type Redis } from "../../src/redis.js"
import { createAuthService, createRedisUserRepository } from "../../src/services/auth-service.js"
import { mountAuthRoutes } from "../../src/routes/auth.js"
import { mountRoomAiRoutes } from "../../src/routes/room-ai.js"
import { createRoomAiService } from "../../src/services/room-ai/room-ai-service.js"

const TEST_JWT_SECRET = "cu15-room-ai-test-jwt-secret-32-chars!!"
const PASSWORD = "Password123!"
const DIAGRAM_ID = "room-1"

describe("INT-CU15: room AI message routes", () => {
  let app: Hono<AppEnv>
  let redis: Redis

  beforeEach(async () => {
    redis = await getRedis()
    const auth = createAuthService({
      repo: createRedisUserRepository(redis),
      jwtSecret: TEST_JWT_SECRET,
    })
    app = new Hono<AppEnv>()
    app.onError(errorHandler)
    app.route("/api/auth", mountAuthRoutes({ redis, auth }))
    app.route(
      "/api",
      mountRoomAiRoutes({ auth, roomAi: createRoomAiService({ redis, ttlSeconds: 3600 }) })
    )
    await redis.set(k.diagram(DIAGRAM_ID), gzipJson({ id: DIAGRAM_ID }))
  })

  async function register(email: string, name: string) {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, password: PASSWORD }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    return { token: body.token as string, id: body.user.id as string }
  }

  const post = (token: string | undefined, body: unknown, diagramId = DIAGRAM_ID) =>
    app.request(`/api/rooms/${diagramId}/ai/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })

  const list = (token: string | undefined, query = "", diagramId = DIAGRAM_ID) =>
    app.request(`/api/rooms/${diagramId}/ai/messages${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })

  it("returns 202 with messageId and queuePosition for a valid JWT", async () => {
    const { token } = await register("ada.room@example.com", "Ada")
    const res = await post(token, { text: "add a User class", intent: "change" })
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(typeof body.messageId).toBe("string")
    expect(body.queuePosition).toBe(1)
  })

  it("increments queuePosition for consecutive queued messages", async () => {
    const { token } = await register("queue.room@example.com", "Queue")
    await post(token, { text: "first", intent: "ask" })
    const res = await post(token, { text: "second", intent: "ask" })
    expect((await res.json()).queuePosition).toBe(2)
  })

  it("includes pending messages created before the queue was introduced", async () => {
    const { token } = await register("legacy.room@example.com", "Legacy")
    await redis.rPush(k.aiChat(DIAGRAM_ID), JSON.stringify({ id: "old-message", status: "queued" }))
    const res = await post(token, { text: "new message", intent: "ask" })
    expect(res.status).toBe(202)
    expect((await res.json()).queuePosition).toBe(2)
    expect(await redis.lRange(k.aiQueue(DIAGRAM_ID), 0, -1)).toHaveLength(2)
  })

  it("rejects the sixth pending message without adding it to the conversation", async () => {
    const { token } = await register("capacity.room@example.com", "Capacity")
    for (let n = 0; n < 5; n++) {
      expect((await post(token, { text: `message ${n}`, intent: "ask" })).status).toBe(202)
    }
    expect((await post(token, { text: "overflow", intent: "ask" })).status).toBe(429)
    const messages = await (await list(token)).json()
    expect(messages).toHaveLength(5)
    expect(messages.some((message: { text: string }) => message.text === "overflow")).toBe(false)
  })

  it("enforces capacity across concurrent service instances", async () => {
    const { token } = await register("instances.room@example.com", "Instances")
    const auth = createAuthService({
      repo: createRedisUserRepository(redis),
      jwtSecret: TEST_JWT_SECRET,
    })
    const second = new Hono<AppEnv>()
    second.onError(errorHandler)
    second.route(
      "/api",
      mountRoomAiRoutes({ auth, roomAi: createRoomAiService({ redis, ttlSeconds: 3600 }) })
    )
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, n) =>
        (n % 2 ? second : app).request(`/api/rooms/${DIAGRAM_ID}/ai/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text: `message ${n}`, intent: "ask" }),
        })
      )
    )
    expect(responses.map((response) => response.status).sort()).toEqual([
      202, 202, 202, 202, 202, 429,
    ])
    expect(await (await list(token)).json()).toHaveLength(5)
  })

  it("takes the author from the JWT, not from the body", async () => {
    const { token, id } = await register("author.room@example.com", "Real Author")
    await post(token, {
      text: "hello",
      intent: "ask",
      author: { id: "forged", name: "Mallory", kind: "ai" },
    })
    const [message] = await (await list(token)).json()
    expect(message.author).toMatchObject({ id, name: "Real Author", kind: "user" })
    expect(message).toMatchObject({ diagramId: DIAGRAM_ID, intent: "ask", status: "queued" })
  })

  it("returns 401 without a token on both routes", async () => {
    expect((await post(undefined, { text: "hi", intent: "ask" })).status).toBe(401)
    expect((await list(undefined)).status).toBe(401)
  })

  it("returns 422 for an empty text or an unknown intent", async () => {
    const { token } = await register("bad.room@example.com", "Bad")
    expect((await post(token, { text: "   ", intent: "ask" })).status).toBe(422)
    expect((await post(token, { text: "hi", intent: "shout" })).status).toBe(422)
  })

  it("returns 404 for an unknown room", async () => {
    const { token } = await register("missing.room@example.com", "Missing")
    expect((await post(token, { text: "hi", intent: "ask" }, "nope")).status).toBe(404)
    expect((await list(token, "", "nope")).status).toBe(404)
  })

  it("lists history in chronological order and paginates with before/limit", async () => {
    const { token } = await register("history.room@example.com", "History")
    const ids: string[] = []
    for (let n = 1; n <= 5; n++) {
      const res = await post(token, { text: `message ${n}`, intent: "ask" })
      ids.push((await res.json()).messageId)
    }

    const latest = await (await list(token, "?limit=2")).json()
    expect(latest.map((m: { id: string }) => m.id)).toEqual([ids[3], ids[4]])

    const older = await (await list(token, `?before=${ids[3]}&limit=2`)).json()
    expect(older.map((m: { id: string }) => m.id)).toEqual([ids[1], ids[2]])

    const all = await (await list(token)).json()
    expect(all.map((m: { text: string }) => m.text)).toEqual([
      "message 1",
      "message 2",
      "message 3",
      "message 4",
      "message 5",
    ])
  })

  it("rejects an invalid limit", async () => {
    const { token } = await register("limit.room@example.com", "Limit")
    expect((await list(token, "?limit=0")).status).toBe(422)
    expect((await list(token, "?limit=9999")).status).toBe(422)
  })
})
