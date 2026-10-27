import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"
import type { RoomChatMessage } from "@umlstudio/core"
import type { RoomAiMessagesPage } from "@/services/DiagramApiClient"
import { roomAiKeys } from "./keys"
import { applyRoomAiEventToCache, type RoomAiStatusState } from "./roomAiCache"

const message = (id: string, text = id): RoomChatMessage => ({
  id,
  diagramId: "d1",
  author: { id: "u1", name: "Juan", kind: "user" },
  text,
  createdAt: "2026-10-27T10:00:00.000Z",
})

function setup(initial?: RoomAiMessagesPage) {
  const client = new QueryClient()
  if (initial) client.setQueryData(roomAiKeys.messages("d1"), initial)
  return client
}

const page = (client: QueryClient) =>
  client.getQueryData<RoomAiMessagesPage>(roomAiKeys.messages("d1"))

describe("applyRoomAiEventToCache", () => {
  it("appends a created message", () => {
    const client = setup({ messages: [message("a")], hasMore: false })
    applyRoomAiEventToCache(client, "d1", { type: "message.created", message: message("b") })
    expect(page(client)?.messages.map((m) => m.id)).toEqual(["a", "b"])
  })

  it("does not duplicate a message that is already cached", () => {
    const client = setup({ messages: [message("a")], hasMore: false })
    applyRoomAiEventToCache(client, "d1", { type: "message.created", message: message("a") })
    expect(page(client)?.messages).toHaveLength(1)
  })

  it("replaces an updated message in place", () => {
    const client = setup({ messages: [message("a", "old"), message("b")], hasMore: true })
    applyRoomAiEventToCache(client, "d1", {
      type: "message.updated",
      message: message("a", "new"),
    })
    expect(page(client)?.messages.map((m) => m.text)).toEqual(["new", "b"])
    expect(page(client)?.hasMore).toBe(true)
  })

  it("ignores messages while the history has not loaded", () => {
    const client = setup()
    applyRoomAiEventToCache(client, "d1", { type: "message.created", message: message("a") })
    expect(page(client)).toBeUndefined()
  })

  it("stores the AI status", () => {
    const client = setup()
    applyRoomAiEventToCache(client, "d1", {
      type: "ai.status",
      status: "thinking",
      forUserName: "Juan",
      queueLength: 3,
    })
    expect(client.getQueryData<RoomAiStatusState>(roomAiKeys.status("d1"))).toEqual({
      status: "thinking",
      forUserName: "Juan",
      queueLength: 3,
    })
  })
})
