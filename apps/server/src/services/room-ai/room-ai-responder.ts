import type { RoomAiIntent, UMLModel } from "@umlstudio/core"
import type { RoomAiTeachingProfile } from "./room-ai-personal-profile.js"
import {
  ConfirmedInferenceNotStartedError,
  InferenceTerminationUnconfirmedError,
} from "./inference-not-started.js"

export class RoomAiPromptTooLargeError extends ConfirmedInferenceNotStartedError {
  constructor() {
    super("Room AI prompt exceeds the configured token budget", {
      stage: "responder_http_rejection",
      reasonCode: "prompt_too_large",
    })
    this.name = "RoomAiPromptTooLargeError"
  }
}

export class RoomAiTokenizerUnavailableError extends ConfirmedInferenceNotStartedError {
  constructor() {
    super("Room AI tokenizer is unavailable", {
      stage: "responder_http_rejection",
      reasonCode: "tokenizer_unavailable",
    })
    this.name = "RoomAiTokenizerUnavailableError"
  }
}

export interface RoomAiInferenceRequest {
  messageId: string
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

function safeTransportErrorName(error: unknown): string {
  if (!(error instanceof Error) || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(error.name)) {
    return "UnknownError"
  }
  return error.name
}

export function createRoomAiResponder(options: RoomAiResponderOptions) {
  const fetcher = options.fetcher ?? fetch
  return async function respond(request: RoomAiInferenceRequest): Promise<RoomAiServiceResponse> {
    if (!options.serviceUrl.trim()) {
      throw new ConfirmedInferenceNotStartedError("Room AI service is not configured", {
        stage: "responder_config",
        reasonCode: "service_url_missing",
      })
    }
    if (!options.internalToken.trim()) {
      throw new ConfirmedInferenceNotStartedError("Room AI service is not configured", {
        stage: "responder_config",
        reasonCode: "internal_token_missing",
      })
    }
    let context: unknown
    try {
      context = JSON.parse(request.contextJson)
    } catch {
      throw new ConfirmedInferenceNotStartedError("Room AI context is invalid", {
        stage: "responder_context_validation",
        reasonCode: "context_json_invalid",
      })
    }
    if (context === null || typeof context !== "object" || Array.isArray(context)) {
      throw new ConfirmedInferenceNotStartedError("Room AI context is invalid", {
        stage: "responder_context_validation",
        reasonCode: "context_not_object",
      })
    }
    if (containsPrivateData(context)) {
      throw new ConfirmedInferenceNotStartedError("Room AI context is invalid", {
        stage: "responder_context_validation",
        reasonCode: "context_contains_private_data",
      })
    }

    let endpoint: URL
    try {
      endpoint = new URL("/internal/v1/room/respond", options.serviceUrl)
    } catch {
      throw new ConfirmedInferenceNotStartedError("Room AI service is not configured", {
        stage: "responder_config",
        reasonCode: "service_url_invalid",
      })
    }
    if (
      !new Set(["http:", "https:"]).has(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password
    ) {
      throw new ConfirmedInferenceNotStartedError("Room AI service is not configured", {
        stage: "responder_config",
        reasonCode: "service_url_disallowed_protocol_or_credentials",
      })
    }
    if (endpoint.protocol === "http:" && !isLoopback(endpoint.hostname)) {
      throw new ConfirmedInferenceNotStartedError("Room AI service is not configured", {
        stage: "responder_config",
        reasonCode: "service_url_non_loopback_http",
      })
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
          "X-Room-AI-Message-ID": request.messageId,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs ?? 90_000),
        redirect: "error",
      })
    } catch (error) {
      throw new InferenceTerminationUnconfirmedError("Room AI inference failed", {
        stage: "downstream_transport",
        reasonCode: "transport_error",
        transportErrorName: safeTransportErrorName(error),
      })
    }
    if (response.status === 413) throw new RoomAiPromptTooLargeError()
    if (response.status === 503) throw new RoomAiTokenizerUnavailableError()
    if (response.status === 404) {
      throw new ConfirmedInferenceNotStartedError("Room AI inference endpoint was not found", {
        stage: "responder_http_rejection",
        reasonCode: "inference_endpoint_not_found",
        upstreamStatus: response.status,
      })
    }
    if (!response.ok) {
      throw new InferenceTerminationUnconfirmedError("Room AI inference failed", {
        stage: "downstream_http_response",
        reasonCode: "non_success_http_status",
        upstreamStatus: response.status,
      })
    }

    let result: unknown
    try {
      result = await response.json()
    } catch {
      throw new InferenceTerminationUnconfirmedError("Room AI returned an invalid response", {
        stage: "downstream_response",
        reasonCode: "invalid_json",
        upstreamStatus: response.status,
      })
    }
    if (!result || typeof result !== "object") {
      throw new InferenceTerminationUnconfirmedError("Room AI returned an invalid response", {
        stage: "downstream_response",
        reasonCode: "invalid_response_shape",
        upstreamStatus: response.status,
      })
    }
    const { text, provider } = result as Record<string, unknown>
    if (
      typeof text !== "string" ||
      !text.trim() ||
      typeof provider !== "string" ||
      !provider.trim()
    ) {
      throw new InferenceTerminationUnconfirmedError("Room AI returned an invalid response", {
        stage: "downstream_response",
        reasonCode: "invalid_response_shape",
        upstreamStatus: response.status,
      })
    }
    return { text, provider }
  }
}
