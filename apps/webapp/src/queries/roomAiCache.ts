import type { QueryClient } from "@tanstack/react-query"
import type { RoomChatMessage } from "@umlstudio/core"
import type { RoomAiEvent, RoomAiStatus } from "@/types"
import type { RoomAiMessagesPage, RoomAiPolicyView } from "@/services/DiagramApiClient"
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

function removeStreamedReply(
  page: RoomAiMessagesPage | undefined,
  replyTo: string
): RoomAiMessagesPage | undefined {
  if (!page) return page
  const messages = page.messages.filter((message) => message.id !== `stream:${replyTo}`)
  return messages.length === page.messages.length ? page : { ...page, messages }
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
        upsertMessage(
          event.message.author.kind === "ai" && event.message.replyTo
            ? removeStreamedReply(page, event.message.replyTo)
            : event.message.status === "failed"
              ? removeStreamedReply(page, event.message.id)
              : page,
          event.message
        )
      )
      if (event.type === "message.created" && event.message.author.kind === "ai") {
        void queryClient.invalidateQueries({ queryKey: roomAiKeys.memory(diagramId) })
      }
      return
    case "ai.delta":
      queryClient.setQueryData<RoomAiMessagesPage>(roomAiKeys.messages(diagramId), (page) => {
        if (!page) return page
        if (
          page.messages.some(
            (message) => message.id === event.messageId && message.status === "failed"
          )
        ) {
          return page
        }
        if (
          page.messages.some(
            (message) =>
              message.id !== `stream:${event.messageId}` &&
              message.author.kind === "ai" &&
              message.replyTo === event.messageId
          )
        ) {
          return page
        }
        const id = `stream:${event.messageId}`
        const index = page.messages.findIndex((message) => message.id === id)
        if (index === -1) {
          return {
            ...page,
            messages: [
              ...page.messages,
              {
                id,
                diagramId,
                author: { id: "room-ai", name: "Room AI", kind: "ai" },
                intent: "ask",
                text: event.delta,
                replyTo: event.messageId,
                createdAt: new Date().toISOString(),
              },
            ],
          }
        }
        const messages = page.messages.slice()
        messages[index] = { ...messages[index], text: `${messages[index].text}${event.delta}` }
        return { ...page, messages }
      })
      return
    case "memory.updated":
      void queryClient.invalidateQueries({ queryKey: roomAiKeys.memory(diagramId) })
      return
    case "ai.status":
      queryClient.setQueryData<RoomAiStatusState>(roomAiKeys.status(diagramId), {
        status: event.status,
        queueLength: event.queueLength,
        ...(event.forUserName ? { forUserName: event.forUserName } : {}),
      })
      return
    case "policy.updated":
      queryClient.setQueryData<RoomAiPolicyView>(roomAiKeys.policy(diagramId), (current) =>
        current ? { ...event.policy, canConfigure: current.canConfigure } : undefined
      )
      return
    default:
      return
  }
}
