import { randomUUID } from "node:crypto"
import type { RoomAiEvent, RoomAiIntent, RoomAiPolicy, RoomChatMessage } from "@umlstudio/core"
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
import { createRoomAiPolicyRepository, type RoomAiPolicyRepository } from "./room-ai-policy.js"
import {
  createChatRepository,
  enqueueChatMessage,
  type ChatPage,
  type ChatRepository,
  type ListChatOptions,
  type RoomAiReplicaRequirement,
} from "./chat-repository.js"
import { GLOBAL_LIMIT, GLOBAL_SLOTS } from "./inference-slots.js"

const ROOM_AI_QUEUE_CAPACITY = 5

function isRoomAiDevLoggingEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false
  const raw = (process.env.ROOM_AI_DEV_LOGS ?? "").trim().toLowerCase()
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on"
}

function safeMessageId(messageId: string | undefined): string {
  if (!messageId || messageId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(messageId)) {
    return "unavailable"
  }
  return messageId
}

async function logRoomAiQueueRejected(
  redis: Redis,
  diagramId: string,
  messageId?: string
): Promise<void> {
  if (!isRoomAiDevLoggingEnabled()) return

  let queueDepth = String(ROOM_AI_QUEUE_CAPACITY)
  try {
    if (typeof redis.lLen === "function") {
      const len = await redis.lLen(k.aiQueue(diagramId))
      if (typeof len === "number" && Number.isFinite(len) && len >= 0) {
        queueDepth = String(len > 0 ? len : ROOM_AI_QUEUE_CAPACITY)
      }
    }
  } catch {
    queueDepth = "unavailable"
  }

  let roomActiveLock = "unavailable"
  try {
    if (typeof redis.exists === "function") {
      const exists = await redis.exists(k.aiActive(diagramId))
      roomActiveLock = Number(exists) > 0 ? "present" : "absent"
    }
  } catch {
    roomActiveLock = "unavailable"
  }

  let globalSlotsUsed = "unavailable"
  try {
    if (typeof redis.sCard === "function") {
      const used = await redis.sCard(GLOBAL_SLOTS)
      if (typeof used === "number" && Number.isFinite(used) && used >= 0) {
        globalSlotsUsed = String(used)
      }
    }
  } catch {
    globalSlotsUsed = "unavailable"
  }

  let globalSlotsLimit = "unavailable"
  try {
    if (typeof redis.get === "function") {
      const rawLimit = await redis.get(GLOBAL_LIMIT)
      if (typeof rawLimit === "string" && /^[1-9]\d*$/.test(rawLimit.trim())) {
        globalSlotsLimit = rawLimit.trim()
      }
    }
    if (globalSlotsLimit === "unavailable") {
      const envLimit = (process.env.AI_MAX_CONCURRENCY ?? "").trim()
      if (/^[1-9]\d*$/.test(envLimit)) {
        globalSlotsLimit = envLimit
      } else if (globalSlotsUsed !== "unavailable") {
        globalSlotsLimit = "1"
      }
    }
  } catch {
    globalSlotsLimit = "unavailable"
  }

  try {
    // eslint-disable-next-line no-console -- concise local Room AI diagnostic behind ROOM_AI_DEV_LOGS.
    console.log(
      [
        `\n${"=".repeat(25)} [ROOM AI: QUEUE REJECTED] ${"=".repeat(25)}`,
        "  * Error code: ROOM_AI_QUEUE_FULL",
        `  * Message ID: ${safeMessageId(messageId)}`,
        `  * Queue depth: ${queueDepth} / ${ROOM_AI_QUEUE_CAPACITY}`,
        `  * Room active lock: ${roomActiveLock}`,
        `  * Global inference slots: ${globalSlotsUsed} / ${globalSlotsLimit}`,
        `${"=".repeat(77)}\n`,
      ].join("\n")
    )
  } catch {
    // Best-effort dev diagnostic only.
  }
}

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
  assertRequestAllowed(diagramId: string, intent: RoomAiIntent): Promise<void>
  getPersonalProfileRevision(diagramId: string, userId: string): Promise<string>
  revokePersonalProfile(diagramId: string, userId: string): Promise<string>
  listMessages(diagramId: string, options?: ListChatOptions): Promise<ChatPage<RoomChatMessage>>
  getSharedMemory(diagramId: string): Promise<RoomMemorySnapshot>
  pinSharedDecision(diagramId: string, text: string): Promise<void>
  getPolicy(diagramId: string): Promise<RoomAiPolicy>
  canConfigurePolicy(diagramId: string, userId: string): Promise<boolean>
  updatePolicy(diagramId: string, userId: string, policy: RoomAiPolicy): Promise<RoomAiPolicy>
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

export class RoomAiDisabledError extends Error {
  constructor() {
    super("Room AI is disabled by the room owner")
    this.name = "RoomAiDisabledError"
  }
}

export class RoomAiChangesDisabledError extends Error {
  constructor() {
    super("Room AI change proposals are disabled by the room owner")
    this.name = "RoomAiChangesDisabledError"
  }
}

export class RoomAiPolicyOwnerRequiredError extends Error {
  constructor() {
    super("Only the diagram owner can update Room AI policy")
    this.name = "RoomAiPolicyOwnerRequiredError"
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
    interaction: string,
    messageId: string
  ) => Promise<RoomAiTeachingProfile>
  profileRevisions?: RoomAiPersonalProfileRevisionCoordinator
  policyRepository?: RoomAiPolicyRepository
  now?: () => Date
  /** Broadcasts room AI events to every socket in the room. */
  publish?: (diagramId: string, event: RoomAiEvent) => void
  /** Wakes the dispatcher when enqueue rejects because the room queue is full. */
  onQueueFull?: (diagramId: string) => void
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
  const policyRepository = deps.policyRepository ?? createRoomAiPolicyRepository(redis, ttlSeconds)

  async function assertRoomExists(diagramId: string): Promise<void> {
    if ((await redis.exists(k.diagram(diagramId))) === 0) throw new RoomNotFoundError()
  }

  async function assertRequestAllowed(diagramId: string, intent: RoomAiIntent): Promise<void> {
    await assertRoomExists(diagramId)
    const policy = await policyRepository.get(diagramId)
    if (!policy.enabled) throw new RoomAiDisabledError()
    if (intent === "change" && !policy.allowChanges) throw new RoomAiChangesDisabledError()
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
      await assertRequestAllowed(diagramId, intent)
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
        const queued = await enqueueChatMessage(
          redis,
          diagramId,
          message,
          ttlSeconds,
          requirement,
          {
            requesterId: author.id,
            teachingProfile: sidecarProfile,
            revision: sidecarProfile ? sidecarRevision! : null,
          }
        )
        if (queued.position === 0) {
          void logRoomAiQueueRejected(redis, diagramId, message.id).catch(() => {})
          deps.onQueueFull?.(diagramId)
        }
        return queued
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
            await deps.profileDeriver(teachingProfile, text, message.id)
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

    assertRequestAllowed,

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

    async getPolicy(diagramId) {
      await assertRoomExists(diagramId)
      return policyRepository.get(diagramId)
    },

    async canConfigurePolicy(diagramId, userId) {
      await assertRoomExists(diagramId)
      return (await redis.hGet(k.diagramMeta(diagramId), "userId")) === userId
    },

    async updatePolicy(diagramId, userId, rawPolicy) {
      await assertRoomExists(diagramId)
      const ownerId = await redis.hGet(k.diagramMeta(diagramId), "userId")
      if (!ownerId || ownerId !== userId) throw new RoomAiPolicyOwnerRequiredError()
      const policy = await policyRepository.set(diagramId, rawPolicy)
      publish?.(diagramId, { type: "policy.updated", policy })
      return policy
    },
  }
}
