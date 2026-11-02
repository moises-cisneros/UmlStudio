import { beforeEach, describe, expect, it, vi } from "vitest"
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

const JWT_SECRET = "cu17-room-ai-policy-jwt-secret-32!!"
const PASSWORD = "Password123!"
const DIAGRAM_ID = "room-policy-1"

describe("INT-CU17: room AI policy", () => {
  let app: Hono<AppEnv>
  let redis: Redis
  let events: Array<{ diagramId: string; event: RoomAiEvent }>
  let voiceQuestion: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    redis = await getRedis()
    events = []
    voiceQuestion = vi.fn(async () => ({ messageId: "voice-1", queuePosition: 1 }))
    const auth = createAuthService({
      repo: createRedisUserRepository(redis),
      jwtSecret: JWT_SECRET,
    })
    const roomAi = createRoomAiService({
      redis,
      ttlSeconds: 3600,
      publish: (diagramId, event) => events.push({ diagramId, event }),
      getSharedBoardReplicaAtLeast: () =>
        ({
          isComplete: () => true,
          getModel: () => ({ id: DIAGRAM_ID, nodes: [], edges: [] }),
        }) as never,
    })
    app = new Hono<AppEnv>()
    app.onError(errorHandler)
    app.route("/api/auth", mountAuthRoutes({ redis, auth }))
    app.route("/api", mountRoomAiRoutes({ auth, roomAi, voiceQuestion }))
    await redis.set(k.diagram(DIAGRAM_ID), gzipJson({ id: DIAGRAM_ID }))
  })

  async function register(email: string, name: string) {
    const response = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, password: PASSWORD }),
    })
    expect(response.status).toBe(201)
    const body = await response.json()
    return { token: body.token as string, id: body.user.id as string }
  }

  const headers = (token: string) => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  })

  const postMessage = (token: string, intent: "ask" | "change") =>
    app.request(`/api/rooms/${DIAGRAM_ID}/ai/messages`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({
        text: "Explain this room",
        intent,
        replica: { generation: "a".repeat(64), revision: 1 },
      }),
    })

  const postVoice = (token: string) => {
    const form = new FormData()
    form.set("file", new File(["voice"], "question.webm", { type: "audio/webm" }))
    form.set("replica", JSON.stringify({ generation: "a".repeat(64), revision: 1 }))
    return app.request(`/api/rooms/${DIAGRAM_ID}/ai/voice`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
  }

  it("lets any authenticated participant read the safe default but reserves updates for the owner", async () => {
    const owner = await register("owner.policy@example.com", "Owner")
    const participant = await register("participant.policy@example.com", "Participant")
    await redis.hSet(k.diagramMeta(DIAGRAM_ID), { userId: owner.id })

    const initial = await app.request(`/api/rooms/${DIAGRAM_ID}/ai/policy`, {
      headers: { Authorization: `Bearer ${participant.token}` },
    })
    expect(initial.status).toBe(200)
    expect(await initial.json()).toEqual({
      enabled: true,
      allowChanges: false,
      applyMode: "confirm",
      proactive: false,
      canConfigure: false,
    })

    const ownerInitial = await app.request(`/api/rooms/${DIAGRAM_ID}/ai/policy`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    })
    expect(await ownerInitial.json()).toMatchObject({ canConfigure: true })

    const rejected = await app.request(`/api/rooms/${DIAGRAM_ID}/ai/policy`, {
      method: "PUT",
      headers: headers(participant.token),
      body: JSON.stringify({
        enabled: true,
        allowChanges: true,
        applyMode: "auto",
        proactive: true,
      }),
    })
    expect(rejected.status).toBe(403)

    const updated = await app.request(`/api/rooms/${DIAGRAM_ID}/ai/policy`, {
      method: "PUT",
      headers: headers(owner.token),
      body: JSON.stringify({
        enabled: true,
        allowChanges: true,
        applyMode: "confirm",
        proactive: false,
      }),
    })
    expect(updated.status).toBe(200)
    expect(events).toContainEqual({
      diagramId: DIAGRAM_ID,
      event: {
        type: "policy.updated",
        policy: { enabled: true, allowChanges: true, applyMode: "confirm", proactive: false },
      },
    })
    expect(await postMessage(participant.token, "change")).toHaveProperty("status", 202)
  })

  it("enforces enabled and allowChanges while keeping participant questions available", async () => {
    const owner = await register("owner.enforce@example.com", "Owner")
    const participant = await register("participant.enforce@example.com", "Participant")
    await redis.hSet(k.diagramMeta(DIAGRAM_ID), { userId: owner.id })

    expect((await postMessage(participant.token, "ask")).status).toBe(202)
    expect((await postMessage(participant.token, "change")).status).toBe(403)

    const disabled = await app.request(`/api/rooms/${DIAGRAM_ID}/ai/policy`, {
      method: "PUT",
      headers: headers(owner.token),
      body: JSON.stringify({
        enabled: false,
        allowChanges: true,
        applyMode: "confirm",
        proactive: false,
      }),
    })
    expect(disabled.status).toBe(200)
    expect((await postMessage(participant.token, "ask")).status).toBe(403)
    expect((await postVoice(participant.token)).status).toBe(403)
    expect(voiceQuestion).not.toHaveBeenCalled()
  })
})
