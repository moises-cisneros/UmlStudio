import type { Redis } from "../../redis.js"
import { k } from "../../redis.js"

/** Maximum number of messages kept per room; older ones are trimmed on append. */
export const CHAT_MAX_MESSAGES = 200
export const CHAT_DEFAULT_PAGE_SIZE = 50

export interface ChatRecord {
  id: string
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
