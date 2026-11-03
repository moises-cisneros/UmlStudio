import { describe, expect, it, vi } from "vitest"
import { createRoomAiResponder } from "./room-ai-responder.js"

const request = {
  messageId: "message-123",
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
      expect(init?.headers).toMatchObject({
        "X-Internal-Token": "internal-secret",
        "X-Room-AI-Message-ID": "message-123",
      })
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

  it("preserves a valid change diff for the proposal claim lifecycle", async () => {
    const proposal = { add: { elements: [], relationships: [] } }
    const respond = createRoomAiResponder({
      serviceUrl: "https://ai.internal",
      internalToken: "secret",
      fetcher: vi.fn(async () =>
        Response.json({ text: "I prepared the change.", diff: proposal, provider: "self-hosted" })
      ),
    })

    await expect(respond({ ...request, intent: "change" })).resolves.toEqual({
      text: "I prepared the change.",
      provider: "self-hosted",
      diff: proposal,
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

  it("exposes safe downstream HTTP diagnostics without logging the response body", async () => {
    const fetcher = vi.fn(async () => new Response("secret downstream details", { status: 502 }))
    const respond = createRoomAiResponder({
      serviceUrl: "https://ai.internal",
      internalToken: "secret-token",
      fetcher,
    })

    let failure: unknown
    try {
      await respond(request)
    } catch (error) {
      failure = error
    }

    expect(failure).toMatchObject({
      name: "InferenceTerminationUnconfirmedError",
      message: "Room AI inference failed",
      diagnostic: {
        stage: "downstream_http_response",
        reasonCode: "non_success_http_status",
        upstreamStatus: 502,
      },
    })
    expect(JSON.stringify(failure)).not.toContain("secret downstream details")
    expect(JSON.stringify(failure)).not.toContain("secret-token")

    const transportRespond = createRoomAiResponder({
      serviceUrl: "https://ai.internal",
      internalToken: "secret-token",
      fetcher: vi.fn(async () => {
        throw new TypeError("failed to connect to https://private.internal/token=secret")
      }),
    })
    let transportFailure: unknown
    try {
      await transportRespond(request)
    } catch (error) {
      transportFailure = error
    }
    expect(transportFailure).toMatchObject({
      name: "InferenceTerminationUnconfirmedError",
      diagnostic: {
        stage: "downstream_transport",
        reasonCode: "transport_error",
        transportErrorName: "TypeError",
      },
    })
    expect(JSON.stringify(transportFailure)).not.toContain("private.internal")
    expect(JSON.stringify(transportFailure)).not.toContain("secret-token")
  })

  it("tags pre-inference responder rejections with bounded stage and reason codes", async () => {
    const fetcher = vi.fn()

    await expect(
      createRoomAiResponder({ serviceUrl: "   ", internalToken: "secret", fetcher })(request)
    ).rejects.toMatchObject({
      message: "Room AI service is not configured",
      stage: "responder_config",
      reasonCode: "service_url_missing",
    })

    await expect(
      createRoomAiResponder({ serviceUrl: "https://ai.internal", internalToken: " ", fetcher })(
        request
      )
    ).rejects.toMatchObject({
      message: "Room AI service is not configured",
      stage: "responder_config",
      reasonCode: "internal_token_missing",
    })

    await expect(
      createRoomAiResponder({ serviceUrl: "://bad url", internalToken: "secret", fetcher })(request)
    ).rejects.toMatchObject({
      message: "Room AI service is not configured",
      stage: "responder_config",
      reasonCode: "service_url_invalid",
    })

    await expect(
      createRoomAiResponder({
        serviceUrl: "https://user:pass@ai.internal",
        internalToken: "secret",
        fetcher,
      })(request)
    ).rejects.toMatchObject({
      message: "Room AI service is not configured",
      stage: "responder_config",
      reasonCode: "service_url_disallowed_protocol_or_credentials",
    })

    await expect(
      createRoomAiResponder({ serviceUrl: "http://ai.internal", internalToken: "secret", fetcher })(
        request
      )
    ).rejects.toMatchObject({
      message: "Room AI service is not configured",
      stage: "responder_config",
      reasonCode: "service_url_non_loopback_http",
    })

    const configured = createRoomAiResponder({
      serviceUrl: "https://ai.internal",
      internalToken: "secret",
      fetcher,
    })
    await expect(configured({ ...request, contextJson: "not-json" })).rejects.toMatchObject({
      message: "Room AI context is invalid",
      stage: "responder_context_validation",
      reasonCode: "context_json_invalid",
    })
    await expect(configured({ ...request, contextJson: "[]" })).rejects.toMatchObject({
      message: "Room AI context is invalid",
      stage: "responder_context_validation",
      reasonCode: "context_not_object",
    })
    await expect(
      configured({
        ...request,
        contextJson: JSON.stringify({ room: { privateContext: "personal" } }),
      })
    ).rejects.toMatchObject({
      message: "Room AI context is invalid",
      stage: "responder_context_validation",
      reasonCode: "context_contains_private_data",
    })

    const responder413 = createRoomAiResponder({
      serviceUrl: "https://ai.internal",
      internalToken: "secret",
      fetcher: vi.fn(async () => new Response(null, { status: 413 })),
    })
    await expect(responder413(request)).rejects.toMatchObject({
      name: "RoomAiPromptTooLargeError",
      stage: "responder_http_rejection",
      reasonCode: "prompt_too_large",
    })

    const responder503 = createRoomAiResponder({
      serviceUrl: "https://ai.internal",
      internalToken: "secret",
      fetcher: vi.fn(async () => new Response(null, { status: 503 })),
    })
    await expect(responder503(request)).rejects.toMatchObject({
      name: "RoomAiTokenizerUnavailableError",
      stage: "responder_http_rejection",
      reasonCode: "tokenizer_unavailable",
    })

    const responder404 = createRoomAiResponder({
      serviceUrl: "http://127.0.0.1:8001",
      internalToken: "secret",
      fetcher: vi.fn(async () => new Response(null, { status: 404 })),
    })
    await expect(responder404(request)).rejects.toMatchObject({
      name: "ConfirmedInferenceNotStartedError",
      stage: "responder_http_rejection",
      reasonCode: "inference_endpoint_not_found",
      upstreamStatus: 404,
    })

    const responder422 = createRoomAiResponder({
      serviceUrl: "http://127.0.0.1:8001",
      internalToken: "secret",
      fetcher: vi.fn(async () => new Response(null, { status: 422 })),
    })
    await expect(responder422(request)).rejects.toMatchObject({
      name: "ConfirmedInferenceTerminatedError",
      diagnostic: {
        stage: "downstream_http_response",
        upstreamStatus: 422,
      },
    })
  })
})
