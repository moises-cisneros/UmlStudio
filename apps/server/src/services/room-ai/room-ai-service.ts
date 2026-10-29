import { randomUUID } from "node:crypto"
import type { RoomAiEvent, RoomAiIntent, RoomChatMessage } from "@umlstudio/core"
import { k, type Redis } from "../../redis.js"
import type { AuthProfile } from "../auth-service.js"
import type { BoardReplica } from "./board-replica.js"
import type { RoomMemorySnapshot } from "./room-memory-repository.js"
import {
  createRoomAiPersonalProfileRevisionCoordinator,
  RoomAiPersonalProfileStaleError,
  RoomAiTeachingProfileSchema,
  type RoomAiPersonalProfileRevisionCoordinator,
  type RoomAiTeachingProfile,
} from "./room-ai-personal-profile.js"
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
  teachingProfile?: RoomAiTeachingProfile
  profileRevision?: string
}

export interface PostRoomMessageResult {
  messageId: string
  /** 1-based position among the room's queued messages, including this one. */
  queuePosition: number
  /** Returned only to the requester; never included in room broadcasts or history. */
  profileUpdate?: { profile: RoomAiTeachingProfile; revision: string }
  profileLearningFailed?: boolean
}

export interface RoomAiService {
  postMessage(input: PostRoomMessageInput): Promise<PostRoomMessageResult>
  getPersonalProfileRevision(diagramId: string, userId: string): Promise<string>
  revokePersonalProfile(diagramId: string, userId: string): Promise<string>
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
  chat?: ChatRepository<RoomChatMessage>
  memory?: RoomMemoryStore
  profileDeriver?: (
    profile: RoomAiTeachingProfile,
    interaction: string
  ) => Promise<RoomAiTeachingProfile>
  profileRevisions?: RoomAiPersonalProfileRevisionCoordinator
  now?: () => Date
  /** Broadcasts room AI events to every socket in the room. */
  publish?: (diagramId: string, event: RoomAiEvent) => void
  getSharedBoardReplicaAtLeast?: (
    diagramId: string,
    generation: string,
    revision: number
  ) => BoardReplica | undefined
}

export function createRoomAiService(deps: RoomAiServiceDeps): RoomAiService {
  const { redis, ttlSeconds, now = () => new Date(), publish } = deps
  const chat = deps.chat ?? createChatRepository<RoomChatMessage>(redis, ttlSeconds)
  const profileRevisions =
    deps.profileRevisions ?? createRoomAiPersonalProfileRevisionCoordinator(redis, ttlSeconds)

  async function assertRoomExists(diagramId: string): Promise<void> {
    if ((await redis.exists(k.diagram(diagramId))) === 0) throw new RoomNotFoundError()
  }

  return {
    async postMessage({
      diagramId,
      author,
      text,
      intent,
      replica: requirement,
      teachingProfile: rawTeachingProfile,
      profileRevision,
    }) {
      await assertRoomExists(diagramId)
      const teachingProfile =
        rawTeachingProfile === undefined
          ? null
          : RoomAiTeachingProfileSchema.parse(rawTeachingProfile)
      if ((teachingProfile === null) !== (profileRevision === undefined)) {
        throw new RoomAiPersonalProfileStaleError()
      }
      const replica = deps.getSharedBoardReplicaAtLeast?.(
        diagramId,
        requirement.generation,
        requirement.revision
      )
      if (!replica?.isComplete()) throw new SharedBoardSnapshotNotReadyError()
      if (
        teachingProfile &&
        !(await profileRevisions.isCurrentRevision(diagramId, author.id, profileRevision!))
      ) {
        throw new RoomAiPersonalProfileStaleError()
      }

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
      const enqueue = async (
        sidecarProfile: RoomAiTeachingProfile | null = teachingProfile,
        sidecarRevision: string | null = sidecarProfile ? profileRevision! : null
      ) => {
        if (
          sidecarProfile &&
          !(await profileRevisions.isCurrentRevision(diagramId, author.id, sidecarRevision!))
        ) {
          throw new RoomAiPersonalProfileStaleError()
        }
        return enqueueChatMessage(redis, diagramId, message, ttlSeconds, requirement, {
          requesterId: author.id,
          teachingProfile: sidecarProfile,
          revision: sidecarProfile ? sidecarRevision! : null,
        })
      }
      let profileUpdate: PostRoomMessageResult["profileUpdate"]
      let profileLearningFailed = false
      let queuePosition: number
      let active: boolean

      if (!teachingProfile) {
        const queued = await enqueue()
        queuePosition = queued.position
        active = queued.active
      } else {
        let learnedProfile: RoomAiTeachingProfile | null = null
        try {
          if (!deps.profileDeriver) throw new RoomAiMemoryUnavailableError()
          learnedProfile = RoomAiTeachingProfileSchema.parse(
            await deps.profileDeriver(teachingProfile, text)
          )
        } catch {
          // A failed learner must not block the public question or replace the prior profile.
          profileLearningFailed = true
        }

        const changed =
          learnedProfile !== null &&
          (learnedProfile.detailLevel !== teachingProfile.detailLevel ||
            learnedProfile.exampleStyle !== teachingProfile.exampleStyle)

        if (changed) {
          const advanced = await profileRevisions.withAdvancedRevision(
            diagramId,
            author.id,
            profileRevision!,
            async (revision) => {
              const queued = await enqueue(learnedProfile!, revision)
              if (queued.position === 0) throw new RoomQueueFullError()
              return queued
            }
          )
          queuePosition = advanced.value.position
          active = advanced.value.active
          profileUpdate = { profile: learnedProfile!, revision: advanced.revision }
        } else {
          const queued = await profileRevisions.withRoomLock(diagramId, async () => {
            if (
              !(await profileRevisions.isCurrentRevision(diagramId, author.id, profileRevision!))
            ) {
              throw new RoomAiPersonalProfileStaleError()
            }
            return enqueue()
          })
          queuePosition = queued.position
          active = queued.active
          if (queuePosition === 0) throw new RoomQueueFullError()
        }
      }
      if (queuePosition === 0) throw new RoomQueueFullError()
      publish?.(diagramId, { type: "message.created", message })
      publish?.(diagramId, {
        type: "ai.status",
        status: active ? "thinking" : "idle",
        queueLength: queuePosition,
        queuePosition,
      })
      return {
        messageId: message.id,
        queuePosition,
        ...(profileUpdate ? { profileUpdate } : {}),
        ...(profileLearningFailed ? { profileLearningFailed: true } : {}),
      }
    },

    async getPersonalProfileRevision(diagramId, userId) {
      await assertRoomExists(diagramId)
      return profileRevisions.getOrCreateRevision(diagramId, userId)
    },

    async revokePersonalProfile(diagramId, userId) {
      await assertRoomExists(diagramId)
      return profileRevisions.revokeRevision(diagramId, userId)
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
