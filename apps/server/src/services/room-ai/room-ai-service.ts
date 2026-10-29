import { randomUUID } from "node:crypto"
import type { RoomAiEvent, RoomAiIntent, RoomChatMessage, UMLModel } from "@umlstudio/core"
import { k, type Redis } from "../../redis.js"
import type { AuthProfile } from "../auth-service.js"
import type { BoardReplica } from "./board-replica.js"
import { acquireRoomAiInferenceSlot, releaseRoomAiInferenceSlot } from "./inference-slots.js"
import { InferenceNotStartedError } from "./inference-not-started.js"
import type { RoomMemorySnapshot } from "./room-memory-repository.js"
import {
  createChatRepository,
  enqueueChatMessage,
  type ChatPage,
  type ChatRepository,
  type ListChatOptions,
  type RoomAiReplicaRequirement,
} from "./chat-repository.js"

export interface PostRoomMessageInput {
  diagramId: string
  author: AuthProfile
  text: string
  intent: RoomAiIntent
  replica: RoomAiReplicaRequirement
}

export interface PostRoomMessageResult {
  messageId: string
  /** 1-based position among the room's queued messages, including this one. */
  queuePosition: number
}

export interface PostPrivateRoomMessageInput {
  diagramId: string
  author: AuthProfile
  text: string
  privateContext?: string
  replicaGeneration: string
  replicaRevision: number
}

export interface PrivateRoomMessageResult {
  text: string
  provider: string
}

export interface RoomAiService {
  postMessage(input: PostRoomMessageInput): Promise<PostRoomMessageResult>
  postPrivateMessage(input: PostPrivateRoomMessageInput): Promise<PrivateRoomMessageResult>
  listMessages(diagramId: string, options?: ListChatOptions): Promise<ChatPage<RoomChatMessage>>
  getSharedMemory(diagramId: string): Promise<RoomMemorySnapshot>
  pinSharedDecision(diagramId: string, text: string): Promise<void>
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

export class SharedBoardSnapshotNotReadyError extends Error {
  constructor() {
    super("shared board snapshot is not ready")
    this.name = "SharedBoardSnapshotNotReadyError"
  }
}

export class PrivateRoomAiUnavailableError extends Error {
  constructor() {
    super("private room AI is unavailable")
    this.name = "PrivateRoomAiUnavailableError"
  }
}

export class RoomAiMemoryUnavailableError extends Error {
  constructor() {
    super("shared room memory is unavailable")
    this.name = "RoomAiMemoryUnavailableError"
  }
}

export interface RoomMemoryStore {
  snapshot(diagramId: string): Promise<RoomMemorySnapshot>
  pinDecision(diagramId: string, decision: string): Promise<void>
}

interface RoomAiServiceDeps {
  redis: Redis
  ttlSeconds: number
  maxConcurrency?: number
  chat?: ChatRepository<RoomChatMessage>
  memory?: RoomMemoryStore
  now?: () => Date
  /** Broadcasts room AI events to every socket in the room. */
  publish?: (diagramId: string, event: RoomAiEvent) => void
  getSharedBoardReplicaAtLeast?: (
    diagramId: string,
    generation: string,
    revision: number
  ) => BoardReplica | undefined
  respondPrivately?: (input: {
    diagramId: string
    author: AuthProfile
    text: string
    privateContext?: string
    board: UMLModel
    onInferenceStart?: () => void
  }) => Promise<PrivateRoomMessageResult>
}

export function createRoomAiService(deps: RoomAiServiceDeps): RoomAiService {
  const { redis, ttlSeconds, maxConcurrency = 1, now = () => new Date(), publish } = deps
  const chat = deps.chat ?? createChatRepository<RoomChatMessage>(redis, ttlSeconds)

  async function assertRoomExists(diagramId: string): Promise<void> {
    if ((await redis.exists(k.diagram(diagramId))) === 0) throw new RoomNotFoundError()
  }

  return {
    async postMessage({ diagramId, author, text, intent, replica: requirement }) {
      await assertRoomExists(diagramId)
      const replica = deps.getSharedBoardReplicaAtLeast?.(
        diagramId,
        requirement.generation,
        requirement.revision
      )
      if (!replica?.isComplete()) throw new SharedBoardSnapshotNotReadyError()
      if (!replica.isComplete()) throw new SharedBoardSnapshotNotReadyError()

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
        ttlSeconds,
        requirement
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

    async postPrivateMessage({
      diagramId,
      author,
      text,
      privateContext,
      replicaGeneration,
      replicaRevision,
    }) {
      await assertRoomExists(diagramId)
      const replica = deps.getSharedBoardReplicaAtLeast?.(
        diagramId,
        replicaGeneration,
        replicaRevision
      )
      if (!replica?.isComplete()) throw new SharedBoardSnapshotNotReadyError()
      if (!deps.respondPrivately) throw new PrivateRoomAiUnavailableError()
      const board = replica.getModel()
      if (!replica.isComplete()) throw new SharedBoardSnapshotNotReadyError()
      const slot = await acquireRoomAiInferenceSlot(redis, maxConcurrency)
      let inferenceStarted = false
      try {
        const result = await deps.respondPrivately({
          diagramId,
          author,
          text,
          ...(privateContext !== undefined ? { privateContext } : {}),
          board,
          onInferenceStart: () => {
            inferenceStarted = true
          },
        })
        await releaseRoomAiInferenceSlot(redis, slot)
        return result
      } catch (error) {
        if (!inferenceStarted || error instanceof InferenceNotStartedError) {
          await releaseRoomAiInferenceSlot(redis, slot)
        }
        throw error
      }
    },

    async listMessages(diagramId, options) {
      await assertRoomExists(diagramId)
      return chat.list(diagramId, options)
    },

    async getSharedMemory(diagramId) {
      await assertRoomExists(diagramId)
      if (!deps.memory) throw new RoomAiMemoryUnavailableError()
      return deps.memory.snapshot(diagramId)
    },

    async pinSharedDecision(diagramId, text) {
      await assertRoomExists(diagramId)
      if (!deps.memory) throw new RoomAiMemoryUnavailableError()
      await deps.memory.pinDecision(diagramId, text)
      publish?.(diagramId, { type: "memory.updated" })
    },
  }
}
