import { randomUUID } from "node:crypto"
import type { Redis } from "../../redis.js"
import { k } from "../../redis.js"

const MAX_PENDING = 1000
const MAX_TEXT = 8000
const MAX_DECISIONS = 100
const APPEND = `
if redis.call('LLEN', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
redis.call('RPUSH', KEYS[1], ARGV[1])
redis.call('SET', KEYS[3], ARGV[4], 'EX', ARGV[2], 'NX')
redis.call('EXPIRE', KEYS[3], ARGV[2])
redis.call('EXPIRE', KEYS[2], ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[2])
return 1
`
const READ_BATCH = `
if redis.call('LLEN', KEYS[2]) < tonumber(ARGV[1]) then return {} end
return {redis.call('GET', KEYS[1]) or '', redis.call('GET', KEYS[3]) or '0', redis.call('LRANGE', KEYS[2], 0, tonumber(ARGV[1]) - 1)}
`
const COMMIT_BATCH = `
if (redis.call('GET', KEYS[3]) or '0') ~= ARGV[1] then return 0 end
if redis.call('LLEN', KEYS[2]) < tonumber(ARGV[3]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[4])
redis.call('LTRIM', KEYS[2], tonumber(ARGV[3]), -1)
redis.call('SET', KEYS[3], ARGV[5], 'EX', ARGV[4])
return 1
`
const PIN = `
local entries = redis.call('LRANGE', KEYS[1], 0, -1)
for _, entry in ipairs(entries) do if entry == ARGV[1] then redis.call('EXPIRE', KEYS[1], ARGV[2]); return 1 end end
if #entries >= tonumber(ARGV[3]) then return 0 end
redis.call('RPUSH', KEYS[1], ARGV[1])
redis.call('EXPIRE', KEYS[1], ARGV[2])
return 1
`
const SNAPSHOT = `return {redis.call('GET', KEYS[1]) or '', redis.call('LRANGE', KEYS[2], 0, -1)}`

export interface RoomMemorySnapshot {
  summary: string
  decisions: string[]
}
export interface RoomMemoryOptions {
  ttlSeconds: number
  every: number
  summarize: (summary: string, messages: string[], diagramId?: string) => Promise<string>
}
function validateText(value: string): void {
  if (!value.trim() || value.length > MAX_TEXT) throw new Error("Invalid room memory text")
}
export function createRoomMemoryRepository(redis: Redis, options: RoomMemoryOptions) {
  if (
    !Number.isSafeInteger(options.every) ||
    options.every < 1 ||
    options.every > MAX_PENDING ||
    !Number.isSafeInteger(options.ttlSeconds) ||
    options.ttlSeconds < 1
  ) {
    throw new Error("Invalid room memory configuration")
  }
  const ttl = String(options.ttlSeconds)
  const keys = (id: string) => [k.aiSummary(id), k.aiSummaryPending(id), k.aiSummaryRevision(id)]
  async function flush(diagramId: string): Promise<void> {
    const roomKeys = keys(diagramId)
    for (;;) {
      const batch = (await redis.eval(READ_BATCH, {
        keys: roomKeys,
        arguments: [String(options.every)],
      })) as [string, string, string[]] | []
      if (batch.length === 0) return
      const [summary, revision, messages] = batch
      const next = await options.summarize(summary, messages, diagramId)
      validateText(next)
      await redis.eval(COMMIT_BATCH, {
        keys: roomKeys,
        arguments: [revision, next, String(options.every), ttl, randomUUID()],
      })
    }
  }
  return {
    async snapshot(diagramId: string): Promise<RoomMemorySnapshot> {
      const [summary, decisions] = (await redis.eval(SNAPSHOT, {
        keys: [k.aiSummary(diagramId), k.aiDecisions(diagramId)],
        arguments: [],
      })) as [string, string[]]
      return { summary, decisions }
    },
    async recordPublicMessage(diagramId: string, message: string): Promise<void> {
      validateText(message)
      await flush(diagramId)
      const added = await redis.eval(APPEND, {
        keys: [
          k.aiSummaryPending(diagramId),
          k.aiSummary(diagramId),
          k.aiSummaryRevision(diagramId),
        ],
        arguments: [message, ttl, String(MAX_PENDING), randomUUID()],
      })
      if (!added) throw new Error("Room memory pending message limit reached")
      await flush(diagramId)
    },
    flush,
    async pinDecision(diagramId: string, decision: string): Promise<void> {
      validateText(decision)
      const added = await redis.eval(PIN, {
        keys: [k.aiDecisions(diagramId)],
        arguments: [decision, ttl, String(MAX_DECISIONS)],
      })
      if (!added) throw new Error("Room memory decision limit reached")
    },
    async unpinDecision(diagramId: string, decision: string): Promise<void> {
      await redis.lRem(k.aiDecisions(diagramId), 0, decision)
    },
  }
}
