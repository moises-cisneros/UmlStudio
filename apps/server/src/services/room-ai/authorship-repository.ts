import type { Redis } from "../../redis.js"
import { k } from "../../redis.js"

export interface AuthorshipRepository {
  /** Attribute the elements to the user; the last author of an element wins. */
  record(diagramId: string, elementIds: string[], userId: string): Promise<void>
  /** Map of `elementId -> userId` for the room. */
  getAll(diagramId: string): Promise<Record<string, string>>
}

/**
 * Who created or last changed each board element, stored in
 * `diagram:{id}:ai:authorship` (HASH `elementId -> userId`). The key shares the diagram TTL.
 */
export function createAuthorshipRepository(redis: Redis, ttlSeconds: number): AuthorshipRepository {
  return {
    async record(diagramId, elementIds, userId) {
      if (elementIds.length === 0) return
      const key = k.aiAuthorship(diagramId)
      const entries = Object.fromEntries(elementIds.map((id) => [id, userId]))
      await redis.multi().hSet(key, entries).expire(key, ttlSeconds).exec()
    },

    async getAll(diagramId) {
      return redis.hGetAll(k.aiAuthorship(diagramId))
    },
  }
}
