import { describe, expect, it, vi } from "vitest"
import { Hono } from "hono"
import type { AppEnv } from "../http/env.js"
import { errorHandler } from "../http/middleware/errors.js"
import type { AuthService } from "../services/auth-service.js"
import { mountRoomAiRoutes } from "./room-ai.js"
import type { RoomAiService } from "../services/room-ai/room-ai-service.js"

const auth = {
  verifyAccess: vi.fn(async () => ({ userId: "user-1" })),
  getProfile: vi.fn(async () => ({ id: "user-1", email: "user@example.test", name: "User" })),
} as unknown as AuthService

function appWith(roomAi: RoomAiService) {
  const app = new Hono<AppEnv>()
  app.onError(errorHandler)
  app.route(
    "/api",
    mountRoomAiRoutes({
      auth,
      roomAi,
      voiceQuestion: vi.fn(async () => ({ messageId: "voice-message", queuePosition: 1 })),
    })
  )
  return app
}

describe("Room AI routes", () => {
  it("passes only an approved teaching profile and revision to the shared queue", async () => {
    const profileUpdate = {
      profile: { detailLevel: "concise", exampleStyle: "uml" as const },
      revision: "00000000-0000-4000-8000-000000000002",
    }
    const postMessage = vi.fn(async () => ({
      messageId: "message-1",
      queuePosition: 1,
      profileUpdate,
    }))
    const roomAi = {
      postMessage,
      listMessages: vi.fn(),
    } as unknown as RoomAiService
    const app = appWith(roomAi)

    const response = await app.request("/api/rooms/room-1/ai/messages", {
      method: "POST",
      headers: { Authorization: "Bearer valid", "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Explain this diagram",
        intent: "ask",
        teachingProfile: { detailLevel: "balanced", exampleStyle: "analogy" },
        profileRevision: "00000000-0000-4000-8000-000000000001",
        replica: { generation: "a".repeat(64), revision: 3 },
      }),
    })

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toMatchObject({ profileUpdate })
    expect(postMessage).toHaveBeenCalledWith({
      diagramId: "room-1",
      author: { id: "user-1", email: "user@example.test", name: "User" },
      text: "Explain this diagram",
      intent: "ask",
      teachingProfile: { detailLevel: "balanced", exampleStyle: "analogy" },
      profileRevision: "00000000-0000-4000-8000-000000000001",
      replica: { generation: "a".repeat(64), revision: 3 },
    })
  })

  it("does not expose the former free-text profile derivation endpoint", async () => {
    const app = appWith({} as unknown as RoomAiService)
    const response = await app.request("/api/rooms/room-1/ai/personal-profile/derive", {
      method: "POST",
      headers: { Authorization: "Bearer valid", "Content-Type": "application/json" },
      body: JSON.stringify({ memory: "old free-text note" }),
    })
    expect(response.status).toBe(404)
  })

  it("rejects raw personal memory on the public Room question route", async () => {
    const postMessage = vi.fn()
    const app = appWith({ postMessage, listMessages: vi.fn() } as unknown as RoomAiService)

    const response = await app.request("/api/rooms/room-1/ai/messages", {
      method: "POST",
      headers: { Authorization: "Bearer valid", "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Explain this diagram",
        intent: "ask",
        personalMemory: "private note",
        replica: { generation: "a".repeat(64), revision: 3 },
      }),
    })

    expect(response.status).toBe(422)
    expect(postMessage).not.toHaveBeenCalled()
  })

  it("does not expose a one-person Private Room chat endpoint", async () => {
    const roomAi = {} as unknown as RoomAiService
    const app = appWith(roomAi)

    const response = await app.request("/api/rooms/room-1/ai/private-messages", {
      method: "POST",
      headers: { Authorization: "Bearer valid", "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "private question",
        replica: { generation: "a".repeat(64), revision: 3 },
      }),
    })

    expect(response.status).toBe(404)
  })

  it("rejects shared requests without a synchronized replica acknowledgement", async () => {
    const postMessage = vi.fn(async () => ({ messageId: "message-1", queuePosition: 1 }))
    const roomAi = {
      postMessage,
      listMessages: vi.fn(),
    } as unknown as RoomAiService
    const app = appWith(roomAi)

    const response = await app.request("/api/rooms/room-1/ai/messages", {
      method: "POST",
      headers: { Authorization: "Bearer valid", "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Use the current board", intent: "ask" }),
    })

    expect(response.status).toBe(422)
    expect(postMessage).not.toHaveBeenCalled()
  })

  it("preserves the existing 4,000-character limit for typed public questions", async () => {
    const postMessage = vi.fn()
    const roomAi = {
      postMessage,
      listMessages: vi.fn(),
    } as unknown as RoomAiService
    const app = appWith(roomAi)

    const response = await app.request("/api/rooms/room-1/ai/messages", {
      method: "POST",
      headers: { Authorization: "Bearer valid", "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "x".repeat(4001),
        intent: "ask",
        replica: { generation: "a".repeat(64), revision: 3 },
      }),
    })

    expect(response.status).toBe(422)
    expect(postMessage).not.toHaveBeenCalled()
  })

  it("exposes only shared memory through authenticated Room routes", async () => {
    const getSharedMemory = vi.fn(async () => ({
      summary: "Use a layered architecture",
      decisions: ["Keep personal notes in the browser"],
    }))
    const pinSharedDecision = vi.fn(async () => {})
    const roomAi = {
      postMessage: vi.fn(),
      listMessages: vi.fn(),
      getSharedMemory,
      pinSharedDecision,
    } as unknown as RoomAiService
    const app = appWith(roomAi)

    const memory = await app.request("/api/rooms/room-1/ai/memory", {
      headers: { Authorization: "Bearer valid" },
    })
    expect(memory.status).toBe(200)
    expect(await memory.json()).toEqual({
      summary: "Use a layered architecture",
      pinnedDecisions: ["Keep personal notes in the browser"],
    })

    const pin = await app.request("/api/rooms/room-1/ai/memory/pins", {
      method: "POST",
      headers: { Authorization: "Bearer valid", "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Use a layered architecture" }),
    })
    expect(pin.status).toBe(201)
    expect(pinSharedDecision).toHaveBeenCalledWith("room-1", "Use a layered architecture")
  })
})
