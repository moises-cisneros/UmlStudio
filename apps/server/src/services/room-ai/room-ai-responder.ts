import type { RoomAiIntent, UMLModel } from "@umlstudio/core"
import type { RoomAiTeachingProfile } from "./room-ai-personal-profile.js"
import {
  ConfirmedInferenceNotStartedError,
  InferenceTerminationUnconfirmedError,
} from "./inference-not-started.js"

export class RoomAiPromptTooLargeError extends ConfirmedInferenceNotStartedError {
  constructor() {
    super("Room AI prompt exceeds the configured token budget")
    this.name = "RoomAiPromptTooLargeError"
  }
}

export class RoomAiTokenizerUnavailableError extends ConfirmedInferenceNotStartedError {
  constructor() {
    super("Room AI tokenizer is unavailable")
    this.name = "RoomAiTokenizerUnavailableError"
  }
}

export interface RoomAiInferenceRequest {
  route: "shared"
  requester: { id: string; name: string }
  intent: RoomAiIntent
  question: string
  board: UMLModel
  contextJson: string
  teachingProfile?: RoomAiTeachingProfile
}

interface RoomAiServiceResponse {
  text: string
  provider: string
}

interface RoomAiResponderOptions {
  serviceUrl: string
  internalToken: string
  timeoutMs?: number
  fetcher?: typeof fetch
}

function containsPrivateData(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsPrivateData)
  if (!value || typeof value !== "object") return false
  return Object.entries(value).some(
    ([key, nested]) =>
      key === "private_context" ||
      key === "privateContext" ||
      key === "personal_memory" ||
      key === "personalMemory" ||
      containsPrivateData(nested)
  )
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

export function createRoomAiResponder(options: RoomAiResponderOptions) {
  const fetcher = options.fetcher ?? fetch
  return async function respond(request: RoomAiInferenceRequest): Promise<RoomAiServiceResponse> {
    if (!options.internalToken.trim() || !options.serviceUrl.trim()) {
      throw new ConfirmedInferenceNotStartedError("Room AI service is not configured")
    }
    let context: unknown
    try {
      context = JSON.parse(request.contextJson)
    } catch {
      throw new ConfirmedInferenceNotStartedError("Room AI context is invalid")
    }
    if (context === null || typeof context !== "object" || Array.isArray(context)) {
      throw new ConfirmedInferenceNotStartedError("Room AI context is invalid")
    }
    if (containsPrivateData(context)) {
      throw new ConfirmedInferenceNotStartedError("Room AI context is invalid")
    }

    let endpoint: URL
    try {
      endpoint = new URL("/internal/v1/room/respond", options.serviceUrl)
    } catch {
      throw new ConfirmedInferenceNotStartedError("Room AI service is not configured")
    }
    if (
      !new Set(["http:", "https:"]).has(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password
    ) {
      throw new ConfirmedInferenceNotStartedError("Room AI service is not configured")
    }
    if (endpoint.protocol === "http:" && !isLoopback(endpoint.hostname)) {
      throw new ConfirmedInferenceNotStartedError("Room AI service is not configured")
    }

    const body = {
      mode: request.intent === "ask" ? "explain" : "change",
      requester: request.requester,
      question: request.question,
      board: request.board,
      context,
      provider: "self_hosted",
      route: request.route,
      ...(request.teachingProfile !== undefined
        ? { teaching_profile: request.teachingProfile }
        : {}),
    }

    let response: Response
    try {
      response = await fetcher(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": options.internalToken,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs ?? 90_000),
        redirect: "error",
      })
    } catch {
      throw new InferenceTerminationUnconfirmedError("Room AI inference failed")
    }
    if (response.status === 413) throw new RoomAiPromptTooLargeError()
    if (response.status === 503) throw new RoomAiTokenizerUnavailableError()
    if (!response.ok) {
      throw new InferenceTerminationUnconfirmedError("Room AI inference failed")
    }

    let result: unknown
    try {
      result = await response.json()
    } catch {
      throw new InferenceTerminationUnconfirmedError("Room AI returned an invalid response")
    }
    if (!result || typeof result !== "object") {
      throw new InferenceTerminationUnconfirmedError("Room AI returned an invalid response")
    }
    const { text, provider } = result as Record<string, unknown>
    if (
      typeof text !== "string" ||
      !text.trim() ||
      typeof provider !== "string" ||
      !provider.trim()
    ) {
      throw new InferenceTerminationUnconfirmedError("Room AI returned an invalid response")
    }
    return { text, provider }
  }
}
