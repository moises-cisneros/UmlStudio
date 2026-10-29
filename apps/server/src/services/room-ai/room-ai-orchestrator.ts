import { randomUUID } from "node:crypto"
import type { RoomAiEvent, RoomChatMessage, UMLModel } from "@umlstudio/core"
import type { Redis } from "../../redis.js"
import { consumeRoomAiPersonalProfile, createChatRepository } from "./chat-repository.js"
import type { RoomAiReplicaRequirement } from "./chat-repository.js"
import { buildRoomAiContext, type RoomAiContextInput } from "./context-builder.js"
import {
  ConfirmedInferenceNotStartedError,
  InferenceNotStartedError,
  InferenceTerminationUnconfirmedError,
} from "./inference-not-started.js"
import { logger } from "../../logger.js"
import type {
  RoomAiPersonalProfileRevisionCoordinator,
  RoomAiTeachingProfile,
} from "./room-ai-personal-profile.js"

interface OrchestratorDeps {
  redis: Redis
  ttlSeconds: number
  getBoard: (diagramId: string, replica: RoomAiReplicaRequirement) => UMLModel | Promise<UMLModel>
  getMemory: (diagramId: string) => Promise<{ summary: string; decisions: string[] }>
  getAuthorship: (diagramId: string) => Promise<Record<string, string>>
  profileRevisions: RoomAiPersonalProfileRevisionCoordinator
  respond: (request: {
    route: "shared"
    requester: { id: string; name: string }
    intent: "ask" | "change"
    question: string
    board: UMLModel
    contextJson: string
    teachingProfile?: RoomAiTeachingProfile
  }) => Promise<{ text: string; provider: string }>
  publish?: (diagramId: string, event: RoomAiEvent) => void | Promise<void>
  recordPublicMessage?: (diagramId: string, message: string, board: UMLModel) => Promise<void>
}

export function createRoomAiOrchestrator(deps: OrchestratorDeps) {
  const chat = createChatRepository<RoomChatMessage>(deps.redis, deps.ttlSeconds)
  return {
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
      const intent = message.intent

      const personalProfile = await consumeRoomAiPersonalProfile(
        deps.redis,
        diagramId,
        messageId,
        message.author.id
      )
      if (
        personalProfile.teachingProfile &&
        !(await deps.profileRevisions.isCurrentRevision(
          diagramId,
          message.author.id,
          personalProfile.revision!
        ))
      ) {
        throw new InferenceNotStartedError("Room AI teaching profile has been revoked")
      }

      if (!replicaRequirement) {
        throw new InferenceNotStartedError("shared board synchronization metadata is unavailable")
      }
      const board = await deps.getBoard(diagramId, replicaRequirement)
      const input: RoomAiContextInput = {
        diagramId,
        model: board,
        requester: { id: message.author.id, name: message.author.name },
        intent,
        route: "shared",
        memory: await deps.getMemory(diagramId),
        authorship: await deps.getAuthorship(diagramId),
        publicMessages: messages.filter((item) => item.id !== messageId),
        threadMessages: messages.filter((item) => item.id !== messageId),
      }
      const sharedContext = buildRoomAiContext(input)
      const contextJson = JSON.stringify(sharedContext)
      const inference = await deps.profileRevisions.withRoomLock(diagramId, async () => {
        if (
          personalProfile.teachingProfile &&
          !(await deps.profileRevisions.isCurrentRevision(
            diagramId,
            message.author.id,
            personalProfile.revision!
          ))
        ) {
          throw new InferenceNotStartedError("Room AI teaching profile has been revoked")
        }

        return {
          completion: deps
            .respond({
              route: "shared",
              requester: input.requester,
              intent,
              question: message.text,
              board,
              contextJson,
              ...(personalProfile.teachingProfile
                ? { teachingProfile: personalProfile.teachingProfile }
                : {}),
            })
            .catch((error: unknown) => {
              if (error instanceof ConfirmedInferenceNotStartedError) throw error
              if (error instanceof InferenceNotStartedError)
                throw new Error("Provider termination is unconfirmed", { cause: error })
              throw error
            }),
        }
      })
      const result = await inference.completion
      const text = result.text.trim()
      if (!text || !result.provider.trim()) throw new Error("Room AI returned an empty answer")
      const name = message.author.name.trim()
      const answerText = text.startsWith(name) ? text : `${name}: ${text}`
      const answer: RoomChatMessage = {
        id: randomUUID(),
        diagramId,
        author: { id: "room-ai", name: "Room AI", kind: "ai" },
        intent,
        text: answerText,
        replyTo: message.id,
        provider: result.provider,
        createdAt: new Date().toISOString(),
      }
      await deps.profileRevisions.withRoomLock(diagramId, async () => {
        if (
          personalProfile.teachingProfile &&
          !(await deps.profileRevisions.isCurrentRevision(
            diagramId,
            message.author.id,
            personalProfile.revision!
          ))
        ) {
          throw new InferenceNotStartedError("Room AI teaching profile has been revoked")
        }
        if (deps.recordPublicMessage) {
          for (const publicText of [message.text, answer.text]) {
            try {
              await deps.recordPublicMessage(diagramId, publicText, board)
            } catch (err) {
              logger.warn({ err, diagramId }, "shared Room AI memory update failed")
              if (err instanceof InferenceTerminationUnconfirmedError) throw err
              break
            }
          }
        }
        await chat.append(diagramId, answer)
        await deps.publish?.(diagramId, { type: "message.created", message: answer })
      })
    },
  }
}
