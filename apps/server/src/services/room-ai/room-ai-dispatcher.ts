import { randomUUID } from "node:crypto"
import type { RoomAiEvent, RoomChatMessage } from "@umlstudio/core"
import { logger } from "../../logger.js"
import { k, type Redis } from "../../redis.js"
import { createChatRepository, type RoomAiReplicaRequirement } from "./chat-repository.js"
import { InferenceNotStartedError } from "./inference-not-started.js"
import { GLOBAL_LIMIT, GLOBAL_SLOTS } from "./inference-slots.js"

// No lease expiry: a crashed worker must not silently free an unconfirmed inference.
const CLAIM = `
if redis.call('EXISTS', KEYS[2]) == 1 then return false end
if redis.call('EXISTS', KEYS[1]) == 0 and redis.call('EXISTS', KEYS[6]) == 0 then
  local items = redis.call('LRANGE', KEYS[5], 0, -1)
  for _, raw in ipairs(items) do
    local ok, message = pcall(cjson.decode, raw)
    if ok and type(message) == 'table' and message.status == 'queued' and type(message.id) == 'string' then
      redis.call('RPUSH', KEYS[1], message.id)
    end
  end
  if redis.call('EXISTS', KEYS[1]) == 1 then
    redis.call('SET', KEYS[6], '1', 'EX', ARGV[3])
    redis.call('EXPIRE', KEYS[1], ARGV[3])
  end
end
local count = redis.call('SCARD', KEYS[3])
local limit = redis.call('GET', KEYS[4])
if count == 0 then redis.call('SET', KEYS[4], ARGV[2])
elseif not limit or tonumber(limit) ~= tonumber(ARGV[2]) then return -1 end
if count >= tonumber(ARGV[2]) then return false end
local id = redis.call('LPOP', KEYS[1])
if not id then return false end
redis.call('SET', KEYS[2], ARGV[1])
redis.call('SET', KEYS[7], id)
redis.call('SET', KEYS[6], '1', 'EX', ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[3])
redis.call('SADD', KEYS[3], ARGV[1])
return id
`
const RELEASE = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1])
redis.call('SREM', KEYS[2], ARGV[1])
redis.call('DEL', KEYS[3])
return 1
`

type FailedMessage = RoomChatMessage & { failureReason?: string }

interface DispatcherDeps {
  redis: Redis
  maxConcurrency: number
  timeoutMs?: number
  ttlSeconds?: number
  /** Resolve only after the provider confirms the inference has terminated. */
  infer: (diagramId: string, messageId: string, replica: RoomAiReplicaRequirement) => Promise<void>
  getReplicaRequirement: (
    diagramId: string,
    messageId: string
  ) => Promise<RoomAiReplicaRequirement | undefined>
  publish?: (diagramId: string, event: RoomAiEvent) => void | Promise<void>
}

export function createRoomAiDispatcher(deps: DispatcherDeps) {
  if (!Number.isInteger(deps.maxConcurrency) || deps.maxConcurrency < 1) {
    throw new Error("maxConcurrency must be a positive integer")
  }
  const chat = createChatRepository<FailedMessage>(deps.redis, deps.ttlSeconds ?? 120 * 86400)
  const pending = new Set<Promise<void>>()
  const claiming = new Set<Promise<boolean>>()
  const starting = new Set<Promise<void>>()
  const roomWork = new Map<string, Promise<void>>()
  let closed = false
  const activeKey = k.aiActive

  async function publishStatus(diagramId: string, status: "thinking" | "idle") {
    if (!deps.publish) return
    const queueLength = await deps.redis.lLen(k.aiQueue(diagramId))
    await deps.publish(diagramId, { type: "ai.status", status, queueLength })
  }

  async function update(
    diagramId: string,
    id: string,
    status: "answered" | "failed",
    reason?: string
  ) {
    const { messages } = await chat.list(diagramId, { limit: 200 })
    const message = messages.find((item) => item.id === id)
    if (!message) throw new Error(`queued message ${id} not found`)
    const updated: FailedMessage = {
      ...message,
      status,
      ...(reason ? { failureReason: reason } : {}),
    }
    if (!(await chat.update(diagramId, updated))) throw new Error(`queued message ${id} not found`)
    await deps.publish?.(diagramId, { type: "message.updated", message: updated })
  }

  async function releaseConfirmedSlot(diagramId: string, token: string, id: string): Promise<void> {
    let retryDelayMs = 100
    while (true) {
      try {
        await deps.redis.eval(RELEASE, {
          keys: [activeKey(diagramId), GLOBAL_SLOTS, k.aiActiveMessage(diagramId)],
          arguments: [token],
        })
        return
      } catch (err) {
        logger.error(
          { err, diagramId, messageId: id },
          "failed to release confirmed inference slot; retrying"
        )
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
        retryDelayMs = Math.min(retryDelayMs * 2, 5_000)
      }
    }
  }

  const dispatcher = {
    processRoom(diagramId: string): Promise<boolean> {
      if (closed) return Promise.resolve(false)
      const claim = (async () => {
        const token = randomUUID()
        const result = await deps.redis.eval(CLAIM, {
          keys: [
            k.aiQueue(diagramId),
            activeKey(diagramId),
            GLOBAL_SLOTS,
            GLOBAL_LIMIT,
            k.aiChat(diagramId),
            k.aiQueueInitialized(diagramId),
            k.aiActiveMessage(diagramId),
          ],
          arguments: [token, String(deps.maxConcurrency), String(deps.ttlSeconds ?? 120 * 86400)],
        })
        if (result === -1) throw new Error("inconsistent AI_MAX_CONCURRENCY across instances")
        if (typeof result !== "string") return false
        const id = result
        let markStarted!: () => void
        const started = new Promise<void>((resolve) => {
          markStarted = resolve
        })
        starting.add(started)
        const work = (async () => {
          await publishStatus(diagramId, "thinking").catch((err) =>
            logger.error({ err, diagramId }, "failed to publish room AI status")
          )
          let timedOut = false
          const timer = setTimeout(() => {
            timedOut = true
            void update(diagramId, id, "failed", "Inference timed out").catch((err) =>
              logger.error({ err, diagramId, messageId: id }, "failed to mark timed out inference")
            )
          }, deps.timeoutMs ?? 90_000)
          try {
            const replica = await deps.getReplicaRequirement(diagramId, id)
            if (!replica) {
              throw new InferenceNotStartedError(
                "shared board synchronization metadata is unavailable"
              )
            }
            markStarted()
            await deps.infer(diagramId, id, replica)
          } catch (err) {
            markStarted()
            clearTimeout(timer)
            if (err instanceof InferenceNotStartedError) {
              try {
                if (!timedOut) await update(diagramId, id, "failed", "Inference unavailable")
                await deps.redis
                  .multi()
                  .del(k.aiReplicaRequirement(diagramId, id))
                  .del(k.aiPersonalProfile(diagramId, id))
                  .exec()
                await publishStatus(diagramId, "idle")
              } finally {
                await releaseConfirmedSlot(diagramId, token, id)
              }
              return
            }
            // A rejected request is not proof that the remote model stopped.
            if (!timedOut)
              await update(
                diagramId,
                id,
                "failed",
                err instanceof Error ? err.message : String(err)
              )
            await deps.redis
              .del(k.aiPersonalProfile(diagramId, id))
              .catch((cleanupError) =>
                logger.error(
                  { err: cleanupError, diagramId, messageId: id },
                  "personal Room AI context cleanup failed"
                )
              )
            logger.error(
              { err, diagramId, messageId: id },
              "inference termination unconfirmed; slot retained"
            )
            return
          }
          clearTimeout(timer)
          await deps.redis
            .multi()
            .del(k.aiReplicaRequirement(diagramId, id))
            .del(k.aiPersonalProfile(diagramId, id))
            .exec()
            .catch((err) =>
              logger.error({ err, diagramId, messageId: id }, "replica requirement cleanup failed")
            )
          if (!timedOut) {
            await update(diagramId, id, "answered").catch((err) =>
              logger.error(
                { err, diagramId, messageId: id },
                "failed to record completed inference"
              )
            )
          }
          await publishStatus(diagramId, "idle").catch((err) =>
            logger.error({ err, diagramId }, "failed to publish room AI status")
          )
          await releaseConfirmedSlot(diagramId, token, id)
        })().catch((err) =>
          logger.error({ err, diagramId, messageId: id }, "room AI dispatch failed")
        )
        pending.add(work)
        void started.then(() => starting.delete(started))
        roomWork.set(diagramId, work)
        void work.finally(() => {
          pending.delete(work)
          if (roomWork.get(diagramId) === work) roomWork.delete(diagramId)
        })
        return true
      })()
      claiming.add(claim)
      void claim.then(
        () => claiming.delete(claim),
        () => claiming.delete(claim)
      )
      return claim
    },
    async drainRoom(diagramId: string): Promise<void> {
      while (!closed) {
        if (await dispatcher.processRoom(diagramId)) {
          await roomWork.get(diagramId)
        } else if ((await deps.redis.lLen(k.aiQueue(diagramId))) === 0) {
          return
        } else {
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      }
    },
    async waitForIdle(): Promise<void> {
      await Promise.all(pending)
    },
    async close(): Promise<void> {
      closed = true
      await Promise.allSettled(claiming)
      await Promise.all(starting)
    },
  }
  return dispatcher
}
