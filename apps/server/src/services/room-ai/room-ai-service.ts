import { randomUUID } from "node:crypto"
import type { RoomAiEvent, RoomAiIntent, RoomChatMessage } from "@umlstudio/core"
import { k, type Redis } from "../../redis.js"
import type { AuthProfile } from "../auth-service.js"
import {
  createChatRepository,
  enqueueChatMessage,
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

export class RoomQueueFullError extends Error {
  constructor() {
    super("room AI queue is full")
    this.name = "RoomQueueFullError"
  }
}

interface RoomAiServiceDeps {
  redis: Redis
  ttlSeconds: number
  chat?: ChatRepository<RoomChatMessage>
  now?: () => Date
  /** Broadcasts room AI events to every socket in the room. */
  publish?: (diagramId: string, event: RoomAiEvent) => void
}

export function createRoomAiService(deps: RoomAiServiceDeps): RoomAiService {
  const { redis, ttlSeconds, now = () => new Date(), publish } = deps
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
      const { position: queuePosition, active } = await enqueueChatMessage(
        redis,
        diagramId,
        message,
        ttlSeconds
      )
      if (queuePosition === 0) throw new RoomQueueFullError()
      publish?.(diagramId, { type: "message.created", message })
      publish?.(diagramId, {
        type: "ai.status",
        status: active ? "thinking" : "idle",
        queueLength: queuePosition,
        queuePosition,
      })
      return { messageId: message.id, queuePosition }
    },

    async listMessages(diagramId, options) {
      await assertRoomExists(diagramId)
      return chat.list(diagramId, options)
    },
  }
}
