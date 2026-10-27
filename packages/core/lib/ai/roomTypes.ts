import type { ModelDiff } from "./types"

export type RoomAiIntent = "ask" | "change"

export type RoomChatMessage = {
  id: string
  diagramId: string
  author: { id: string; name: string; color?: string; kind: "user" | "ai" }
  intent?: RoomAiIntent
  text: string
  replyTo?: string
  proposal?: {
    diff: ModelDiff
    status: "pending" | "claimed" | "applied" | "rejected" | "failed" | "stale"
    claimedBy?: string
    baseRev: number
  }
  provider?: string
  status?: "queued" | "answered" | "failed"
  createdAt: string
}

export type RoomAiPolicy = {
  enabled: boolean
  allowChanges: boolean
  applyMode: "confirm" | "auto"
  proactive: boolean
}

export type RoomAiStatus = "thinking" | "idle"

/** Real-time room AI event, broadcast to every socket in the room as `{ kind: "room-ai", event }`. */
export type RoomAiEvent =
  | { type: "message.created"; message: RoomChatMessage }
  | { type: "message.updated"; message: RoomChatMessage }
  | { type: "ai.status"; status: RoomAiStatus; forUserName?: string; queueLength: number }
  | { type: "policy.updated"; policy: RoomAiPolicy }
