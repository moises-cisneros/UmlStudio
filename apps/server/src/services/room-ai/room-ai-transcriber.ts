export interface RoomAiTranscription {
  text: string
  confidence: number
}

export interface RoomAiTranscriberInput {
  bytes: Uint8Array
  filename: string
  contentType: string
}

export class RoomAiTranscriptionUnavailableError extends Error {
  constructor() {
    super("Room voice transcription is unavailable")
    this.name = "RoomAiTranscriptionUnavailableError"
  }
}

interface RoomAiTranscriberOptions {
  serviceUrl: string
  internalToken: string
  timeoutMs?: number
  fetcher?: typeof fetch
}

function isLoopback(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "127.0.0.1" ||
    normalized === "[::1]"
  )
}

export function createRoomAiTranscriber(options: RoomAiTranscriberOptions) {
  const fetcher = options.fetcher ?? fetch
  return async function transcribe(input: RoomAiTranscriberInput): Promise<RoomAiTranscription> {
    if (!options.internalToken.trim() || !options.serviceUrl.trim()) {
      throw new RoomAiTranscriptionUnavailableError()
    }

    let endpoint: URL
    try {
      endpoint = new URL("/internal/v1/transcribe", options.serviceUrl)
    } catch {
      throw new RoomAiTranscriptionUnavailableError()
    }
    if (
      !new Set(["http:", "https:"]).has(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password ||
      (endpoint.protocol === "http:" && !isLoopback(endpoint.hostname))
    ) {
      throw new RoomAiTranscriptionUnavailableError()
    }

    try {
      const body = new FormData()
      const audioBuffer = input.bytes.slice().buffer as ArrayBuffer
      body.set("file", new Blob([audioBuffer], { type: input.contentType }), input.filename)
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: { "X-Internal-Token": options.internalToken },
        body,
        signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
        redirect: "error",
      })
      if (!response.ok) throw new RoomAiTranscriptionUnavailableError()

      const payload: unknown = await response.json()
      if (!payload || typeof payload !== "object") {
        throw new RoomAiTranscriptionUnavailableError()
      }
      const result = payload as Record<string, unknown>
      const text = result.text
      const confidence = result.confidence
      if (
        typeof text !== "string" ||
        typeof confidence !== "number" ||
        !Number.isFinite(confidence)
      ) {
        throw new RoomAiTranscriptionUnavailableError()
      }
      return { text, confidence }
    } catch (error) {
      if (error instanceof RoomAiTranscriptionUnavailableError) throw error
      throw new RoomAiTranscriptionUnavailableError()
    }
  }
}

export type RoomAiTranscriber = ReturnType<typeof createRoomAiTranscriber>
