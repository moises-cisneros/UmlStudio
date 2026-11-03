import type { RoomChatMessage } from "@umlstudio/core"
import { k, type Redis } from "../../redis.js"

const CLAIM_TTL_SECONDS = 60

const EXPIRE_STATE_WITH_CHAT = `
local function expireStateWithChat(ttlSeconds)
  local chatTtlMs = redis.call('PTTL', KEYS[1])
  if chatTtlMs == -1 then chatTtlMs = tonumber(ttlSeconds) * 1000 end
  if chatTtlMs > 0 then redis.call('PEXPIRE', KEYS[2], chatTtlMs) end
end
`

export type ProposalClaimResult =
  | { kind: "claimed"; message: RoomChatMessage }
  | { kind: "conflict" }
  | { kind: "missing" }

export type ProposalResult =
  | { kind: "updated"; message: RoomChatMessage }
  | { kind: "conflict" }
  | { kind: "missing" }

// The diff JSON remains in the immutable chat record. Mutable proposal state lives in a sidecar
// hash so Redis Lua never re-encodes a ModelDiff and changes empty arrays into objects.
const CLAIM_PROPOSAL = `
${EXPIRE_STATE_WITH_CHAT}
local items = redis.call('LRANGE', KEYS[1], 0, -1)
for _, raw in ipairs(items) do
  local ok, message = pcall(cjson.decode, raw)
  if ok and type(message) == 'table' and message.id == ARGV[1] then
    if type(message.proposal) ~= 'table' then return {0} end
    local status = redis.call('HGET', KEYS[2], 'status') or message.proposal.status
    if status == 'claimed' and not redis.call('GET', KEYS[3]) then
      redis.call('HSET', KEYS[2], 'status', 'pending')
      redis.call('HDEL', KEYS[2], 'claimedBy')
      status = 'pending'
    end
    if status ~= 'pending' then return {1} end
    if not redis.call('SET', KEYS[3], ARGV[2], 'NX', 'EX', tonumber(ARGV[3])) then return {1} end
    redis.call('HSET', KEYS[2], 'status', 'claimed', 'claimedBy', ARGV[2])
    expireStateWithChat(ARGV[4])
    return {2, raw}
  end
end
return {0}
`

const COMPLETE_PROPOSAL = `
${EXPIRE_STATE_WITH_CHAT}
local items = redis.call('LRANGE', KEYS[1], 0, -1)
for _, raw in ipairs(items) do
  local ok, message = pcall(cjson.decode, raw)
  if ok and type(message) == 'table' and message.id == ARGV[1] then
    if type(message.proposal) ~= 'table' then return {0} end
    local status = redis.call('HGET', KEYS[2], 'status') or message.proposal.status
    local claimedBy = redis.call('HGET', KEYS[2], 'claimedBy')
    if status ~= 'claimed' or claimedBy ~= ARGV[2] or redis.call('GET', KEYS[3]) ~= ARGV[2] then return {1} end
    redis.call('HSET', KEYS[2], 'status', ARGV[3])
    redis.call('HDEL', KEYS[2], 'claimedBy')
    redis.call('DEL', KEYS[3])
    expireStateWithChat(ARGV[4])
    return {2, raw}
  end
end
return {0}
`

const MARK_PROPOSAL_STALE = `
${EXPIRE_STATE_WITH_CHAT}
local items = redis.call('LRANGE', KEYS[1], 0, -1)
for _, raw in ipairs(items) do
  local ok, message = pcall(cjson.decode, raw)
  if ok and type(message) == 'table' and message.id == ARGV[1] then
    if type(message.proposal) ~= 'table' then return {0} end
    local status = redis.call('HGET', KEYS[2], 'status') or message.proposal.status
    if status == 'stale' then
      expireStateWithChat(ARGV[2])
      return {2, raw}
    end
    if status == 'claimed' and not redis.call('GET', KEYS[3]) then
      redis.call('HSET', KEYS[2], 'status', 'pending')
      redis.call('HDEL', KEYS[2], 'claimedBy')
      status = 'pending'
    end
    if status ~= 'pending' then return {1} end
    redis.call('HSET', KEYS[2], 'status', 'stale')
    redis.call('HDEL', KEYS[2], 'claimedBy')
    redis.call('DEL', KEYS[3])
    expireStateWithChat(ARGV[2])
    return {2, raw}
  end
end
return {0}
`

function decodeResult(result: unknown): { code: number; message?: RoomChatMessage } {
  if (!Array.isArray(result))
    throw new Error("Room AI proposal transition returned an invalid result")
  const code = Number(result[0])
  const raw = result[1]
  if (code !== 2) return { code }
  if (typeof raw !== "string")
    throw new Error("Room AI proposal transition returned an invalid message")
  return { code, message: JSON.parse(raw) as RoomChatMessage }
}

function withState(
  message: RoomChatMessage,
  status: NonNullable<RoomChatMessage["proposal"]>["status"],
  claimedBy?: string
): RoomChatMessage {
  if (!message.proposal)
    throw new Error("Room AI proposal transition returned a message without a proposal")
  return {
    ...message,
    proposal: {
      ...message.proposal,
      status,
      ...(claimedBy ? { claimedBy } : {}),
    },
  }
}

export function createRoomAiProposalRepository(redis: Redis, ttlSeconds: number) {
  return {
    async hydrate(messages: RoomChatMessage[]): Promise<RoomChatMessage[]> {
      if (typeof redis.hGetAll !== "function") return messages
      return Promise.all(
        messages.map(async (message) => {
          if (!message.proposal) return message
          const state = await redis.hGetAll(k.aiProposalState(message.diagramId, message.id))
          const status = state.status as
            | NonNullable<RoomChatMessage["proposal"]>["status"]
            | undefined
          return status ? withState(message, status, state.claimedBy) : message
        })
      )
    },

    async claim(
      diagramId: string,
      messageId: string,
      userId: string
    ): Promise<ProposalClaimResult> {
      const result = decodeResult(
        await redis.eval(CLAIM_PROPOSAL, {
          keys: [
            k.aiChat(diagramId),
            k.aiProposalState(diagramId, messageId),
            k.aiProposalClaim(diagramId, messageId),
          ],
          arguments: [messageId, userId, String(CLAIM_TTL_SECONDS), String(ttlSeconds)],
        })
      )
      if (result.code === 0) return { kind: "missing" }
      if (result.code === 1) return { kind: "conflict" }
      return { kind: "claimed", message: withState(result.message!, "claimed", userId) }
    },

    async complete(
      diagramId: string,
      messageId: string,
      userId: string,
      status: "applied" | "failed" | "rejected"
    ): Promise<ProposalResult> {
      const result = decodeResult(
        await redis.eval(COMPLETE_PROPOSAL, {
          keys: [
            k.aiChat(diagramId),
            k.aiProposalState(diagramId, messageId),
            k.aiProposalClaim(diagramId, messageId),
          ],
          arguments: [messageId, userId, status, String(ttlSeconds)],
        })
      )
      if (result.code === 0) return { kind: "missing" }
      if (result.code === 1) return { kind: "conflict" }
      return { kind: "updated", message: withState(result.message!, status) }
    },

    async markStale(diagramId: string, messageId: string): Promise<ProposalResult> {
      const result = decodeResult(
        await redis.eval(MARK_PROPOSAL_STALE, {
          keys: [
            k.aiChat(diagramId),
            k.aiProposalState(diagramId, messageId),
            k.aiProposalClaim(diagramId, messageId),
          ],
          arguments: [messageId, String(ttlSeconds)],
        })
      )
      if (result.code === 0) return { kind: "missing" }
      if (result.code === 1) return { kind: "conflict" }
      return { kind: "updated", message: withState(result.message!, "stale") }
    },
  }
}
