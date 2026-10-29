import { randomUUID } from "node:crypto"
import { z } from "zod"
import { k, type Redis } from "../../redis.js"

export const RoomAiTeachingProfileSchema = z
  .object({
    detailLevel: z.enum(["concise", "balanced", "step_by_step"]),
    exampleStyle: z.enum(["uml", "code", "analogy", "none"]),
  })
  .strict()

export type RoomAiTeachingProfile = z.infer<typeof RoomAiTeachingProfileSchema>

export interface RoomAiPersonalProfileSidecar {
  requesterId: string
  teachingProfile: RoomAiTeachingProfile | null
  revision: string | null
}

export const RoomAiPersonalProfileSidecarSchema = z
  .object({
    requesterId: z.string().min(1),
    teachingProfile: RoomAiTeachingProfileSchema.nullable(),
    revision: z.string().uuid().nullable(),
  })
  .strict()
  .refine((value) => (value.teachingProfile === null) === (value.revision === null))

export class RoomAiPersonalProfileStaleError extends Error {
  constructor() {
    super("The approved Room teaching profile has changed; review it before sending again")
    this.name = "RoomAiPersonalProfileStaleError"
  }
}

/**
 * Serializes profile changes against a Room's complete public AI commit.
 * This is intentionally single-process, matching the current single-server deployment scope.
 */
export function createRoomAiPersonalProfileRevisionCoordinator(redis: Redis, ttlSeconds: number) {
  const roomLocks = new Map<string, Promise<void>>()

  async function withRoomLock<T>(diagramId: string, action: () => Promise<T>): Promise<T> {
    const previous = roomLocks.get(diagramId) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    roomLocks.set(diagramId, current)
    await previous
    try {
      return await action()
    } finally {
      release()
      if (roomLocks.get(diagramId) === current) roomLocks.delete(diagramId)
    }
  }

  async function getRevision(diagramId: string, userId: string): Promise<string | null> {
    return redis.get(k.aiPersonalProfileRevision(diagramId, userId))
  }

  return {
    withRoomLock,

    /** Rotates a current profile revision while holding the room publication lock. */
    async withAdvancedRevision<T>(
      diagramId: string,
      userId: string,
      expectedRevision: string,
      action: (nextRevision: string) => Promise<T>
    ): Promise<{ revision: string; value: T }> {
      return withRoomLock(diagramId, async () => {
        const key = k.aiPersonalProfileRevision(diagramId, userId)
        const current = await redis.get(key)
        if (current !== expectedRevision) throw new RoomAiPersonalProfileStaleError()

        const nextRevision = randomUUID()
        await redis.set(key, nextRevision, { EX: ttlSeconds })
        try {
          return { revision: nextRevision, value: await action(nextRevision) }
        } catch (error) {
          if ((await redis.get(key)) === nextRevision) {
            await redis.set(key, expectedRevision, { EX: ttlSeconds })
          }
          throw error
        }
      })
    },

    async getOrCreateRevision(diagramId: string, userId: string): Promise<string> {
      return withRoomLock(diagramId, async () => {
        const key = k.aiPersonalProfileRevision(diagramId, userId)
        const existing = await redis.get(key)
        if (existing) return existing
        const revision = randomUUID()
        await redis.set(key, revision, { NX: true, EX: ttlSeconds })
        const stored = await redis.get(key)
        if (!stored) throw new Error("Room personal profile revision is unavailable")
        return stored
      })
    },

    async revokeRevision(diagramId: string, userId: string): Promise<string> {
      return withRoomLock(diagramId, async () => {
        const revision = randomUUID()
        await redis.set(k.aiPersonalProfileRevision(diagramId, userId), revision, {
          EX: ttlSeconds,
        })
        return revision
      })
    },

    isCurrentRevision(diagramId: string, userId: string, revision: string): Promise<boolean> {
      return getRevision(diagramId, userId).then((current) => current === revision)
    },
  }
}

export type RoomAiPersonalProfileRevisionCoordinator = ReturnType<
  typeof createRoomAiPersonalProfileRevisionCoordinator
>
