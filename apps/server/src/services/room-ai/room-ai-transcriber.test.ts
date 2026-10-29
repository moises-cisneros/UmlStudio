import { describe, expect, it, vi } from "vitest"
import {
  createRoomAiTranscriber,
  RoomAiTranscriptionUnavailableError,
} from "./room-ai-transcriber.js"

describe("Room AI internal audio transcriber", () => {
  it("posts audio to the internal service with the server token", async () => {
    let request: RequestInit | undefined
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      request = init
      return Response.json({ text: "Ask about the diagram", confidence: 0.9 })
    })
    const transcribe = createRoomAiTranscriber({
      serviceUrl: "https://ai.internal/",
      internalToken: "server-secret",
      fetcher: fetcher as typeof fetch,
    })

    const result = await transcribe({
      bytes: new Uint8Array([1, 2, 3]),
      filename: "voice.webm",
      contentType: "audio/webm",
    })

    expect(fetcher).toHaveBeenCalledWith(
      new URL("/internal/v1/transcribe", "https://ai.internal/"),
      expect.objectContaining({ method: "POST", redirect: "error" })
    )
    expect(new Headers(request?.headers).get("X-Internal-Token")).toBe("server-secret")
    const file = (request?.body as FormData).get("file") as File
    expect(file.name).toBe("voice.webm")
    expect(file.type).toBe("audio/webm")
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([1, 2, 3])
    expect(result).toEqual({ text: "Ask about the diagram", confidence: 0.9 })
  })

  it("fails closed for non-loopback HTTP service URLs", async () => {
    const fetcher = vi.fn()
    const transcribe = createRoomAiTranscriber({
      serviceUrl: "http://ai.internal",
      internalToken: "server-secret",
      fetcher: fetcher as typeof fetch,
    })

    await expect(
      transcribe({ bytes: new Uint8Array([1]), filename: "voice.webm", contentType: "audio/webm" })
    ).rejects.toBeInstanceOf(RoomAiTranscriptionUnavailableError)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("does not expose internal provider response bodies on failure", async () => {
    const fetcher = vi.fn(async () => new Response("private provider details", { status: 503 }))
    const transcribe = createRoomAiTranscriber({
      serviceUrl: "https://ai.internal",
      internalToken: "server-secret",
      fetcher: fetcher as typeof fetch,
    })

    await expect(
      transcribe({ bytes: new Uint8Array([1]), filename: "voice.webm", contentType: "audio/webm" })
    ).rejects.toThrow("Room voice transcription is unavailable")
  })
})
