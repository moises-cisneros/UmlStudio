import type { Redis } from "../../redis.js"
import { k } from "../../redis.js"
import { ConfirmedInferenceNotStartedError } from "./inference-not-started.js"
import {
  RoomAiPersonalProfileSidecarSchema,
  type RoomAiPersonalProfileSidecar,
} from "./room-ai-personal-profile.js"

/** Maximum number of messages kept per room; older ones are trimmed on append. */
export const CHAT_MAX_MESSAGES = 200
export const CHAT_DEFAULT_PAGE_SIZE = 50

export interface ChatRecord {
  id: string
}

export interface RoomAiReplicaRequirement {
  generation: string
  revision: number
}

export interface ListChatOptions {
  /** Return messages older than the message with this id. */
  before?: string
  limit?: number
}

export interface ChatPage<T extends ChatRecord> {
  /** Messages in chronological order (oldest first). */
  messages: T[]
  /** True when there are older messages than the first one returned. */
  hasMore: boolean
}

export interface ChatRepository<T extends ChatRecord = ChatRecord> {
  append(diagramId: string, message: T): Promise<void>
  /** Replaces the message with the same id. Returns false when it no longer exists. */
  update(diagramId: string, message: T): Promise<boolean>
  list(diagramId: string, options?: ListChatOptions): Promise<ChatPage<T>>
}

// Finds the entry whose JSON `id` matches ARGV[1] and replaces it with ARGV[2].
const UPDATE_BY_ID = `
local items = redis.call('LRANGE', KEYS[1], 0, -1)
for i, raw in ipairs(items) do
  local ok, decoded = pcall(cjson.decode, raw)
  if ok and type(decoded) == 'table' and decoded.id == ARGV[1] then
    redis.call('LSET', KEYS[1], i - 1, ARGV[2])
    return 1
  end
end
return 0
`

const ENQUEUE = `
local count = redis.call('LLEN', KEYS[1])
local legacy = {}
if redis.call('EXISTS', KEYS[1]) == 0 and redis.call('EXISTS', KEYS[3]) == 0 then
  local items = redis.call('LRANGE', KEYS[2], 0, -1)
  local active = redis.call('GET', KEYS[4])
  for _, raw in ipairs(items) do
    local ok, message = pcall(cjson.decode, raw)
    if ok and type(message) == 'table' and message.status == 'queued' and type(message.id) == 'string' and message.id ~= active then
      table.insert(legacy, message.id)
    end
  end
  count = #legacy
end
if count >= 5 then return {0, 0} end
for _, id in ipairs(legacy) do redis.call('RPUSH', KEYS[1], id) end
redis.call('RPUSH', KEYS[1], ARGV[1])
redis.call('RPUSH', KEYS[2], ARGV[2])
redis.call('LTRIM', KEYS[2], -200, -1)
if ARGV[4] ~= '' then redis.call('SET', KEYS[6], ARGV[4], 'EX', ARGV[5]) end
redis.call('SET', KEYS[7], ARGV[6], 'EX', ARGV[5])
redis.call('EXPIRE', KEYS[1], ARGV[3])
redis.call('EXPIRE', KEYS[2], ARGV[3])
redis.call('SET', KEYS[3], '1', 'EX', ARGV[3])
return {count + 1, redis.call('EXISTS', KEYS[5])}
`

/** Atomically admits a queued message and records it in room history. */
export async function enqueueChatMessage<T extends ChatRecord>(
  redis: Redis,
  diagramId: string,
  message: T,
  ttlSeconds: number,
  replica: RoomAiReplicaRequirement,
  personalProfile: RoomAiPersonalProfileSidecar
): Promise<{ position: number; active: boolean }> {
  const result = (await redis.eval(ENQUEUE, {
    keys: [
      k.aiQueue(diagramId),
      k.aiChat(diagramId),
      k.aiQueueInitialized(diagramId),
      k.aiActiveMessage(diagramId),
      k.aiActive(diagramId),
      k.aiReplicaRequirement(diagramId, message.id),
      k.aiPersonalProfile(diagramId, message.id),
    ],
    arguments: [
      message.id,
      JSON.stringify(message),
      String(ttlSeconds),
      JSON.stringify(replica),
      String(Math.min(ttlSeconds, 15 * 60)),
      JSON.stringify(personalProfile),
    ],
  })) as [number, number]
  return { position: Number(result[0]), active: Number(result[1]) === 1 }
}

const CONSUME_PERSONAL_MEMORY = `
local value = redis.call('GET', KEYS[1])
if not value then return false end
redis.call('DEL', KEYS[1])
return value
`

/** Atomically consumes the requester's short-lived approved-profile sidecar exactly once. */
export async function consumeRoomAiPersonalProfile(
  redis: Redis,
  diagramId: string,
  messageId: string,
  expectedRequesterId: string
): Promise<RoomAiPersonalProfileSidecar> {
  const raw = await redis.eval(CONSUME_PERSONAL_MEMORY, {
    keys: [k.aiPersonalProfile(diagramId, messageId)],
    arguments: [],
  })
  if (typeof raw !== "string") {
    throw new ConfirmedInferenceNotStartedError("Room AI request context is unavailable")
  }
  try {
    const value = RoomAiPersonalProfileSidecarSchema.parse(JSON.parse(raw))
    if (value.requesterId !== expectedRequesterId) {
      throw new ConfirmedInferenceNotStartedError("Room AI request context is unavailable")
    }
    return value
  } catch {
    throw new ConfirmedInferenceNotStartedError("Room AI request context is unavailable")
  }
}

export async function getRoomAiReplicaRequirement(
  redis: Redis,
  diagramId: string,
  messageId: string
): Promise<RoomAiReplicaRequirement | undefined> {
  const raw = await redis.get(k.aiReplicaRequirement(diagramId, messageId))
  if (!raw) return undefined
  try {
    const value = JSON.parse(raw) as Partial<RoomAiReplicaRequirement>
    if (
      typeof value.generation === "string" &&
      /^[a-f0-9]{64}$/.test(value.generation) &&
      Number.isSafeInteger(value.revision) &&
      (value.revision as number) >= 0
    ) {
      return { generation: value.generation, revision: value.revision as number }
    }
  } catch {
    // Malformed queue metadata fails closed at dispatch.
  }
  return undefined
}

/**
 * Room conversation stored server-side in `diagram:{id}:ai:chat`
 * (LIST of JSON messages, oldest first). The key shares the diagram TTL.
 */
export function createChatRepository<T extends ChatRecord = ChatRecord>(
  redis: Redis,
  ttlSeconds: number
): ChatRepository<T> {
  return {
    async append(diagramId, message) {
      const key = k.aiChat(diagramId)
      await redis
        .multi()
        .rPush(key, JSON.stringify(message))
        .lTrim(key, -CHAT_MAX_MESSAGES, -1)
        .expire(key, ttlSeconds)
        .exec()
    },

    async update(diagramId, message) {
      const key = k.aiChat(diagramId)
      const updated = await redis.eval(UPDATE_BY_ID, {
        keys: [key],
        arguments: [message.id, JSON.stringify(message)],
      })
      return Number(updated) === 1
    },

    async list(diagramId, options = {}) {
      const limit = Math.min(
        Math.max(1, Math.floor(options.limit ?? CHAT_DEFAULT_PAGE_SIZE)),
        CHAT_MAX_MESSAGES
      )
      const raw = await redis.lRange(k.aiChat(diagramId), 0, -1)
      const all = raw.map((entry) => JSON.parse(entry) as T)

      let end = all.length
      if (options.before !== undefined) {
        const cursor = all.findIndex((m) => m.id === options.before)
        // An unknown cursor (e.g. already trimmed) yields no older messages.
        end = cursor === -1 ? 0 : cursor
      }
      const start = Math.max(0, end - limit)
      return { messages: all.slice(start, end), hasMore: start > 0 }
    },
  }
}
