/** A rejection raised before any provider request is started. */
export class InferenceNotStartedError extends Error {}

/** A trusted local or HTTP response that confirms inference never started. */
export class ConfirmedInferenceNotStartedError extends InferenceNotStartedError {
  constructor(message: string) {
    super(message)
    this.name = "ConfirmedInferenceNotStartedError"
  }
}

/** The provider request began, but its termination cannot be confirmed. */
export class InferenceTerminationUnconfirmedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InferenceTerminationUnconfirmedError"
  }
}
