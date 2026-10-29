import { randomUUID } from "node:crypto"
import type { RoomAiEvent, RoomChatMessage, UMLModel } from "@umlstudio/core"
import type { Redis } from "../../redis.js"
import { createChatRepository } from "./chat-repository.js"
import type { RoomAiReplicaRequirement } from "./chat-repository.js"
import { buildRoomAiContext, type RoomAiContextInput } from "./context-builder.js"
import {
  ConfirmedInferenceNotStartedError,
  InferenceNotStartedError,
  InferenceTerminationUnconfirmedError,
} from "./inference-not-started.js"
import { logger } from "../../logger.js"

interface OrchestratorDeps {
  redis: Redis
  ttlSeconds: number
  getBoard: (diagramId: string, replica: RoomAiReplicaRequirement) => UMLModel | Promise<UMLModel>
  getMemory: (diagramId: string) => Promise<{ summary: string; decisions: string[] }>
  getAuthorship: (diagramId: string) => Promise<Record<string, string>>
  respond: (request: {
    route: "private" | "shared"
    requester: { id: string; name: string }
    intent: "ask" | "change"
    question: string
    board: UMLModel
    contextJson: string
    privateContext?: string
  }) => Promise<{ text: string; provider: string }>
  publish?: (diagramId: string, event: RoomAiEvent) => void | Promise<void>
  recordPublicMessage?: (diagramId: string, message: string, board: UMLModel) => Promise<void>
}

export interface PrivateRoomAiInput {
  diagramId: string
  author: { id: string; name: string }
  text: string
  privateContext?: string
  board: UMLModel
  onInferenceStart?: () => void
}

export function createRoomAiOrchestrator(deps: OrchestratorDeps) {
  const chat = createChatRepository<RoomChatMessage>(deps.redis, deps.ttlSeconds)
  return {
    async respondPrivately(input: PrivateRoomAiInput): Promise<{ text: string; provider: string }> {
      const requesterName = input.author.name.trim()
      if (!input.author.id.trim() || !requesterName) {
        throw new Error("Room AI requester identity is unavailable")
      }
      const { messages } = await chat.list(input.diagramId, { limit: 200 })
      const requester = { id: input.author.id, name: requesterName }
      const contextInput: RoomAiContextInput = {
        diagramId: input.diagramId,
        model: input.board,
        requester,
        intent: "ask",
        route: "private",
        memory: await deps.getMemory(input.diagramId),
        authorship: await deps.getAuthorship(input.diagramId),
        publicMessages: messages,
        threadMessages: messages,
        ...(input.privateContext !== undefined ? { privateContext: input.privateContext } : {}),
      }
      const { privateContext, ...sharedContext } = buildRoomAiContext(contextInput)
      input.onInferenceStart?.()
      const result = await deps.respond({
        route: "private",
        requester,
        intent: "ask",
        question: input.text,
        board: input.board,
        contextJson: JSON.stringify(sharedContext),
        ...(privateContext !== undefined ? { privateContext } : {}),
      })
      const text = result.text.trim()
      if (!text || !result.provider.trim()) throw new Error("Room AI returned an empty answer")
      return {
        text: text.startsWith(requesterName) ? text : `${requesterName}: ${text}`,
        provider: result.provider,
      }
    },

    async infer(
      diagramId: string,
      messageId: string,
      replicaRequirement: RoomAiReplicaRequirement
    ): Promise<void> {
      const { messages } = await chat.list(diagramId, { limit: 200 })
      const message = messages.find((item) => item.id === messageId)
      if (
        !message ||
        message.author.kind !== "user" ||
        !message.intent ||
        !message.author.name.trim()
      )
        throw new Error("Room AI requester message is unavailable")

      if (!replicaRequirement) {
        throw new InferenceNotStartedError("shared board synchronization metadata is unavailable")
      }
      const board = await deps.getBoard(diagramId, replicaRequirement)
      const input: RoomAiContextInput = {
        diagramId,
        model: board,
        requester: { id: message.author.id, name: message.author.name },
        intent: message.intent,
        route: "shared",
        memory: await deps.getMemory(diagramId),
        authorship: await deps.getAuthorship(diagramId),
        publicMessages: messages.filter((item) => item.id !== messageId),
        threadMessages: messages.filter((item) => item.id !== messageId),
      }
      const sharedContext = buildRoomAiContext(input)
      const contextJson = JSON.stringify(sharedContext)
      const result = await deps
        .respond({
          route: "shared",
          requester: input.requester,
          intent: message.intent,
          question: message.text,
          board,
          contextJson,
        })
        .catch((error: unknown) => {
          if (error instanceof ConfirmedInferenceNotStartedError) throw error
          if (error instanceof InferenceNotStartedError)
            throw new Error("Provider termination is unconfirmed", { cause: error })
          throw error
        })
      const text = result.text.trim()
      if (!text || !result.provider.trim()) throw new Error("Room AI returned an empty answer")
      const name = message.author.name.trim()
      const answerText = text.startsWith(name) ? text : `${name}: ${text}`
      const answer: RoomChatMessage = {
        id: randomUUID(),
        diagramId,
        author: { id: "room-ai", name: "Room AI", kind: "ai" },
        intent: message.intent,
        text: answerText,
        replyTo: message.id,
        provider: result.provider,
        createdAt: new Date().toISOString(),
      }
      if (deps.recordPublicMessage) {
        for (const text of [message.text, answer.text]) {
          try {
            await deps.recordPublicMessage(diagramId, text, board)
          } catch (err) {
            logger.warn({ err, diagramId }, "shared Room AI memory update failed")
            if (err instanceof InferenceTerminationUnconfirmedError) throw err
            break
          }
        }
      }
      await chat.append(diagramId, answer)
      await deps.publish?.(diagramId, { type: "message.created", message: answer })
    },
  }
}
