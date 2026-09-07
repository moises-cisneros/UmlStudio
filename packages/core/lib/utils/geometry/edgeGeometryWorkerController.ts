import {
  EDGE_GEOMETRY_WORKER_PROTOCOL_VERSION,
  type EdgeGeometrySolveRequest,
  type EdgeGeometrySolveResult,
  type EdgeGeometryWorkerResponse,
  type SerializedEdgeSolveCache,
  type SerializedSolverInput,
} from "@/utils/geometry/edgeGeometryWorkerProtocol"

export type EdgeGeometryWorkerPort = {
  postMessage: (request: EdgeGeometrySolveRequest) => void
  terminate: () => void
}

type ControllerOptions = {
  sessionId: string
  worker: EdgeGeometryWorkerPort
  onResult: (result: EdgeGeometrySolveResult) => void
  onProvisionalResult?: (result: EdgeGeometrySolveResult) => void
  onFailure: (message: string) => void
  onIdle?: () => void
  onResponse?: (response: EdgeGeometryWorkerResponse) => void
}

let sessionCounter = 0

export const createEdgeGeometryWorkerSessionId = (): string =>
  `edge-geometry-${++sessionCounter}`

export const shouldUseEdgeGeometryWorker = ({
  hasRunInitialSolve,
  edgeCount,
  threshold,
  disabled,
}: {
  hasRunInitialSolve: boolean
  edgeCount: number
  threshold: number
  disabled: boolean
}): boolean => hasRunInitialSolve && edgeCount >= threshold && !disabled

export const EDGE_GEOMETRY_WORKER_EDGE_THRESHOLD = 32
export const EDGE_GEOMETRY_WORKER_DEFAULT_CADENCE_MS = 80
export const EDGE_GEOMETRY_WORKER_MIN_CADENCE_MS = 40
export const EDGE_GEOMETRY_WORKER_MAX_CADENCE_MS = 160

export const getEdgeGeometryWorkerCadence = (
  roundTripMs: number | null
): number => {
  const observedMs =
    roundTripMs !== null && Number.isFinite(roundTripMs) && roundTripMs >= 0
      ? roundTripMs * 1.25
      : EDGE_GEOMETRY_WORKER_DEFAULT_CADENCE_MS
  return Math.round(
    Math.min(
      EDGE_GEOMETRY_WORKER_MAX_CADENCE_MS,
      Math.max(EDGE_GEOMETRY_WORKER_MIN_CADENCE_MS, observedMs)
    )
  )
}

export const updateEdgeGeometryWorkerRoundTrip = (
  previousMs: number | null,
  sampleMs: number
): number => {
  const baselineMs =
    previousMs !== null && Number.isFinite(previousMs) && previousMs >= 0
      ? previousMs
      : EDGE_GEOMETRY_WORKER_DEFAULT_CADENCE_MS / 1.25
  if (!Number.isFinite(sampleMs) || sampleMs < 0) return baselineMs
  const boundedSampleMs = Math.min(
    baselineMs + 64,
    Math.max(Math.max(0, baselineMs - 64), sampleMs)
  )
  return baselineMs * 0.75 + boundedSampleMs * 0.25
}

export const shouldSampleEdgeGeometryWorker = ({
  edgeCount,
  interacting,
}: {
  edgeCount: number
  interacting: boolean
}): boolean => interacting && edgeCount >= EDGE_GEOMETRY_WORKER_EDGE_THRESHOLD

export class EdgeGeometryWorkerController {
  readonly sessionId: string

  private readonly worker: EdgeGeometryWorkerPort
  private readonly onResult: ControllerOptions["onResult"]
  private readonly onProvisionalResult: ControllerOptions["onProvisionalResult"]
  private readonly onFailure: ControllerOptions["onFailure"]
  private readonly onIdle: ControllerOptions["onIdle"]
  private readonly onResponse: ControllerOptions["onResponse"]
  private latestRevision = 0
  private hardInvalidatedThrough = 0
  private inFlightRevision: number | null = null
  private hasSubmitted = false
  private disposed = false

  constructor({
    sessionId,
    worker,
    onResult,
    onProvisionalResult,
    onFailure,
    onIdle,
    onResponse,
  }: ControllerOptions) {
    this.sessionId = sessionId
    this.worker = worker
    this.onResult = onResult
    this.onProvisionalResult = onProvisionalResult
    this.onFailure = onFailure
    this.onIdle = onIdle
    this.onResponse = onResponse
  }

  isIdle(): boolean {
    return !this.disposed && this.inFlightRevision === null
  }

  submit(
    input: SerializedSolverInput,
    initialCache?: SerializedEdgeSolveCache
  ): number | null {
    if (!this.isIdle()) return null
    const isFirstRequest = !this.hasSubmitted
    this.hasSubmitted = true
    const request: EdgeGeometrySolveRequest = {
      protocol: EDGE_GEOMETRY_WORKER_PROTOCOL_VERSION,
      sessionId: this.sessionId,
      revision: ++this.latestRevision,
      kind: "solve",
      input,
      initialCache: isFirstRequest ? initialCache : undefined,
    }
    this.post(request)
    return request.revision
  }

  invalidate(): number {
    if (this.disposed) return this.latestRevision
    const revision = ++this.latestRevision
    this.hardInvalidatedThrough = revision
    return revision
  }

  supersede(): number {
    if (this.disposed) return this.latestRevision
    return ++this.latestRevision
  }

  receive(response: EdgeGeometryWorkerResponse): void {
    if (
      this.disposed ||
      response.protocol !== EDGE_GEOMETRY_WORKER_PROTOCOL_VERSION ||
      response.sessionId !== this.sessionId ||
      response.revision !== this.inFlightRevision
    )
      return

    this.inFlightRevision = null
    this.onResponse?.(response)
    if (response.kind === "result") {
      if (response.revision === this.latestRevision) this.onResult(response)
      else if (response.revision > this.hardInvalidatedThrough)
        this.onProvisionalResult?.(response)
    } else if (response.revision === this.latestRevision) {
      this.onFailure(response.message)
      return
    }

    if (this.isIdle()) this.onIdle?.()
  }

  fail(message: string): void {
    if (this.disposed) return
    this.inFlightRevision = null
    this.onFailure(message)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.inFlightRevision = null
    this.worker.terminate()
  }

  private post(request: EdgeGeometrySolveRequest): void {
    try {
      this.worker.postMessage(request)
      this.inFlightRevision = request.revision
    } catch (error) {
      this.inFlightRevision = null
      this.onFailure(
        error &&
          typeof error === "object" &&
          "message" in error &&
          typeof error.message === "string"
          ? error.message
          : "Failed to post geometry solve"
      )
    }
  }
}
