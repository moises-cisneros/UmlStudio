import type { Redis } from "../../redis.js"
import { k } from "../../redis.js"
import {
  ConfirmedInferenceNotStartedError,
  getActiveRoomAiDispatchClaimContext,
  StaleInferenceClaimError,
} from "./inference-not-started.js"
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
  /**
   * Atomically marks the requester message as answered and appends the assistant answer once
   * under an active, unexpired dispatch claim. Returns false when the requester no longer exists.
   */
  commitAnswer(diagramId: string, requester: T, answer: T): Promise<boolean>
  list(diagramId: string, options?: ListChatOptions): Promise<ChatPage<T>>
}

// Finds the entry whose JSON `id` matches ARGV[1] and replaces it with ARGV[2].
const UPDATE_BY_ID = `
if ARGV[3] and ARGV[3] ~= '' then
  if redis.call('GET', KEYS[2]) ~= ARGV[3] then return -1 end
  local leaseExpiry = tonumber(redis.call('GET', KEYS[3]))
  if not leaseExpiry or leaseExpiry <= tonumber(ARGV[4]) then return -1 end
end
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

const APPEND_CHAT = `
if ARGV[4] and ARGV[4] ~= '' then
  if redis.call('GET', KEYS[2]) ~= ARGV[4] then return -1 end
  local leaseExpiry = tonumber(redis.call('GET', KEYS[3]))
  if not leaseExpiry or leaseExpiry <= tonumber(ARGV[5]) then return -1 end
end
redis.call('RPUSH', KEYS[1], ARGV[1])
redis.call('LTRIM', KEYS[1], -tonumber(ARGV[3]), -1)
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
return 1
`

const COMMIT_ANSWER = `
if not ARGV[7] or ARGV[7] == '' then return -1 end
if redis.call('GET', KEYS[2]) ~= ARGV[7] then return -1 end
local leaseExpiry = tonumber(redis.call('GET', KEYS[3]))
if not leaseExpiry or leaseExpiry <= tonumber(ARGV[8]) then return -1 end
local items = redis.call('LRANGE', KEYS[1], 0, -1)
local requesterIndex = nil
local requesterStatus = nil
local answerExists = false
for i, raw in ipairs(items) do
  local ok, decoded = pcall(cjson.decode, raw)
  if ok and type(decoded) == 'table' then
    if decoded.id == ARGV[1] and not requesterIndex then
      requesterIndex = i - 1
      requesterStatus = decoded.status
    end
    if decoded.id == ARGV[3] then
      answerExists = true
    end
  end
end
if requesterIndex == nil then
  return 0
end
if requesterStatus == 'answered' and answerExists then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[5]))
  return 1
end
if requesterStatus ~= 'queued' then
  return 0
end
redis.call('LSET', KEYS[1], requesterIndex, ARGV[2])
if not answerExists then
  redis.call('RPUSH', KEYS[1], ARGV[4])
  local maxMessages = tonumber(ARGV[6])
  local total = #items + 1
  if total > maxMessages then
    local excess = total - maxMessages
    if requesterIndex < excess then
      redis.call('LSET', KEYS[1], excess, ARGV[2])
    end
    redis.call('LTRIM', KEYS[1], -maxMessages, -1)
  end
end
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[5]))
return 1
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

/**
 * Reads the requester's short-lived approved-profile sidecar.
 * When `consume` is true (default), atomically deletes the sidecar.
 */
export async function consumeRoomAiPersonalProfile(
  redis: Redis,
  diagramId: string,
  messageId: string,
  expectedRequesterId: string,
  options?: { consume?: boolean }
): Promise<RoomAiPersonalProfileSidecar> {
  const key = k.aiPersonalProfile(diagramId, messageId)
  const raw =
    options?.consume === false
      ? await redis.get(key)
      : await redis.eval(CONSUME_PERSONAL_MEMORY, {
          keys: [key],
          arguments: [],
        })
  if (typeof raw !== "string") {
    throw new ConfirmedInferenceNotStartedError("Room AI request context is unavailable", {
      stage: "orchestrator_personal_profile",
      reasonCode: "personal_profile_sidecar_missing",
    })
  }
  let value: RoomAiPersonalProfileSidecar
  try {
    value = RoomAiPersonalProfileSidecarSchema.parse(JSON.parse(raw))
  } catch {
    throw new ConfirmedInferenceNotStartedError("Room AI request context is unavailable", {
      stage: "orchestrator_personal_profile",
      reasonCode: "personal_profile_sidecar_invalid",
    })
  }
  if (value.requesterId !== expectedRequesterId) {
    throw new ConfirmedInferenceNotStartedError("Room AI request context is unavailable", {
      stage: "orchestrator_personal_profile",
      reasonCode: "personal_profile_requester_mismatch",
    })
  }
  return value
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
      const activeClaim = getActiveRoomAiDispatchClaimContext()
      if (!activeClaim && typeof redis.multi === "function") {
        await redis
          .multi()
          .rPush(key, JSON.stringify(message))
          .lTrim(key, -CHAT_MAX_MESSAGES, -1)
          .expire(key, ttlSeconds)
          .exec()
        return
      }
      const res = await redis.eval(APPEND_CHAT, {
        keys: [key, k.aiActive(diagramId), k.aiActiveLease(diagramId)],
        arguments: [
          JSON.stringify(message),
          String(ttlSeconds),
          String(CHAT_MAX_MESSAGES),
          activeClaim?.claimToken ?? "",
          String(Date.now()),
        ],
      })
      if (Number(res) === -1) throw new StaleInferenceClaimError()
    },

    async update(diagramId, message) {
      const key = k.aiChat(diagramId)
      const activeClaim = getActiveRoomAiDispatchClaimContext()
      const updated = await redis.eval(UPDATE_BY_ID, {
        keys: [key, k.aiActive(diagramId), k.aiActiveLease(diagramId)],
        arguments: [
          message.id,
          JSON.stringify(message),
          activeClaim?.claimToken ?? "",
          String(Date.now()),
        ],
      })
      if (Number(updated) === -1) throw new StaleInferenceClaimError()
      return Number(updated) === 1
    },

    async commitAnswer(diagramId, requester, answer) {
      const key = k.aiChat(diagramId)
      const activeClaim = getActiveRoomAiDispatchClaimContext()
      if (!activeClaim?.claimToken) {
        throw new StaleInferenceClaimError()
      }
      const answeredRequester = { ...requester, status: "answered" as const }
      const committed = await redis.eval(COMMIT_ANSWER, {
        keys: [key, k.aiActive(diagramId), k.aiActiveLease(diagramId)],
        arguments: [
          requester.id,
          JSON.stringify(answeredRequester),
          answer.id,
          JSON.stringify(answer),
          String(ttlSeconds),
          String(CHAT_MAX_MESSAGES),
          activeClaim.claimToken,
          String(Date.now()),
        ],
      })
      if (Number(committed) === -1) throw new StaleInferenceClaimError()
      return Number(committed) === 1
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
