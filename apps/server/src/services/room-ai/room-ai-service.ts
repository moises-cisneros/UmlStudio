import { randomUUID } from "node:crypto"
import type { RoomAiIntent, RoomChatMessage } from "@umlstudio/core"
import { k, type Redis } from "../../redis.js"
import type { AuthProfile } from "../auth-service.js"
import {
  CHAT_MAX_MESSAGES,
  createChatRepository,
  type ChatPage,
  type ChatRepository,
  type ListChatOptions,
} from "./chat-repository.js"

export interface PostRoomMessageInput {
  diagramId: string
  author: AuthProfile
  text: string
  intent: RoomAiIntent
}

export interface PostRoomMessageResult {
  messageId: string
  /** 1-based position among the room's queued messages, including this one. */
  queuePosition: number
}

export interface RoomAiService {
  postMessage(input: PostRoomMessageInput): Promise<PostRoomMessageResult>
  listMessages(diagramId: string, options?: ListChatOptions): Promise<ChatPage<RoomChatMessage>>
}

/** Thrown when the room (diagram) does not exist; routes map it to a 404. */
export class RoomNotFoundError extends Error {
  constructor() {
    super("room not found")
    this.name = "RoomNotFoundError"
  }
}

interface RoomAiServiceDeps {
  redis: Redis
  ttlSeconds: number
  chat?: ChatRepository<RoomChatMessage>
  now?: () => Date
}

export function createRoomAiService(deps: RoomAiServiceDeps): RoomAiService {
  const { redis, ttlSeconds, now = () => new Date() } = deps
  const chat = deps.chat ?? createChatRepository<RoomChatMessage>(redis, ttlSeconds)

  async function assertRoomExists(diagramId: string): Promise<void> {
    if ((await redis.exists(k.diagram(diagramId))) === 0) throw new RoomNotFoundError()
  }

  return {
    async postMessage({ diagramId, author, text, intent }) {
      await assertRoomExists(diagramId)

      const message: RoomChatMessage = {
        id: randomUUID(),
        diagramId,
        author: {
          id: author.id,
          name: author.name,
          ...(author.color ? { color: author.color } : {}),
          kind: "user",
        },
        intent,
        text,
        status: "queued",
        createdAt: now().toISOString(),
      }
      await chat.append(diagramId, message)

      const { messages } = await chat.list(diagramId, { limit: CHAT_MAX_MESSAGES })
      const queuePosition = messages.filter((m) => m.status === "queued").length
      return { messageId: message.id, queuePosition }
    },

    async listMessages(diagramId, options) {
      await assertRoomExists(diagramId)
      return chat.list(diagramId, options)
    },
  }
}
