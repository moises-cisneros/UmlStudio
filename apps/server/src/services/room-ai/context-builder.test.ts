import { describe, expect, it } from "vitest"
import type { RoomChatMessage } from "@umlstudio/core"
import { buildRoomAiContext } from "./context-builder.js"

const question = (id: string, requesterId: string, name: string): RoomChatMessage => ({
  id,
  diagramId: "room-1",
  author: { id: requesterId, name, kind: "user" },
  intent: "ask",
  text: "Question from " + name,
  status: "answered",
  createdAt: "2026-10-29T00:00:00.000Z",
})

describe("Room AI requester context", () => {
  it("keeps personal memory out of the shared conversation context", () => {
    const messages = [question("a", "user-a", "Ana"), question("b", "user-b", "Ben")]
    const context = buildRoomAiContext({
      diagramId: "room-1",
      model: { id: "room-1", nodes: [], edges: [] },
      requester: { id: "user-a", name: "Ana" },
      intent: "ask",
      route: "shared",
      memory: { summary: "Shared diagram summary", decisions: ["Use inheritance"] },
      authorship: {},
      publicMessages: messages,
      threadMessages: messages,
      personalMemory: "Ana prefers small examples",
    } as Parameters<typeof buildRoomAiContext>[0])

    expect(context.memory.summary).toBe("Shared diagram summary")
    expect(context.threadMessages.map((message) => message.author.id)).toEqual(["user-a"])
    expect(JSON.stringify(context)).not.toContain("Ana prefers small examples")
    expect(JSON.stringify(context)).not.toContain("Ben prefers")
    expect(context).not.toHaveProperty("privateContext")
    expect(context).not.toHaveProperty("personalMemory")
  })
})
