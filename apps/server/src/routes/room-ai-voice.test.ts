import { describe, expect, it, vi } from "vitest"
import { Hono } from "hono"
import type { AppEnv } from "../http/env.js"
import { errorHandler } from "../http/middleware/errors.js"
import type { AuthService } from "../services/auth-service.js"
import type { RoomAiService } from "../services/room-ai/room-ai-service.js"
import { mountRoomAiRoutes } from "./room-ai.js"

const auth = {
  verifyAccess: vi.fn(async () => ({ userId: "user-1" })),
  getProfile: vi.fn(async () => ({ id: "user-1", email: "user@example.test", name: "Juan" })),
} as unknown as AuthService

function appWith(voiceQuestion: ReturnType<typeof vi.fn>) {
  const app = new Hono<AppEnv>()
  app.onError(errorHandler)
  app.route(
    "/api",
    mountRoomAiRoutes({
      auth,
      roomAi: {} as RoomAiService,
      voiceQuestion,
    })
  )
  return app
}

function voiceForm() {
  const form = new FormData()
  form.set("file", new Blob(["audio bytes"], { type: "audio/webm" }), "question.webm")
  form.set("replica", JSON.stringify({ generation: "a".repeat(64), revision: 3 }))
  form.set("teachingProfile", JSON.stringify({ detailLevel: "balanced", exampleStyle: "analogy" }))
  form.set("profileRevision", "00000000-0000-4000-8000-000000000001")
  return form
}

describe("Room voice question route", () => {
  it("requires the authenticated user and delegates a public voice question", async () => {
    const voiceQuestion = vi.fn(async () => ({ messageId: "message-1", queuePosition: 1 }))
    const app = appWith(voiceQuestion)
    const response = await app.request("/api/rooms/room-1/ai/voice", {
      method: "POST",
      headers: { Authorization: "Bearer valid" },
      body: voiceForm(),
    })

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ messageId: "message-1", queuePosition: 1 })
    expect(voiceQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        diagramId: "room-1",
        author: expect.objectContaining({ id: "user-1", name: "Juan" }),
        filename: "question.webm",
        contentType: "audio/webm",
        replica: { generation: "a".repeat(64), revision: 3 },
        teachingProfile: { detailLevel: "balanced", exampleStyle: "analogy" },
        profileRevision: "00000000-0000-4000-8000-000000000001",
      })
    )
    expect([...voiceQuestion.mock.calls[0][0].bytes]).toEqual([
      ...new TextEncoder().encode("audio bytes"),
    ])
  })

  it("does not transcribe unauthenticated or invalid-replica requests", async () => {
    const voiceQuestion = vi.fn()
    const app = appWith(voiceQuestion)
    const unauthenticated = await app.request("/api/rooms/room-1/ai/voice", {
      method: "POST",
      body: voiceForm(),
    })
    const invalidForm = new FormData()
    invalidForm.set("file", new Blob(["audio"], { type: "audio/webm" }), "question.webm")
    invalidForm.set("replica", "not-json")
    const invalidReplica = await app.request("/api/rooms/room-1/ai/voice", {
      method: "POST",
      headers: { Authorization: "Bearer valid" },
      body: invalidForm,
    })

    expect(unauthenticated.status).toBe(401)
    expect(invalidReplica.status).toBe(422)
    expect(voiceQuestion).not.toHaveBeenCalled()
  })

  it("rejects raw personal memory before transcription", async () => {
    const voiceQuestion = vi.fn()
    const app = appWith(voiceQuestion)
    const form = voiceForm()
    form.set("personalMemory", "private note")
    const response = await app.request("/api/rooms/room-1/ai/voice", {
      method: "POST",
      headers: { Authorization: "Bearer valid" },
      body: form,
    })
    expect(response.status).toBe(422)
    expect(voiceQuestion).not.toHaveBeenCalled()
  })
})
