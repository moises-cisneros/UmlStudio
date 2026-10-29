import { describe, expect, it } from "vitest"
import type { RoomChatMessage, UMLModel } from "@umlstudio/core"
import {
  buildRoomAiContext,
  type RoomAiContextInput,
} from "../../src/services/room-ai/context-builder.js"

const message = (id: string, author: string, replyTo?: string): RoomChatMessage => ({
  id,
  diagramId: "room",
  author: { id: author, name: author, kind: author === "ai" ? "ai" : "user" },
  text: id,
  createdAt: `2026-01-01T00:00:${id.padStart(2, "0")}Z`,
  ...(replyTo ? { replyTo } : {}),
})
const input = (): RoomAiContextInput => ({
  diagramId: "room",
  model: { nodes: [], edges: [] } as unknown as UMLModel,
  requester: { id: "alice", name: "Alice" },
  intent: "ask",
  route: "shared",
  memory: { summary: "summary", decisions: ["decision"] },
  authorship: {},
  publicMessages: [],
  threadMessages: [],
})

describe("room AI context", () => {
  it("includes only the requester's attributed elements", () => {
    const value = input()
    value.authorship = { ownClass: "alice", otherClass: "bob" }
    expect(buildRoomAiContext(value).authoredElementIds).toEqual(["ownClass"])
  })
  it("keeps only the requester thread and identifies its author and mode", () => {
    const value = input()
    value.threadMessages = [
      message("1", "alice"),
      message("2", "bob"),
      message("3", "ai", "1"),
      message("4", "ai", "2"),
      message("5", "bob", "1"),
    ]
    const result = buildRoomAiContext(value)
    expect(result.requester).toEqual({ id: "alice", name: "Alice" })
    expect(result.intent).toBe("ask")
    expect(result.threadMessages.map((m) => m.id)).toEqual(["1", "3"])
  })

  it("serializes board state and shared memory", () => {
    const value = input()
    value.model = {
      ...value.model,
      nodes: [{ id: "a", type: "class", data: { name: "Order" }, position: { x: 0, y: 0 } }],
    } as UMLModel
    const result = buildRoomAiContext(value)
    expect(result.boardDsl).toContain("class Order")
    expect(result.memory).toEqual({ summary: "summary", decisions: ["decision"] })
  })

  it("keeps request-specific personal memory outside the serialized shared context", () => {
    const value = {
      ...input(),
      personalMemory: "Alice prefers small examples",
    } as RoomAiContextInput
    const result = buildRoomAiContext(value)
    expect(JSON.stringify(result.publicMessages)).not.toContain("Alice prefers")
    expect(JSON.stringify(result)).not.toContain("personalMemory")
    expect(JSON.stringify(result)).not.toContain("Alice prefers small examples")
  })

  it("takes the last six public messages from this room", () => {
    const value = input()
    value.publicMessages = Array.from({ length: 8 }, (_, i) => message(String(i), "alice"))
    value.publicMessages.push({ ...message("9", "bob"), diagramId: "other" })
    expect(buildRoomAiContext(value).publicMessages.map((m) => m.id)).toEqual([
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
    ])
  })

  it("leaves the full prompt budget to the model-aware AI service", () => {
    const value = input()
    value.model = {
      ...value.model,
      nodes: [{ id: "a", type: "class", data: { name: "A" }, position: { x: 0, y: 0 } }],
    } as UMLModel
    expect(buildRoomAiContext(value).boardDsl).toContain("class A")
  })
})
