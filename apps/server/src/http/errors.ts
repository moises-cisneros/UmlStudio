import type { ApiErrorCode } from "../types.js"

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly meta?: Record<string, unknown>
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export const Errors = {
  invalidParams: (msg = "Invalid request parameters") => new ApiError(422, "INVALID_PARAMS", msg),
  badRequest: (msg = "Invalid request", fields?: Record<string, string>) =>
    new ApiError(400, "INVALID_PARAMS", msg, fields ? { fields } : undefined),
  conflict: (msg = "Registration unavailable") => new ApiError(409, "CONFLICT", msg),
  bodyTooLarge: (msg = "Request body exceeds the configured size limit") =>
    new ApiError(413, "BODY_TOO_LARGE", msg),
  notFound: (msg = "Not found") => new ApiError(404, "NOT_FOUND", msg),
  unauthorized: (msg = "Invalid credentials") => new ApiError(401, "UNAUTHORIZED", msg),
  noHead: (msg = "Diagram does not exist") => new ApiError(404, "NO_HEAD", msg),
  revisionMismatch: (currentHeadRev: number) =>
    new ApiError(409, "REVISION_MISMATCH", "If-Match revision does not match current headRev", {
      currentHeadRev,
    }),
  rendererBusy: (retryAfterSeconds = 2) =>
    new ApiError(503, "RENDERER_BUSY", "Render pipeline is busy", {
      retryAfterSeconds,
    }),
  internal: (msg = "Internal server error") => new ApiError(500, "INTERNAL", msg),
}
