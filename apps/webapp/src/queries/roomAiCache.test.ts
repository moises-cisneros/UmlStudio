import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"
import type { RoomChatMessage } from "@umlstudio/core"
import type { RoomAiMessagesPage } from "@/services/DiagramApiClient"
import { roomAiKeys } from "./keys"
import { applyRoomAiEventToCache, type RoomAiStatusState } from "./roomAiCache"
import { DiagramApiClient } from "@/services/DiagramApiClient"

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

describe("Room AI request privacy boundaries", () => {
  it("sends personal context only to the authenticated private endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ text: "private answer", provider: "self_hosted" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
    try {
      await DiagramApiClient.postPrivateRoomAiMessage("d1", {
        text: "question",
        privateContext: "personal notes",
        replica: { generation: "a".repeat(64), revision: 3 },
      })
      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toContain("/api/rooms/d1/ai/private-messages")
      expect(JSON.parse(String(init?.body))).toEqual({
        text: "question",
        privateContext: "personal notes",
        replica: { generation: "a".repeat(64), revision: 3 },
      })

      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ messageId: "m1", queuePosition: 1 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
      await DiagramApiClient.postRoomAiMessage("d1", {
        text: "shared question",
        intent: "ask",
        replica: { generation: "a".repeat(64), revision: 4 },
      })
      const [, sharedInit] = fetchMock.mock.calls[1]
      expect(String(fetchMock.mock.calls[1][0])).toContain("/api/rooms/d1/ai/messages")
      expect(JSON.parse(String(sharedInit?.body))).toEqual({
        text: "shared question",
        intent: "ask",
        replica: { generation: "a".repeat(64), revision: 4 },
      })
      expect(JSON.stringify(sharedInit?.body)).not.toContain("personal notes")
    } finally {
      fetchMock.mockRestore()
    }
  })

  it("does not put private replies into shared room query cache", async () => {
    const client = setup({ messages: [message("shared")], hasMore: false })
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ text: "personal reply", provider: "self_hosted" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
    try {
      await DiagramApiClient.postPrivateRoomAiMessage("d1", {
        text: "private",
        replica: { generation: "b".repeat(64), revision: 9 },
      })
      expect(page(client)?.messages.map((item) => item.id)).toEqual(["shared"])
      expect(
        client
          .getQueryCache()
          .getAll()
          .map((query) => query.queryKey)
      ).toEqual([roomAiKeys.messages("d1")])
    } finally {
      fetchMock.mockRestore()
      client.clear()
    }
  })
})
