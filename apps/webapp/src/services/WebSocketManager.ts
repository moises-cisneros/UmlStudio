import { UmlStudioEditor } from "@umlstudio/core"
import { serverWSSUrl } from "@/constants"
import { type ControlEvent, type Envelope, type RoomAiEvent, WebSocketMessage } from "@/types"
import { log } from "@/logger"

interface ReconnectionStep {
  interval: number
  duration: number
}

type ControlListener = (event: ControlEvent) => void
type RoomAiListener = (event: RoomAiEvent) => void

export type CollaborationMode = "shared" | "local"
export interface SharedReplicaRevision {
  generation: string
  revision: number
}

export interface WebSocketManagerOptions {
  /** Shared rooms require a token; local editing stays tokenless. */
  mode?: CollaborationMode
  /** Reads the current access token (re-read on every reconnect). */
  getToken?: () => string | null
}

const ENVELOPE_PREFIX = '{"kind":'

export class WebSocketManager {
  private websocket: WebSocket | null = null
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  private readonly reconnectSteps: ReconnectionStep[] = [
    { interval: 5000, duration: 60000 },
    { interval: 15000, duration: 4 * 60000 },
    { interval: 30000, duration: 5 * 60000 },
  ]
  private reconnectStartTime = 0
  private controlListeners = new Set<ControlListener>()
  private roomAiListeners = new Set<RoomAiListener>()
  private flushSequence = 0
  private pendingFlush: {
    requestId: string
    nonce?: string
    timer: ReturnType<typeof setTimeout>
    resolve: (revision: SharedReplicaRevision) => void
    reject: (error: Error) => void
  } | null = null

  constructor(
    private diagramId: string,
    private instance: UmlStudioEditor,
    private onError: (e: Event) => void,
    private options: WebSocketManagerOptions = {}
  ) {
    this.instance.sendBroadcastMessage((diagramData) => {
      if (this.websocket?.readyState === WebSocket.OPEN) {
        this.websocket.send(JSON.stringify({ diagramData }))
      }
    })
  }

  public startConnection() {
    this.createWebSocket()
  }

  public onControl(listener: ControlListener): () => void {
    this.controlListeners.add(listener)
    return () => this.controlListeners.delete(listener)
  }

  public onRoomAi(listener: RoomAiListener): () => void {
    this.roomAiListeners.add(listener)
    return () => this.roomAiListeners.delete(listener)
  }

  public publishControl(event: ControlEvent): void {
    if (this.websocket?.readyState !== WebSocket.OPEN) return
    const envelope: Envelope = { kind: "control", control: event }
    this.websocket.send(JSON.stringify(envelope))
  }

  /** Wait until this socket's full board state has reached the single-server replica. */
  public flushSharedReplica(timeoutMs = 10_000): Promise<SharedReplicaRevision> {
    if (this.options.mode !== "shared" || this.websocket?.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Shared collaboration socket is not connected"))
    }
    if (this.pendingFlush) return Promise.reject(new Error("A replica flush is already pending"))
    const requestId = String(++this.flushSequence)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.rejectFlush("Replica flush timed out"), timeoutMs)
      this.pendingFlush = { requestId, timer, resolve, reject }
      try {
        this.websocket!.send(JSON.stringify({ kind: "replica-flush-request", requestId }))
      } catch {
        this.rejectFlush("Replica flush request failed")
      }
    })
  }

  private rejectFlush(message: string): void {
    const pending = this.pendingFlush
    if (!pending) return
    this.pendingFlush = null
    clearTimeout(pending.timer)
    pending.reject(new Error(message))
  }

  private createWebSocket() {
    const mode = this.options.mode ?? "local"
    const params = new URLSearchParams({
      diagramId: this.diagramId,
      mode,
    })
    // the access token is sent on connect and re-read on every
    // reconnect so rotation stays transparent. Never logged.
    const token = this.options.getToken?.()
    if (token) params.set("token", token)
    const url = `${serverWSSUrl}?${params.toString()}`
    this.websocket = new WebSocket(url)

    this.websocket.onopen = () => {
      this.reconnectStartTime = 0
      const initialMessage = {
        diagramData: UmlStudioEditor.generateInitialSyncMessage(),
      }
      this.websocket?.send(JSON.stringify(initialMessage))

      const awarenessMessage = {
        diagramData: UmlStudioEditor.generateInitialAwarenessSyncMessage(),
      }
      this.websocket?.send(JSON.stringify(awarenessMessage))

      this.instance.broadcastFullState()
      this.instance.broadcastAwareness?.()
    }

    this.websocket.onmessage = (event) => {
      const raw = String(event.data)
      if (raw.startsWith(ENVELOPE_PREFIX)) {
        try {
          const envelope = JSON.parse(raw) as Envelope
          const frame = envelope as unknown as Record<string, unknown>
          const pending = this.pendingFlush
          if (frame.kind === "replica-flush-challenge") {
            if (
              pending &&
              frame.requestId === pending.requestId &&
              typeof frame.nonce === "string" &&
              !pending.nonce
            ) {
              pending.nonce = frame.nonce
              try {
                this.instance.broadcastFullState()
                if (this.websocket?.readyState !== WebSocket.OPEN) throw new Error("disconnected")
                this.websocket.send(
                  JSON.stringify({ kind: "replica-flush-marker", nonce: pending.nonce })
                )
              } catch {
                this.rejectFlush("Replica flush failed")
              }
            }
            return
          }
          if (frame.kind === "replica-flush-ack") {
            if (
              pending &&
              pending.nonce &&
              frame.requestId === pending.requestId &&
              frame.nonce === pending.nonce &&
              typeof frame.generation === "string" &&
              /^[a-f0-9]{64}$/.test(frame.generation) &&
              typeof frame.revision === "number" &&
              Number.isSafeInteger(frame.revision) &&
              frame.revision >= 0
            ) {
              this.pendingFlush = null
              clearTimeout(pending.timer)
              pending.resolve({ generation: frame.generation, revision: frame.revision })
            }
            return
          }
          if (envelope.kind === "control") {
            this.dispatchControl(envelope.control)
            return
          }
          if (envelope.kind === "room-ai") {
            this.dispatchRoomAi(envelope.event)
            return
          }
        } catch {
          /* ignore */
        }
      }
      try {
        const msg = JSON.parse(raw) as WebSocketMessage
        if (msg && typeof msg === "object" && "diagramData" in msg) {
          this.instance.receiveBroadcastedMessage(msg.diagramData)
        }
      } catch (err) {
        log.warn("Failed to parse WebSocket message", err)
      }
    }

    this.websocket.onerror = (e) => {
      this.rejectFlush("Collaboration socket error")
      this.onError(e)
      this.scheduleReconnect()
    }

    this.websocket.onclose = () => {
      this.rejectFlush("Collaboration socket disconnected")
      this.scheduleReconnect()
    }
  }

  private dispatchControl(event: ControlEvent) {
    for (const listener of this.controlListeners) {
      try {
        listener(event)
      } catch (err) {
        log.error("Control listener threw", err)
      }
    }
  }

  private dispatchRoomAi(event: RoomAiEvent) {
    for (const listener of this.roomAiListeners) {
      try {
        listener(event)
      } catch (err) {
        log.error("Room AI listener threw", err)
      }
    }
  }

  private scheduleReconnect() {
    if (this.reconnectStartTime === 0) {
      this.reconnectStartTime = Date.now()
    }
    const elapsed = Date.now() - this.reconnectStartTime

    let runningTotal = 0
    let currentStep: ReconnectionStep | undefined
    for (const step of this.reconnectSteps) {
      runningTotal += step.duration
      if (elapsed < runningTotal) {
        currentStep = step
        break
      }
    }
    if (!currentStep) {
      log.warn("WebSocket reconnection attempts stopped.")
      return
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
    }
    this.reconnectTimeout = setTimeout(() => {
      this.createWebSocket()
    }, currentStep.interval)
  }

  public cleanup() {
    this.rejectFlush("Collaboration socket closed")
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
    if (this.websocket) {
      this.websocket.onopen = null
      this.websocket.onmessage = null
      this.websocket.onerror = null
      this.websocket.onclose = null
      this.websocket.close(1000)
    }
    this.websocket = null
  }
}
