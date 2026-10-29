import { randomUUID } from "node:crypto"
import type { Redis } from "../../redis.js"

export const GLOBAL_SLOTS = "umlstudio:room-ai:inference-slots"
export const GLOBAL_LIMIT = "umlstudio:room-ai:inference-limit"

const ACQUIRE = `
local count = redis.call('SCARD', KEYS[1])
local limit = redis.call('GET', KEYS[2])
if count == 0 then redis.call('SET', KEYS[2], ARGV[2])
elseif not limit or tonumber(limit) ~= tonumber(ARGV[2]) then return -1 end
if count >= tonumber(ARGV[2]) then return 0 end
redis.call('SADD', KEYS[1], ARGV[1])
return 1
`

const RELEASE = `return redis.call('SREM', KEYS[1], ARGV[1])`

export class RoomAiInferenceCapacityError extends Error {
  constructor() {
    super("room AI inference capacity is full")
    this.name = "RoomAiInferenceCapacityError"
  }
}

/** Acquires one slot from the same Redis set used by the shared queue dispatcher. */
export async function acquireRoomAiInferenceSlot(
  redis: Redis,
  maxConcurrency: number
): Promise<string> {
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
    throw new Error("maxConcurrency must be a positive integer")
  }
  const token = randomUUID()
  const acquired = await redis.eval(ACQUIRE, {
    keys: [GLOBAL_SLOTS, GLOBAL_LIMIT],
    arguments: [token, String(maxConcurrency)],
  })
  const result = Number(acquired)
  if (result === -1) throw new Error("inconsistent AI_MAX_CONCURRENCY across instances")
  if (result !== 1) throw new RoomAiInferenceCapacityError()
  return token
}

/** Retries release after completed or definitely-not-started inference. */
export async function releaseRoomAiInferenceSlot(redis: Redis, token: string): Promise<void> {
  let retryDelayMs = 100
  while (true) {
    try {
      await redis.eval(RELEASE, { keys: [GLOBAL_SLOTS], arguments: [token] })
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
      retryDelayMs = Math.min(retryDelayMs * 2, 5_000)
    }
  }
}
