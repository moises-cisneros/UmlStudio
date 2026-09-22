import { UmlStudioEditor } from "@umlstudio/core"
import { serverWSSUrl } from "@/constants"
import { type ControlEvent, type Envelope, WebSocketMessage } from "@/types"
import { log } from "@/logger"

interface ReconnectionStep {
  interval: number
  duration: number
}

type ControlListener = (event: ControlEvent) => void

export type CollaborationMode = "shared" | "local"

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

  public publishControl(event: ControlEvent): void {
    if (this.websocket?.readyState !== WebSocket.OPEN) return
    const envelope: Envelope = { kind: "control", control: event }
    this.websocket.send(JSON.stringify(envelope))
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
    }

    this.websocket.onmessage = (event) => {
      const raw = String(event.data)
      if (raw.startsWith(ENVELOPE_PREFIX)) {
        try {
          const envelope = JSON.parse(raw) as Envelope
          if (envelope.kind === "control") {
            this.dispatchControl(envelope.control)
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
      this.onError(e)
      this.scheduleReconnect()
    }

    this.websocket.onclose = () => {
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
