import { beforeEach, describe, expect, it, vi } from "vitest"
import { Hono } from "hono"
import type { ModelDiff, RoomAiEvent, RoomChatMessage } from "@umlstudio/core"
import type { AppEnv } from "../../src/http/env.js"
import { errorHandler } from "../../src/http/middleware/errors.js"
import { getRedis } from "../../src/__tests__/setup.js"
import { gzipJson, k, type Redis } from "../../src/redis.js"
import { createAuthService, createRedisUserRepository } from "../../src/services/auth-service.js"
import { mountAuthRoutes } from "../../src/routes/auth.js"
import { mountRoomAiRoutes } from "../../src/routes/room-ai.js"
import { createRoomAiService } from "../../src/services/room-ai/room-ai-service.js"
import { createChatRepository } from "../../src/services/room-ai/chat-repository.js"

const JWT_SECRET = "cu16-room-ai-proposal-jwt-secret-32!"
const PASSWORD = "Password123!"
const DIAGRAM_ID = "room-proposal-1"
const GENERATION = "a".repeat(64)
const diff: ModelDiff = {
  modify: {
    elements: [{ id: "association-class", changes: { attributes: [{ name: "+ email: String" }] } }],
  },
}

describe("INT-CU16: Room AI proposal claims", () => {
  let app: Hono<AppEnv>
  let redis: Redis
  let events: Array<{ diagramId: string; event: RoomAiEvent }>
  let revision = 3
  let nodes: unknown[]

  beforeEach(async () => {
    redis = await getRedis()
    events = []
    revision = 3
    nodes = [{ id: "association-class", data: { name: "AssociationClass" } }]
    const auth = createAuthService({
      repo: createRedisUserRepository(redis),
      jwtSecret: JWT_SECRET,
    })
    const roomAi = createRoomAiService({
      redis,
      ttlSeconds: 3600,
      publish: (diagramId, event) => events.push({ diagramId, event }),
      getSharedBoardReplica: () =>
        ({
          generation: GENERATION,
          getRevision: () => revision,
          isComplete: () => true,
          getModel: () => ({ id: DIAGRAM_ID, nodes, edges: [] }),
        }) as never,
    })
    app = new Hono<AppEnv>()
    app.onError(errorHandler)
    app.route("/api/auth", mountAuthRoutes({ redis, auth }))
    app.route("/api", mountRoomAiRoutes({ auth, roomAi, voiceQuestion: vi.fn() as never }))
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

  async function seedProposal(
    messageId: string,
    overrides: Partial<RoomChatMessage["proposal"]> = {}
  ) {
    const message: RoomChatMessage = {
      id: messageId,
      diagramId: DIAGRAM_ID,
      author: { id: "room-ai", name: "Room AI", kind: "ai" },
      intent: "change",
      text: "Proposal ready",
      createdAt: "2026-11-02T00:00:00.000Z",
      proposal: {
        diff,
        status: "pending",
        baseGeneration: GENERATION,
        baseRev: 3,
        ...overrides,
      },
    }
    await redis.rPush(k.aiChat(DIAGRAM_ID), JSON.stringify(message))
    await redis.expire(k.aiChat(DIAGRAM_ID), 3600)
  }

  const claim = (token: string, messageId: string) =>
    app.request(`/api/rooms/${DIAGRAM_ID}/ai/proposals/${messageId}/claim`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })

  it("allows exactly one concurrent claimant and returns the generated diff", async () => {
    const alice = await register("alice.proposal@example.com", "Alice")
    const bob = await register("bob.proposal@example.com", "Bob")
    const messageId = "11111111-1111-4111-8111-111111111111"
    await seedProposal(messageId)

    const responses = await Promise.all([
      claim(alice.token, messageId),
      claim(bob.token, messageId),
    ])
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409])
    const success = responses.find((response) => response.status === 200)!
    expect(await success.json()).toEqual({ diff })
    expect(events.filter((entry) => entry.event.type === "message.updated")).toHaveLength(1)
  })

  it("marks a proposal stale when its target no longer exists on the current replica", async () => {
    const alice = await register("stale.proposal@example.com", "Alice")
    const messageId = "22222222-2222-4222-8222-222222222222"
    await seedProposal(messageId)
    revision = 4
    nodes = []

    const response = await claim(alice.token, messageId)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: "ROOM_AI_PROPOSAL_STALE" })
    const raw = await redis.lRange(k.aiChat(DIAGRAM_ID), 0, -1)
    expect(JSON.parse(raw[0]!).proposal.diff).toEqual(diff)
    expect(await redis.hGet(k.aiProposalState(DIAGRAM_ID, messageId), "status")).toBe("stale")
    const history = await app.request(`/api/rooms/${DIAGRAM_ID}/ai/messages`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    })
    expect((await history.json())[0].proposal.status).toBe("stale")
    expect(events).toContainEqual(
      expect.objectContaining({ event: expect.objectContaining({ type: "message.updated" }) })
    )
  })

  it("keeps a valid proposal claimable after unrelated diagram edits", async () => {
    const alice = await register("unrelated-edit@example.com", "Alice")
    const messageId = "44444444-4444-4444-8444-444444444444"
    await seedProposal(messageId)
    revision = 4

    const response = await claim(alice.token, messageId)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ diff })
  })

  it("reclaims a proposal when its previous claim lease has expired", async () => {
    const alice = await register("expired-lease-alice@example.com", "Alice")
    const bob = await register("expired-lease-bob@example.com", "Bob")
    const messageId = "55555555-5555-4555-8555-555555555555"
    await seedProposal(messageId)
    expect((await claim(alice.token, messageId)).status).toBe(200)

    await redis.del(k.aiProposalClaim(DIAGRAM_ID, messageId))
    const reclaimed = await claim(bob.token, messageId)

    expect(reclaimed.status).toBe(200)
    expect(await redis.hGet(k.aiProposalState(DIAGRAM_ID, messageId), "claimedBy")).toBe(bob.id)
  })

  it("marks a proposal stale after its abandoned claim lease expires", async () => {
    const alice = await register("abandoned-lease-alice@example.com", "Alice")
    const bob = await register("abandoned-lease-bob@example.com", "Bob")
    const messageId = "77777777-7777-4777-8777-777777777777"
    await seedProposal(messageId)
    expect((await claim(alice.token, messageId)).status).toBe(200)

    await redis.del(k.aiProposalClaim(DIAGRAM_ID, messageId))
    nodes = []
    revision = 4

    const response = await claim(bob.token, messageId)

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: "ROOM_AI_PROPOSAL_STALE" })
    expect(await redis.hGet(k.aiProposalState(DIAGRAM_ID, messageId), "status")).toBe("stale")
  })

  it("records a claim result and broadcasts the terminal message update", async () => {
    const alice = await register("result.proposal@example.com", "Alice")
    const messageId = "33333333-3333-4333-8333-333333333333"
    await seedProposal(messageId)
    expect((await claim(alice.token, messageId)).status).toBe(200)

    const response = await app.request(
      `/api/rooms/${DIAGRAM_ID}/ai/proposals/${messageId}/result`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${alice.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "applied" }),
      }
    )
    expect(response.status).toBe(204)
    const raw = await redis.lRange(k.aiChat(DIAGRAM_ID), 0, -1)
    expect(JSON.parse(raw[0]!).proposal.diff).toEqual(diff)
    const proposalStateKey = k.aiProposalState(DIAGRAM_ID, messageId)
    expect(await redis.hGet(proposalStateKey, "status")).toBe("applied")
    expect(await redis.ttl(proposalStateKey)).toBeGreaterThan(3000)

    await redis.expire(proposalStateKey, 1)
    await createChatRepository<RoomChatMessage>(redis, 3600).append(DIAGRAM_ID, {
      id: "66666666-6666-4666-8666-666666666666",
      diagramId: DIAGRAM_ID,
      author: { id: alice.id, name: "Alice", kind: "user" },
      intent: "ask",
      text: "Another question",
      createdAt: "2026-11-02T00:01:00.000Z",
    })
    expect(await redis.ttl(proposalStateKey)).toBeGreaterThan(3000)

    const history = await app.request(`/api/rooms/${DIAGRAM_ID}/ai/messages`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    })
    expect((await history.json())[0].proposal.status).toBe("applied")
    expect(events.filter((entry) => entry.event.type === "message.updated")).toHaveLength(2)
  })
})
