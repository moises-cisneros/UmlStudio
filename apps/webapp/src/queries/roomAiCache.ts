import type { QueryClient } from "@tanstack/react-query"
import type { RoomChatMessage } from "@umlstudio/core"
import type { RoomAiEvent, RoomAiStatus } from "@/types"
import type { RoomAiMessagesPage } from "@/services/DiagramApiClient"
import { roomAiKeys } from "./keys"

export interface RoomAiStatusState {
  status: RoomAiStatus
  forUserName?: string
  queueLength: number
}

export const IDLE_ROOM_AI_STATUS: RoomAiStatusState = { status: "idle", queueLength: 0 }

function upsertMessage(
  page: RoomAiMessagesPage | undefined,
  message: RoomChatMessage
): RoomAiMessagesPage | undefined {
  // No history loaded yet: the pending fetch will already include this message.
  if (!page) return page
  const index = page.messages.findIndex((m) => m.id === message.id)
  if (index === -1) return { ...page, messages: [...page.messages, message] }
  const messages = page.messages.slice()
  messages[index] = message
  return { ...page, messages }
}

export function applyRoomAiEventToCache(
  queryClient: QueryClient,
  diagramId: string,
  event: RoomAiEvent
): void {
  switch (event.type) {
    case "message.created":
    case "message.updated":
      queryClient.setQueryData<RoomAiMessagesPage>(roomAiKeys.messages(diagramId), (page) =>
        upsertMessage(page, event.message)
      )
      return
    case "ai.status":
      queryClient.setQueryData<RoomAiStatusState>(roomAiKeys.status(diagramId), {
        status: event.status,
        queueLength: event.queueLength,
        ...(event.forUserName ? { forUserName: event.forUserName } : {}),
      })
      return
    default:
      // policy.updated is handled by the policy UI (separate issue).
      return
  }
}
