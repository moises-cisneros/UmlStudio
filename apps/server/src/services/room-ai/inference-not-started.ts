import { AsyncLocalStorage } from "node:async_hooks"

export type RoomAiPreInferenceStage =
  | "dispatch_replica_requirement"
  | "orchestrator_personal_profile"
  | "orchestrator_profile_revision_pre_board"
  | "orchestrator_replica_requirement"
  | "orchestrator_board_snapshot"
  | "orchestrator_profile_revision_pre_inference"
  | "orchestrator_profile_revision_before_commit"
  | "responder_config"
  | "responder_context_validation"
  | "responder_http_rejection"
  | "unknown"

export type RoomAiPreInferenceReasonCode =
  | "replica_requirement_unavailable"
  | "personal_profile_sidecar_missing"
  | "personal_profile_requester_mismatch"
  | "personal_profile_sidecar_invalid"
  | "teaching_profile_revoked"
  | "board_replica_not_ready"
  | "board_replica_incomplete"
  | "board_replica_incomplete_after_read"
  | "service_url_missing"
  | "internal_token_missing"
  | "service_url_invalid"
  | "service_url_disallowed_protocol_or_credentials"
  | "service_url_non_loopback_http"
  | "context_json_invalid"
  | "context_not_object"
  | "context_contains_private_data"
  | "prompt_too_large"
  | "tokenizer_unavailable"
  | "inference_endpoint_not_found"
  | "unknown_pre_inference_rejection"

export interface InferenceNotStartedErrorOptions {
  stage?: RoomAiPreInferenceStage
  reasonCode?: RoomAiPreInferenceReasonCode
  upstreamStatus?: number
  cause?: unknown
}

/** A rejection raised before any provider request is started. */
export class InferenceNotStartedError extends Error {
  readonly stage: RoomAiPreInferenceStage
  readonly reasonCode: RoomAiPreInferenceReasonCode
  readonly upstreamStatus: number | undefined

  constructor(message?: string, options?: InferenceNotStartedErrorOptions) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = "InferenceNotStartedError"
    this.stage = options?.stage ?? "unknown"
    this.reasonCode = options?.reasonCode ?? "unknown_pre_inference_rejection"
    this.upstreamStatus = options?.upstreamStatus
  }
}

/** A trusted local or HTTP response that confirms inference never started. */
export class ConfirmedInferenceNotStartedError extends InferenceNotStartedError {
  constructor(message: string, options?: InferenceNotStartedErrorOptions) {
    super(message, options)
    this.name = "ConfirmedInferenceNotStartedError"
  }
}

export interface InferenceTerminationDiagnostic {
  stage: "downstream_transport" | "downstream_http_response" | "downstream_response"
  reasonCode:
    | "transport_error"
    | "non_success_http_status"
    | "invalid_json"
    | "invalid_response_shape"
  upstreamStatus?: number
  transportErrorName?: string
}

/** The provider request began, but its termination cannot be confirmed. */
export class InferenceTerminationUnconfirmedError extends Error {
  constructor(
    message: string,
    readonly diagnostic: InferenceTerminationDiagnostic
  ) {
    super(message)
    this.name = "InferenceTerminationUnconfirmedError"
  }
}

/** A dispatch claim was recovered by a newer worker, fencing off stale side effects. */
export class StaleInferenceClaimError extends Error {
  constructor(message = "Room AI inference claim was superseded by a newer worker") {
    super(message)
    this.name = "StaleInferenceClaimError"
  }
}

export interface RoomAiDispatchClaimContext {
  claimToken: string
  assertCurrentClaim: () => Promise<void>
}

const dispatchClaimStorage = new AsyncLocalStorage<RoomAiDispatchClaimContext>()

export function runWithRoomAiDispatchClaimContext<T>(
  context: RoomAiDispatchClaimContext,
  fn: () => Promise<T>
): Promise<T> {
  return dispatchClaimStorage.run(context, fn)
}

export function getActiveRoomAiDispatchClaimContext(): RoomAiDispatchClaimContext | undefined {
  return dispatchClaimStorage.getStore()
}
