import { boardToDsl, type RoomAiIntent, type RoomChatMessage, type UMLModel } from "@umlstudio/core"

export const MAX_ROOM_AI_BOARD_DSL_CHARS = 4_000
export const MAX_ROOM_AI_MEMORY_SUMMARY_CHARS = 1_000
export const MAX_ROOM_AI_DECISIONS = 4
export const MAX_ROOM_AI_DECISION_CHARS = 300
export const MAX_ROOM_AI_PUBLIC_MESSAGES = 3
export const MAX_ROOM_AI_THREAD_MESSAGES = 4
export const MAX_ROOM_AI_MESSAGE_CHARS = 500
const TRUNCATION_MARKER = " ... [truncated]"

export interface RoomAiContextInput {
  diagramId: string
  model: UMLModel
  requester: { id: string; name: string }
  intent: RoomAiIntent
  route: "shared"
  question?: string
  memory: { summary: string; decisions: string[] }
  /** Element id -> authenticated user id, as recorded by the room relay. */
  authorship: Record<string, string>
  /** Messages in chronological order. */
  publicMessages: RoomChatMessage[]
  /** Messages in chronological order; AI replies must reference a preceding requester thread message. */
  threadMessages: RoomChatMessage[]
}

export interface RoomAiContextSnapshot {
  requester: { id: string; name: string }
  intent: RoomAiIntent
  boardDsl: string
  memory: { summary: string; decisions: string[] }
  authoredElementIds: string[]
  publicMessages: RoomChatMessage[]
  threadMessages: RoomChatMessage[]
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  return value.slice(0, Math.max(0, maxChars - TRUNCATION_MARKER.length)) + TRUNCATION_MARKER
}

function projectMessage(message: RoomChatMessage): RoomChatMessage {
  return {
    id: message.id,
    diagramId: message.diagramId,
    author: {
      id: message.author.id,
      name: message.author.name,
      kind: message.author.kind,
    },
    ...(message.intent ? { intent: message.intent } : {}),
    text: truncateText(message.text, MAX_ROOM_AI_MESSAGE_CHARS),
    ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    ...(message.provider ? { provider: message.provider } : {}),
    ...(message.status ? { status: message.status } : {}),
    createdAt: message.createdAt,
  }
}

function mentionedClassNames(model: UMLModel, question: string | undefined): string[] {
  if (!question?.trim()) return []
  const normalizedQuestion = question.toLocaleLowerCase()
  return (model.nodes ?? [])
    .filter((node) => node.type === "class")
    .map((node) => ({ name: String(node.data?.name ?? "").trim() }))
    .filter(({ name }) => name && normalizedQuestion.includes(name.toLocaleLowerCase()))
    .map(({ name }) => name)
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
    boardDsl: boardToDsl(input.model, {
      maxChars: MAX_ROOM_AI_BOARD_DSL_CHARS,
      mentionedNames: mentionedClassNames(input.model, input.question),
    }),
    memory: {
      summary: truncateText(input.memory.summary, MAX_ROOM_AI_MEMORY_SUMMARY_CHARS),
      decisions: input.memory.decisions
        .slice(-MAX_ROOM_AI_DECISIONS)
        .map((decision) => truncateText(decision, MAX_ROOM_AI_DECISION_CHARS)),
    },
    authoredElementIds: Object.entries(input.authorship)
      .filter(([, userId]) => userId === input.requester.id)
      .map(([elementId]) => elementId),
    publicMessages: input.publicMessages
      .filter((message) => message.diagramId === input.diagramId)
      .slice(-MAX_ROOM_AI_PUBLIC_MESSAGES)
      .map(projectMessage),
    threadMessages: threadMessages.slice(-MAX_ROOM_AI_THREAD_MESSAGES).map(projectMessage),
  }
  return snapshot
}
