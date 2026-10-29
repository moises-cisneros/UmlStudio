import { afterEach, describe, expect, it, vi } from "vitest"
import { DiagramApiClient } from "./DiagramApiClient"

vi.mock("@/stores/useAuthStore", () => ({
  useAuthStore: { getState: () => ({ token: "session-token" }) },
}))

describe("DiagramApiClient Room voice request", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("uploads audio to the authenticated server Room route, not directly to ai-service", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ messageId: "message-1", queuePosition: 1 }, { status: 202 })
    )
    vi.stubGlobal("fetch", fetchMock)
    const audio = new Blob(["voice"], { type: "audio/webm" })

    await DiagramApiClient.postRoomAiVoiceMessage("room-1", {
      file: audio,
      filename: "question.webm",
      replica: { generation: "a".repeat(64), revision: 3 },
      teachingProfile: { detailLevel: "balanced", exampleStyle: "analogy" },
      profileRevision: "00000000-0000-4000-8000-000000000001",
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain("/api/rooms/room-1/ai/voice")
    expect(url).not.toContain("/api/transcribe")
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer session-token")
    expect(new Headers(init?.headers).has("Content-Type")).toBe(false)
    const body = init?.body as FormData
    expect((body.get("file") as File).name).toBe("question.webm")
    expect(body.get("replica")).toBe(JSON.stringify({ generation: "a".repeat(64), revision: 3 }))
    expect(body.get("teachingProfile")).toBe(
      JSON.stringify({ detailLevel: "balanced", exampleStyle: "analogy" })
    )
    expect(body.get("profileRevision")).toBe("00000000-0000-4000-8000-000000000001")
    expect(body.has("personalMemory")).toBe(false)
  })
})
