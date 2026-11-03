import { randomUUID } from "node:crypto"
import type { ModelDiff, RoomAiEvent, RoomChatMessage, UMLModel } from "@umlstudio/core"
import type { Redis } from "../../redis.js"
import { consumeRoomAiPersonalProfile, createChatRepository } from "./chat-repository.js"
import type { RoomAiReplicaRequirement } from "./chat-repository.js"
import { buildRoomAiContext, type RoomAiContextInput } from "./context-builder.js"
import {
  ConfirmedInferenceNotStartedError,
  getActiveRoomAiDispatchClaimContext,
  InferenceNotStartedError,
  InferenceTerminationUnconfirmedError,
  StaleInferenceClaimError,
  type RoomAiDispatchClaimContext,
} from "./inference-not-started.js"
import { logger } from "../../logger.js"
import {
  createRoomAiPersonalProfileRevisionCoordinator,
  type RoomAiPersonalProfileRevisionCoordinator,
  type RoomAiTeachingProfile,
} from "./room-ai-personal-profile.js"
import type { RoomAiServiceResponse } from "./room-ai-responder.js"

export type { RoomAiDispatchClaimContext } from "./inference-not-started.js"

interface OrchestratorDeps {
  redis: Redis
  ttlSeconds: number
  getBoard: (diagramId: string, replica: RoomAiReplicaRequirement) => UMLModel | Promise<UMLModel>
  getMemory: (diagramId: string) => Promise<{ summary: string; decisions: string[] }>
  getAuthorship: (diagramId: string) => Promise<Record<string, string>>
  profileRevisions?: RoomAiPersonalProfileRevisionCoordinator
  respond: (request: {
    messageId: string
    route: "shared"
    requester: { id: string; name: string }
    intent: "ask" | "change"
    question: string
    board: UMLModel
    contextJson: string
    teachingProfile?: RoomAiTeachingProfile
  }) => Promise<RoomAiServiceResponse>
  publish?: (diagramId: string, event: RoomAiEvent) => void | Promise<void>
  recordPublicMessage?: (diagramId: string, message: string, board: UMLModel) => Promise<void>
}

export function createRoomAiOrchestrator(deps: OrchestratorDeps) {
  const chat = createChatRepository<RoomChatMessage>(deps.redis, deps.ttlSeconds)
  const profileRevisions =
    deps.profileRevisions ??
    createRoomAiPersonalProfileRevisionCoordinator(deps.redis, deps.ttlSeconds)
  return {
    async infer(
      diagramId: string,
      messageId: string,
      replicaRequirement: RoomAiReplicaRequirement,
      claimContext?: RoomAiDispatchClaimContext
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
      const activeClaimContext = claimContext ?? getActiveRoomAiDispatchClaimContext()
      await activeClaimContext?.assertCurrentClaim()

      const personalProfile = await consumeRoomAiPersonalProfile(
        deps.redis,
        diagramId,
        messageId,
        message.author.id,
        activeClaimContext ? { consume: false } : undefined
      )
      if (
        personalProfile.teachingProfile &&
        !(await profileRevisions.isCurrentRevision(
          diagramId,
          message.author.id,
          personalProfile.revision!
        ))
      ) {
        throw new InferenceNotStartedError("Room AI teaching profile has been revoked", {
          stage: "orchestrator_profile_revision_pre_board",
          reasonCode: "teaching_profile_revoked",
        })
      }

      if (!replicaRequirement) {
        throw new InferenceNotStartedError("shared board synchronization metadata is unavailable", {
          stage: "orchestrator_replica_requirement",
          reasonCode: "replica_requirement_unavailable",
        })
      }
      const board = await deps.getBoard(diagramId, replicaRequirement)
      const input: RoomAiContextInput = {
        diagramId,
        model: board,
        requester: { id: message.author.id, name: message.author.name },
        intent,
        route: "shared",
        question: message.text,
        memory: await deps.getMemory(diagramId),
        authorship: await deps.getAuthorship(diagramId),
        publicMessages: messages.filter((item) => item.id !== messageId),
        threadMessages: messages.filter((item) => item.id !== messageId),
      }
      const sharedContext = buildRoomAiContext(input)
      const contextJson = JSON.stringify(sharedContext)
      const inference = await profileRevisions.withRoomLock(diagramId, async () => {
        await activeClaimContext?.assertCurrentClaim()
        if (
          personalProfile.teachingProfile &&
          !(await profileRevisions.isCurrentRevision(
            diagramId,
            message.author.id,
            personalProfile.revision!
          ))
        ) {
          throw new InferenceNotStartedError("Room AI teaching profile has been revoked", {
            stage: "orchestrator_profile_revision_pre_inference",
            reasonCode: "teaching_profile_revoked",
          })
        }

        logger.info(
          {
            event: "room_ai.inference.request_starting",
            diagramId,
            messageId,
            intent,
            route: "shared",
            hasTeachingProfile: Boolean(personalProfile.teachingProfile),
          },
          "starting downstream Room AI inference request"
        )
        return {
          completion: deps
            .respond({
              messageId,
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
              if (error instanceof InferenceNotStartedError) {
                logger.error(
                  {
                    event: "room_ai.inference.unconfirmed_pre_inference_error",
                    diagramId,
                    messageId,
                    stage: error.stage,
                    reasonCode: error.reasonCode,
                    errorName: error.name,
                  },
                  "Room AI responder threw unconfirmed InferenceNotStartedError"
                )
                throw new Error("Provider termination is unconfirmed", { cause: error })
              }
              throw error
            }),
        }
      })
      const result = await inference.completion
      logger.info(
        {
          event: "room_ai.inference.response_received",
          diagramId,
          messageId,
          provider: result.provider,
        },
        "received downstream Room AI inference response"
      )
      const text = result.text.trim()
      if (!text || !result.provider.trim()) throw new Error("Room AI returned an empty answer")
      const answer: RoomChatMessage = {
        id: randomUUID(),
        diagramId,
        author: { id: "room-ai", name: "Room AI", kind: "ai" },
        intent,
        text,
        replyTo: message.id,
        provider: result.provider,
        ...(intent === "change" && result.diff
          ? {
              proposal: {
                diff: result.diff as ModelDiff,
                status: "pending" as const,
                baseRev: replicaRequirement.revision,
                baseGeneration: replicaRequirement.generation,
              },
            }
          : {}),
        createdAt: new Date().toISOString(),
      }
      await profileRevisions.withRoomLock(diagramId, async () => {
        await activeClaimContext?.assertCurrentClaim()
        if (
          personalProfile.teachingProfile &&
          !(await profileRevisions.isCurrentRevision(
            diagramId,
            message.author.id,
            personalProfile.revision!
          ))
        ) {
          throw new InferenceNotStartedError("Room AI teaching profile has been revoked", {
            stage: "orchestrator_profile_revision_before_commit",
            reasonCode: "teaching_profile_revoked",
          })
        }
        await activeClaimContext?.assertCurrentClaim()
        const committed = await chat.commitAnswer(diagramId, message, answer)
        if (!committed) throw new StaleInferenceClaimError()
        if (deps.recordPublicMessage) {
          for (const publicText of [message.text, answer.text]) {
            await activeClaimContext?.assertCurrentClaim()
            try {
              await deps.recordPublicMessage(diagramId, publicText, board)
            } catch (err) {
              if (err instanceof StaleInferenceClaimError) throw err
              logger.warn({ err, diagramId }, "shared Room AI memory update failed")
              if (err instanceof InferenceTerminationUnconfirmedError) throw err
              break
            }
          }
        }
        await activeClaimContext?.assertCurrentClaim()
        await deps.publish?.(diagramId, { type: "message.created", message: answer })
      })
    },
  }
}
