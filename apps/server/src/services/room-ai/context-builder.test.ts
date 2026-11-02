import { describe, expect, it } from "vitest"
import type { RoomChatMessage } from "@umlstudio/core"
import {
  MAX_ROOM_AI_BOARD_DSL_CHARS,
  MAX_ROOM_AI_PUBLIC_MESSAGES,
  MAX_ROOM_AI_THREAD_MESSAGES,
  buildRoomAiContext,
} from "./context-builder.js"

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

  it("budgets board, memory, and message context while retaining referenced UML detail", () => {
    const longText = "x".repeat(600) + " MESSAGE_TAIL_CANARY"
    const messages = Array.from({ length: 8 }, (_, index) => ({
      ...question(`message-${index}`, "user-a", "Ana"),
      text: longText,
      proposal: {
        diff: { add: { elements: [{ name: "PROPOSAL_CANARY" }], relationships: [] } },
        status: "pending" as const,
        baseRev: 1,
      },
    }))
    const context = buildRoomAiContext({
      diagramId: "room-1",
      model: {
        id: "room-1",
        nodes: [
          {
            id: "order",
            type: "class",
            data: {
              name: "Order",
              attributes: [{ name: "number: String" }, { name: "total: Decimal" }],
              methods: [],
            },
          },
          ...Array.from({ length: 80 }, (_, index) => ({
            id: `other-${index}`,
            type: "class",
            data: { name: `Other${index}`, attributes: [{ name: "x: String" }], methods: [] },
          })),
        ],
        edges: [],
      } as Parameters<typeof buildRoomAiContext>[0]["model"],
      requester: { id: "user-a", name: "Ana" },
      intent: "ask",
      route: "shared",
      question: "Explain the Order class",
      memory: {
        summary: "s".repeat(2_000),
        decisions: Array.from({ length: 8 }, () => "d".repeat(500)),
      },
      authorship: {},
      publicMessages: messages,
      threadMessages: messages,
    })

    expect(context.boardDsl.length).toBeLessThanOrEqual(MAX_ROOM_AI_BOARD_DSL_CHARS)
    expect(context.boardDsl).toContain("class Order { number: String; total: Decimal }")
    expect(context.publicMessages).toHaveLength(MAX_ROOM_AI_PUBLIC_MESSAGES)
    expect(context.threadMessages).toHaveLength(MAX_ROOM_AI_THREAD_MESSAGES)
    expect(JSON.stringify(context)).not.toContain("PROPOSAL_CANARY")
    expect(JSON.stringify(context)).not.toContain("MESSAGE_TAIL_CANARY")
  })
})
