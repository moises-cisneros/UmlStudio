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
  app.route("/api", mountRoomAiRoutes({ auth, roomAi }))
  return app
}

describe("Room AI routes", () => {
  it("rejects shared requests without a synchronized replica acknowledgement", async () => {
    const postMessage = vi.fn(async () => ({ messageId: "message-1", queuePosition: 1 }))
    const roomAi = {
      postMessage,
      postPrivateMessage: vi.fn(),
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
})
