import { boardToDsl, type RoomAiIntent, type RoomChatMessage, type UMLModel } from "@umlstudio/core"

export interface RoomAiContextInput {
  diagramId: string
  model: UMLModel
  requester: { id: string; name: string }
  intent: RoomAiIntent
  route: "shared" | "private"
  memory: { summary: string; decisions: string[] }
  /** Element id -> authenticated user id, as recorded by the room relay. */
  authorship: Record<string, string>
  /** Messages in chronological order. */
  publicMessages: RoomChatMessage[]
  /** Messages in chronological order; AI replies must reference a preceding requester thread message. */
  threadMessages: RoomChatMessage[]
  privateContext?: string
}

export interface RoomAiContextSnapshot {
  requester: { id: string; name: string }
  intent: RoomAiIntent
  boardDsl: string
  memory: { summary: string; decisions: string[] }
  authoredElementIds: string[]
  publicMessages: RoomChatMessage[]
  threadMessages: RoomChatMessage[]
  privateContext?: string
}

/** Prompt size is enforced by ai-service after assembling the final model prompt. */
export function buildRoomAiContext(input: RoomAiContextInput): RoomAiContextSnapshot {
  const threadIds = new Set<string>()
  const threadMessages = input.threadMessages.filter((message) => {
    if (message.diagramId !== input.diagramId) return false
    const isRequester = message.author.kind === "user" && message.author.id === input.requester.id
    const isReply =
      message.author.kind === "ai" && message.replyTo && threadIds.has(message.replyTo)
    if (!isRequester && !isReply) return false
    threadIds.add(message.id)
    return true
  })
  const snapshot: RoomAiContextSnapshot = {
    requester: { ...input.requester },
    intent: input.intent,
    // Avoid the DSL's character-based truncation; ai-service counts the final prompt.
    boardDsl: boardToDsl(input.model, { maxChars: Number.MAX_SAFE_INTEGER }),
    memory: { summary: input.memory.summary, decisions: [...input.memory.decisions] },
    authoredElementIds: Object.entries(input.authorship)
      .filter(([, userId]) => userId === input.requester.id)
      .map(([elementId]) => elementId),
    publicMessages: input.publicMessages
      .filter((message) => message.diagramId === input.diagramId)
      .slice(-6),
    threadMessages,
    ...(input.route === "private" && input.privateContext !== undefined
      ? { privateContext: input.privateContext }
      : {}),
  }
  return snapshot
}
