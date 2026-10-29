import { describe, it, expect, beforeEach } from "vitest"
import { Hono } from "hono"
import type { RoomAiEvent } from "@umlstudio/core"
import type { AppEnv } from "../../src/http/env.js"
import { errorHandler } from "../../src/http/middleware/errors.js"
import { getRedis } from "../../src/__tests__/setup.js"
import { gzipJson, k, type Redis } from "../../src/redis.js"
import { createAuthService, createRedisUserRepository } from "../../src/services/auth-service.js"
import { mountAuthRoutes } from "../../src/routes/auth.js"
import { mountRoomAiRoutes } from "../../src/routes/room-ai.js"
import { createRoomAiService } from "../../src/services/room-ai/room-ai-service.js"
import { createRoomMemoryRepository } from "../../src/services/room-ai/room-memory-repository.js"

const TEST_JWT_SECRET = "cu15-room-ai-test-jwt-secret-32-chars!!"
const PASSWORD = "Password123!"
const DIAGRAM_ID = "room-1"

describe("INT-CU15: room AI message routes", () => {
  let app: Hono<AppEnv>
  let redis: Redis
  let roomAiEvents: Array<{ diagramId: string; event: RoomAiEvent }>

  beforeEach(async () => {
    redis = await getRedis()
    roomAiEvents = []
    const auth = createAuthService({
      repo: createRedisUserRepository(redis),
      jwtSecret: TEST_JWT_SECRET,
    })
    app = new Hono<AppEnv>()
    app.onError(errorHandler)
    app.route("/api/auth", mountAuthRoutes({ redis, auth }))
    app.route(
      "/api",
      mountRoomAiRoutes({
        auth,
        roomAi: createRoomAiService({
          redis,
          ttlSeconds: 3600,
          profileDeriver: async () => ({
            detailLevel: "balanced",
            exampleStyle: "analogy",
          }),
          memory: createRoomMemoryRepository(redis, {
            ttlSeconds: 3600,
            every: 10,
            summarize: async (summary, messages) =>
              [summary, ...messages].filter(Boolean).join(" "),
          }),
          publish: (diagramId, event) => roomAiEvents.push({ diagramId, event }),
          getSharedBoardReplicaAtLeast: (diagramId, generation, revision) => {
            if (diagramId !== DIAGRAM_ID || generation !== "a".repeat(64) || revision !== 3) {
              return undefined
            }
            return {
              isComplete: () => true,
              getModel: () => ({ id: DIAGRAM_ID, nodes: [], edges: [] }),
            } as never
          },
        }),
      })
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
      body: JSON.stringify({
        replica: { generation: "a".repeat(64), revision: 3 },
        ...(body as Record<string, unknown>),
      }),
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
    expect(await redis.get(k.aiReplicaRequirement(DIAGRAM_ID, body.messageId))).toBe(
      JSON.stringify({ generation: "a".repeat(64), revision: 3 })
    )
  })

  it("returns shared room memory and accepts authenticated pinned decisions", async () => {
    const { token } = await register("memory.room@example.com", "Memory")
    const empty = await app.request(`/api/rooms/${DIAGRAM_ID}/ai/memory`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(empty.status).toBe(200)
    expect(await empty.json()).toEqual({ summary: null, pinnedDecisions: [] })

    const pinned = await app.request(`/api/rooms/${DIAGRAM_ID}/ai/memory/pins`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Use a layered architecture" }),
    })
    expect(pinned.status).toBe(201)
    expect(await pinned.json()).toEqual({ text: "Use a layered architecture" })
    expect(roomAiEvents).toContainEqual({
      diagramId: DIAGRAM_ID,
      event: { type: "memory.updated" },
    })
    expect(
      await (
        await app.request(`/api/rooms/${DIAGRAM_ID}/ai/memory`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).json()
    ).toEqual({
      summary: null,
      pinnedDecisions: ["Use a layered architecture"],
    })
  })

  it("learns from a public interaction, returns the closed update only to its requester, and isolates the sidecar", async () => {
    const { token, id } = await register("personal-context.room@example.com", "Personal Context")
    const previousProfile = { detailLevel: "balanced", exampleStyle: "none" }
    const revisionResponse = await app.request(
      `/api/rooms/${DIAGRAM_ID}/ai/personal-profile/revision`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const { revision } = await revisionResponse.json()
    const res = await post(token, {
      text: "Please show an analogy for this diagram",
      intent: "ask",
      teachingProfile: previousProfile,
      profileRevision: revision,
    })

    expect(res.status).toBe(202)
    const result = await res.json()
    const { messageId } = result
    expect(result.profileUpdate.profile).toEqual({
      detailLevel: "balanced",
      exampleStyle: "analogy",
    })
    expect(result.profileUpdate.revision).not.toBe(revision)
    const sidecar = await redis.get(k.aiPersonalProfile(DIAGRAM_ID, messageId))
    expect(sidecar).toBe(
      JSON.stringify({
        requesterId: id,
        teachingProfile: result.profileUpdate.profile,
        revision: result.profileUpdate.revision,
      })
    )
    expect(await redis.ttl(k.aiPersonalProfile(DIAGRAM_ID, messageId))).toBeLessThanOrEqual(900)
    const publicHistory = await redis.lRange(k.aiChat(DIAGRAM_ID), 0, -1)
    expect(publicHistory.join("\n")).toContain("Please show an analogy for this diagram")
    expect(publicHistory.join("\n")).not.toContain("detailLevel")
    expect(JSON.stringify(roomAiEvents)).not.toContain("detailLevel")
  })

  it("does not expose the removed free-text profile derivation endpoint", async () => {
    const { token } = await register("removed-profile-route.room@example.com", "Route Removed")
    const response = await app.request(`/api/rooms/${DIAGRAM_ID}/ai/personal-profile/derive`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ memory: "old free-text note" }),
    })
    expect(response.status).toBe(404)
  })

  it("rejects a stale profile after its authenticated revision changes", async () => {
    const { token } = await register("profile-revoke.room@example.com", "Profile Revoke")
    const { revision } = await (
      await app.request(`/api/rooms/${DIAGRAM_ID}/ai/personal-profile/revision`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json()
    const profile = { detailLevel: "balanced", exampleStyle: "analogy" }
    const revoked = await app.request(`/api/rooms/${DIAGRAM_ID}/ai/personal-profile/revoke`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
    const { revision: revokedRevision } = await revoked.json()
    expect(revokedRevision).not.toBe(revision)

    const stale = await post(token, {
      text: "help me with this diagram",
      intent: "ask",
      teachingProfile: profile,
      profileRevision: revision,
    })
    expect(stale.status).toBe(409)
    expect(await redis.lLen(k.aiQueue(DIAGRAM_ID))).toBe(0)
  })

  it("rejects the removed one-person Private Room endpoint", async () => {
    const { token } = await register("private.route@example.com", "Private User")
    const response = await app.request(`/api/rooms/${DIAGRAM_ID}/ai/private-messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "question" }),
    })

    expect(response.status).toBe(404)
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
    expect(await redis.keys(`diagram:{${DIAGRAM_ID}}:ai:private-context:*`)).toEqual([])
    const messages = await (await list(token)).json()
    expect(messages).toHaveLength(5)
    expect(messages.some((message: { text: string }) => message.text === "overflow")).toBe(false)
  })

  it("enforces capacity across concurrent service instances", async () => {
    const { token } = await register("instances.room@example.com", "Instances")
    const { revision: profileRevision } = await (
      await app.request(`/api/rooms/${DIAGRAM_ID}/ai/personal-profile/revision`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json()
    const auth = createAuthService({
      repo: createRedisUserRepository(redis),
      jwtSecret: TEST_JWT_SECRET,
    })
    const second = new Hono<AppEnv>()
    second.onError(errorHandler)
    second.route(
      "/api",
      mountRoomAiRoutes({
        auth,
        roomAi: createRoomAiService({
          redis,
          ttlSeconds: 3600,
          getSharedBoardReplicaAtLeast: () =>
            ({
              isComplete: () => true,
              getModel: () => ({ id: DIAGRAM_ID, nodes: [], edges: [] }),
            }) as never,
        }),
      })
    )
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, n) =>
        (n % 2 ? second : app).request(`/api/rooms/${DIAGRAM_ID}/ai/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            text: `message ${n}`,
            intent: "ask",
            teachingProfile: { detailLevel: "balanced", exampleStyle: "analogy" },
            profileRevision,
            replica: { generation: "a".repeat(64), revision: 3 },
          }),
        })
      )
    )
    expect(responses.map((response) => response.status).sort()).toEqual([
      202, 202, 202, 202, 202, 429,
    ])
    expect(await (await list(token)).json()).toHaveLength(5)
    const messages = await (await list(token)).json()
    const profileKeys = await Promise.all(
      messages.map((message: { id: string }) =>
        redis.get(k.aiPersonalProfile(DIAGRAM_ID, message.id))
      )
    )
    expect(profileKeys.filter(Boolean)).toHaveLength(5)
    expect((await redis.lRange(k.aiChat(DIAGRAM_ID), 0, -1)).join("\n")).not.toContain(
      "teachingProfile"
    )
  })

  it("takes the author from the JWT, not from the body", async () => {
    const { token, id } = await register("author.room@example.com", "Real Author")
    const response = await post(token, { text: "hello", intent: "ask" })
    expect(response.status).toBe(202)
    const [message] = await (await list(token)).json()
    expect(message.author).toMatchObject({ id, name: "Real Author", kind: "user" })
    expect(message).toMatchObject({ diagramId: DIAGRAM_ID, intent: "ask", status: "queued" })
  })

  it("returns 401 without a token for shared Room AI routes", async () => {
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
