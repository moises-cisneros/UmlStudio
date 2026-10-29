import { describe, expect, it, vi } from "vitest"
import { createRoomAiResponder } from "./room-ai-responder.js"

const request = {
  route: "shared" as const,
  requester: { id: "user-1", name: "Ada" },
  intent: "ask" as const,
  question: "Explain this model",
  board: { nodes: [], edges: [] },
  contextJson: JSON.stringify({ summary: "shared" }),
}

describe("Room AI internal responder", () => {
  it("calls only the configured internal service with explicit self-hosted routing", async () => {
    const fetcher = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ "X-Internal-Token": "internal-secret" })
      expect(JSON.parse(String(init?.body))).toMatchObject({
        mode: "explain",
        provider: "self_hosted",
        route: "shared",
        requester: request.requester,
        context: { summary: "shared" },
      })
      return Response.json({ text: "Answer", diff: null, provider: "self-hosted" })
    })
    const respond = createRoomAiResponder({
      serviceUrl: "http://127.0.0.1:8001/",
      internalToken: "internal-secret",
      fetcher,
    })

    await expect(respond(request)).resolves.toEqual({ text: "Answer", provider: "self-hosted" })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "http://127.0.0.1:8001/internal/v1/room/respond"
    )
  })

  it("sends only the approved teaching profile to the shared self-hosted route", async () => {
    const fetcher = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body).toMatchObject({
        provider: "self_hosted",
        route: "shared",
        teaching_profile: { detailLevel: "balanced", exampleStyle: "analogy" },
      })
      expect(body.context).not.toHaveProperty("personal_memory")
      expect(body.context).not.toHaveProperty("private_context")
      expect(body).not.toHaveProperty("personal_memory")
      return Response.json({ text: "Room answer", diff: null, provider: "self-hosted" })
    })
    const respond = createRoomAiResponder({
      serviceUrl: "https://ai.internal",
      internalToken: "secret",
      fetcher,
    })
    await expect(
      respond({
        ...request,
        teachingProfile: { detailLevel: "balanced", exampleStyle: "analogy" },
      })
    ).resolves.toMatchObject({
      text: "Room answer",
    })
  })

  it("rejects nested personal fields in shared context", async () => {
    const fetcher = vi.fn()
    const respond = createRoomAiResponder({
      serviceUrl: "https://ai.internal",
      internalToken: "secret",
      fetcher,
    })
    await expect(
      respond({ ...request, contextJson: JSON.stringify({ room: { privateContext: "personal" } }) })
    ).rejects.toThrow("Room AI context is invalid")
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("rejects plain HTTP for non-loopback inference services", async () => {
    const fetcher = vi.fn()
    const respond = createRoomAiResponder({
      serviceUrl: "http://ai.internal",
      internalToken: "secret",
      fetcher,
    })
    await expect(respond(request)).rejects.toThrow("Room AI service is not configured")
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("does not follow redirects that could forward the internal token elsewhere", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(null, {
          status: 307,
          headers: { Location: "http://external.invalid/collect" },
        })
    )
    const respond = createRoomAiResponder({
      serviceUrl: "https://ai.internal",
      internalToken: "secret",
      fetcher,
    })
    await expect(respond(request)).rejects.toThrow("Room AI inference failed")
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe("error")
  })

  it("fails closed when internal credentials are absent or the service fails", async () => {
    const fetcher = vi.fn(async () => new Response("secret provider details", { status: 500 }))
    const respondWithoutToken = createRoomAiResponder({
      serviceUrl: "https://ai.internal",
      internalToken: "",
      fetcher,
    })
    await expect(respondWithoutToken(request)).rejects.toThrow("Room AI service is not configured")
    const respond = createRoomAiResponder({
      serviceUrl: "https://ai.internal",
      internalToken: "secret",
      fetcher,
    })
    await expect(respond(request)).rejects.toThrow("Room AI inference failed")
    expect(fetcher).toHaveBeenCalledOnce()
  })
})
