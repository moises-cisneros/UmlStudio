import { randomUUID } from "node:crypto"
import type { RoomAiEvent, RoomChatMessage } from "@umlstudio/core"
import { logger } from "../../logger.js"
import { k, type Redis } from "../../redis.js"
import { createChatRepository, type RoomAiReplicaRequirement } from "./chat-repository.js"
import {
  ConfirmedInferenceNotStartedError,
  InferenceTerminationUnconfirmedError,
  InferenceNotStartedError,
  type RoomAiDispatchClaimContext,
  runWithRoomAiDispatchClaimContext,
  StaleInferenceClaimError,
} from "./inference-not-started.js"
import {
  DEFAULT_INFERENCE_SLOT_LEASE_MS,
  GLOBAL_LIMIT,
  GLOBAL_SLOTS,
  GLOBAL_SLOT_EXPIRES,
} from "./inference-slots.js"

// Bounded lease expiry with claim-token fencing: abandoned claims recover after leaseMs while stale completions are fenced.
const CLAIM = `
local nowMs = tonumber(ARGV[4])
local leaseMs = tonumber(ARGV[5])
local expiredSlots = redis.call('ZRANGEBYSCORE', KEYS[8], '-inf', nowMs)
for _, tok in ipairs(expiredSlots) do
  redis.call('srem', KEYS[3], tok)
  redis.call('zrem', KEYS[8], tok)
end
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
if redis.call('EXISTS', KEYS[2]) == 1 then
  local leaseExpiry = tonumber(redis.call('GET', KEYS[9]))
  if not leaseExpiry then
    redis.call('SET', KEYS[9], tostring(nowMs + leaseMs), 'EX', ARGV[3])
    return false
  end
  if leaseExpiry > nowMs then
    return false
  end
  local oldToken = redis.call('GET', KEYS[2])
  if oldToken then
    redis.call('srem', KEYS[3], oldToken)
    redis.call('zrem', KEYS[8], oldToken)
  end
  redis.call('DEL', KEYS[2], KEYS[9])
  local activeId = redis.call('GET', KEYS[7])
  redis.call('DEL', KEYS[7])
  if activeId then
    local items = redis.call('LRANGE', KEYS[5], 0, -1)
    local foundInChat = false
    local stillQueued = false
    for _, raw in ipairs(items) do
      local ok, message = pcall(cjson.decode, raw)
      if ok and type(message) == 'table' and message.id == activeId then
        foundInChat = true
        if message.status == 'queued' then
          stillQueued = true
        end
        break
      end
    end
    if stillQueued or not foundInChat then
      local headId = redis.call('LINDEX', KEYS[1], 0)
      if headId ~= activeId then
        redis.call('LPUSH', KEYS[1], activeId)
      end
      redis.call('SET', KEYS[6], '1', 'EX', ARGV[3])
      redis.call('EXPIRE', KEYS[1], ARGV[3])
    end
  end
end
local count = redis.call('SCARD', KEYS[3])
local limit = redis.call('GET', KEYS[4])
if count == 0 then redis.call('SET', KEYS[4], ARGV[2])
elseif not limit or tonumber(limit) ~= tonumber(ARGV[2]) then return -1 end
if count >= tonumber(ARGV[2]) then return false end
local id = redis.call('LPOP', KEYS[1])
if not id then return false end
redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[3])
redis.call('SET', KEYS[9], tostring(nowMs + leaseMs), 'EX', ARGV[3])
redis.call('SET', KEYS[7], id, 'EX', ARGV[3])
redis.call('SET', KEYS[6], '1', 'EX', ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[3])
redis.call('SADD', KEYS[3], ARGV[1])
redis.call('ZADD', KEYS[8], nowMs + leaseMs, ARGV[1])
return id
`
const RELEASE = `
redis.call('SREM', KEYS[2], ARGV[1])
redis.call('ZREM', KEYS[4], ARGV[1])
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1])
redis.call('DEL', KEYS[3])
redis.call('DEL', KEYS[5])
return 1
`
const CHECK_CLAIM = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
local leaseExpiry = tonumber(redis.call('GET', KEYS[2]))
if leaseExpiry and leaseExpiry <= tonumber(ARGV[2]) then return 0 end
return 1
`
const CLEANUP_SIDECARS = `
-- room_ai_sidecar_cleanup
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
local leaseExpiry = tonumber(redis.call('GET', KEYS[2]))
local redisTime = redis.call('TIME')
local nowMs = tonumber(redisTime[1]) * 1000 + math.floor(tonumber(redisTime[2]) / 1000)
if not leaseExpiry or leaseExpiry <= nowMs then return 0 end
if ARGV[2] == '1' then redis.call('DEL', KEYS[3]) end
redis.call('DEL', KEYS[4])
return 1
`

type FailedMessage = RoomChatMessage & { failureReason?: string }
type DispatchBlockedReason = "room_lock_held" | "global_capacity_full" | "claim_unavailable"

const ROOM_AI_QUEUE_CAPACITY = 5

function isRoomAiDevLoggingEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false
  const raw = (process.env.ROOM_AI_DEV_LOGS ?? "").trim().toLowerCase()
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on"
}

interface DispatcherDeps {
  redis: Redis
  maxConcurrency: number
  timeoutMs?: number
  claimLeaseMs?: number
  ttlSeconds?: number
  /** Resolve only after the provider confirms the inference has terminated. */
  infer: (
    diagramId: string,
    messageId: string,
    replica: RoomAiReplicaRequirement,
    claimContext?: RoomAiDispatchClaimContext
  ) => Promise<void>
  getReplicaRequirement: (
    diagramId: string,
    messageId: string
  ) => Promise<RoomAiReplicaRequirement | undefined>
  publish?: (diagramId: string, event: RoomAiEvent) => void | Promise<void>
  publishStatusIfCurrentClaim?: (
    diagramId: string,
    status: "thinking" | "idle",
    token: string
  ) => Promise<boolean>
}

export function createRoomAiDispatcher(deps: DispatcherDeps) {
  if (!Number.isInteger(deps.maxConcurrency) || deps.maxConcurrency < 1) {
    throw new Error("maxConcurrency must be a positive integer")
  }
  const claimLeaseMs = deps.claimLeaseMs ?? DEFAULT_INFERENCE_SLOT_LEASE_MS
  if (!Number.isInteger(claimLeaseMs) || claimLeaseMs < 1) {
    throw new Error("claimLeaseMs must be a positive integer")
  }
  const chat = createChatRepository<FailedMessage>(deps.redis, deps.ttlSeconds ?? 120 * 86400)
  const pending = new Set<Promise<void>>()
  const claiming = new Set<Promise<boolean>>()
  const starting = new Set<Promise<void>>()
  const roomWork = new Map<string, Promise<void>>()
  const blockedDispatchReasonByRoom = new Map<string, DispatchBlockedReason>()
  let closed = false
  const activeKey = k.aiActive

  async function logDispatchBlockedIfQueueNonEmpty(diagramId: string): Promise<void> {
    if (!isRoomAiDevLoggingEnabled()) return
    try {
      const queueDepth = await deps.redis.lLen(k.aiQueue(diagramId))
      if (typeof queueDepth !== "number" || !Number.isFinite(queueDepth) || queueDepth <= 0) {
        blockedDispatchReasonByRoom.delete(diagramId)
        return
      }
      const roomLockPresent = Number(await deps.redis.exists(activeKey(diagramId))) > 0
      const usedRaw = await deps.redis.sCard(GLOBAL_SLOTS)
      const globalSlotsUsed =
        typeof usedRaw === "number" && Number.isFinite(usedRaw) && usedRaw >= 0 ? usedRaw : 0
      const rawLimit =
        typeof deps.redis.get === "function" ? await deps.redis.get(GLOBAL_LIMIT) : null
      const globalSlotsLimit =
        typeof rawLimit === "string" && /^[1-9]\d*$/.test(rawLimit.trim())
          ? Number(rawLimit.trim())
          : deps.maxConcurrency
      const reason: DispatchBlockedReason = roomLockPresent
        ? "room_lock_held"
        : globalSlotsUsed >= globalSlotsLimit
          ? "global_capacity_full"
          : "claim_unavailable"
      if (blockedDispatchReasonByRoom.get(diagramId) === reason) {
        return
      }
      blockedDispatchReasonByRoom.set(diagramId, reason)
      // eslint-disable-next-line no-console -- concise local Room AI diagnostic behind ROOM_AI_DEV_LOGS.
      console.log(
        [
          `\n${"=".repeat(24)} [ROOM AI: DISPATCH BLOCKED] ${"=".repeat(24)}`,
          `  * Reason: ${reason}`,
          `  * Queue depth: ${queueDepth} / ${ROOM_AI_QUEUE_CAPACITY}`,
          `  * Room active lock: ${roomLockPresent ? "present" : "absent"}`,
          `  * Global inference slots: ${globalSlotsUsed} / ${globalSlotsLimit}`,
          `${"=".repeat(77)}\n`,
        ].join("\n")
      )
    } catch {
      // Diagnostic observation must never alter dispatch behavior.
    }
  }

  async function isCurrentClaim(diagramId: string, token: string): Promise<boolean> {
    const res = await deps.redis.eval(CHECK_CLAIM, {
      keys: [activeKey(diagramId), k.aiActiveLease(diagramId)],
      arguments: [token, String(Date.now())],
    })
    return Number(res) === 1
  }

  async function cleanupSidecars(
    diagramId: string,
    messageId: string,
    token: string,
    removeReplicaRequirement: boolean
  ): Promise<boolean> {
    const result = await deps.redis.eval(CLEANUP_SIDECARS, {
      keys: [
        activeKey(diagramId),
        k.aiActiveLease(diagramId),
        k.aiReplicaRequirement(diagramId, messageId),
        k.aiPersonalProfile(diagramId, messageId),
      ],
      arguments: [token, removeReplicaRequirement ? "1" : "0"],
    })
    return Number(result) === 1
  }

  async function publishStatus(diagramId: string, status: "thinking" | "idle", token?: string) {
    if (token && deps.publishStatusIfCurrentClaim) {
      await deps.publishStatusIfCurrentClaim(diagramId, status, token)
      return
    }
    if (!deps.publish) return
    if (token && !(await isCurrentClaim(diagramId, token))) return
    const queueLength = await deps.redis.lLen(k.aiQueue(diagramId))
    if (token && !(await isCurrentClaim(diagramId, token))) return
    await deps.publish(diagramId, { type: "ai.status", status, queueLength })
  }

  async function update(
    diagramId: string,
    id: string,
    status: "answered" | "failed",
    reason?: string,
    token?: string
  ) {
    if (token && !(await isCurrentClaim(diagramId, token))) return
    const { messages } = await chat.list(diagramId, { limit: 200 })
    const message = messages.find((item) => item.id === id)
    if (!message) throw new Error(`queued message ${id} not found`)
    if (token && !(await isCurrentClaim(diagramId, token))) return
    const updated: FailedMessage = {
      ...message,
      status,
      ...(reason ? { failureReason: reason } : {}),
    }
    const performUpdate = () => chat.update(diagramId, updated)
    let didUpdate: boolean
    if (token) {
      try {
        didUpdate = await runWithRoomAiDispatchClaimContext(
          {
            claimToken: token,
            async assertCurrentClaim(): Promise<void> {
              if (!(await isCurrentClaim(diagramId, token))) {
                throw new StaleInferenceClaimError()
              }
            },
          },
          performUpdate
        )
      } catch (err) {
        if (err instanceof StaleInferenceClaimError) return
        throw err
      }
    } else {
      didUpdate = await performUpdate()
    }
    if (!didUpdate) throw new Error(`queued message ${id} not found`)
    if (token && !(await isCurrentClaim(diagramId, token))) return
    await deps.publish?.(diagramId, { type: "message.updated", message: updated })
  }

  async function releaseConfirmedSlot(diagramId: string, token: string, id: string): Promise<void> {
    let retryDelayMs = 100
    while (true) {
      try {
        await deps.redis.eval(RELEASE, {
          keys: [
            activeKey(diagramId),
            GLOBAL_SLOTS,
            k.aiActiveMessage(diagramId),
            GLOBAL_SLOT_EXPIRES,
            k.aiActiveLease(diagramId),
          ],
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
            GLOBAL_SLOT_EXPIRES,
            k.aiActiveLease(diagramId),
          ],
          arguments: [
            token,
            String(deps.maxConcurrency),
            String(deps.ttlSeconds ?? 120 * 86400),
            String(Date.now()),
            String(claimLeaseMs),
          ],
        })
        if (result === -1) throw new Error("inconsistent AI_MAX_CONCURRENCY across instances")
        if (typeof result !== "string") {
          await logDispatchBlockedIfQueueNonEmpty(diagramId)
          return false
        }
        blockedDispatchReasonByRoom.delete(diagramId)
        const id = result
        const claimContext: RoomAiDispatchClaimContext = {
          claimToken: token,
          async assertCurrentClaim(): Promise<void> {
            if (!(await isCurrentClaim(diagramId, token))) {
              throw new StaleInferenceClaimError()
            }
          },
        }
        let markStarted!: () => void
        const started = new Promise<void>((resolve) => {
          markStarted = resolve
        })
        starting.add(started)
        const work = (async () => {
          logger.info(
            { event: "room_ai.dispatch.claimed", diagramId, messageId: id },
            "room AI message claimed for dispatch"
          )
          await publishStatus(diagramId, "thinking", token).catch((err) =>
            logger.error({ err, diagramId }, "failed to publish room AI status")
          )
          let timedOut = false
          const timer = setTimeout(() => {
            timedOut = true
            void update(diagramId, id, "failed", "Inference timed out", token).catch((err) =>
              logger.error({ err, diagramId, messageId: id }, "failed to mark timed out inference")
            )
          }, deps.timeoutMs ?? 90_000)
          timer.unref?.()
          try {
            const replica = await deps.getReplicaRequirement(diagramId, id)
            if (!replica) {
              throw new InferenceNotStartedError(
                "shared board synchronization metadata is unavailable",
                {
                  stage: "dispatch_replica_requirement",
                  reasonCode: "replica_requirement_unavailable",
                }
              )
            }
            markStarted()
            await runWithRoomAiDispatchClaimContext(claimContext, () =>
              deps.infer(diagramId, id, replica)
            )
          } catch (err) {
            markStarted()
            clearTimeout(timer)
            if (
              err instanceof StaleInferenceClaimError ||
              !(await isCurrentClaim(diagramId, token))
            ) {
              logger.warn(
                {
                  event: "room_ai.dispatch.stale_claim_fenced",
                  diagramId,
                  messageId: id,
                },
                "fenced stale Room AI dispatch completion after claim recovery"
              )
              await releaseConfirmedSlot(diagramId, token, id)
              return
            }
            if (err instanceof InferenceNotStartedError) {
              logger.warn(
                {
                  event: "room_ai.dispatch.inference_not_started",
                  diagramId,
                  messageId: id,
                  stage: err.stage,
                  reasonCode: err.reasonCode,
                  ...(err.upstreamStatus !== undefined
                    ? { upstreamStatus: err.upstreamStatus }
                    : {}),
                  confirmedNotStarted: err instanceof ConfirmedInferenceNotStartedError,
                  errorName: err.name,
                  timedOut,
                },
                "room AI inference not started; marked Inference unavailable"
              )
              try {
                if (!timedOut) await update(diagramId, id, "failed", "Inference unavailable", token)
                if (await isCurrentClaim(diagramId, token)) {
                  await cleanupSidecars(diagramId, id, token, true)
                  await publishStatus(diagramId, "idle", token)
                }
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
                err instanceof Error ? err.message : String(err),
                token
              )
            if (await isCurrentClaim(diagramId, token)) {
              await cleanupSidecars(diagramId, id, token, false).catch((cleanupError) =>
                logger.error(
                  { err: cleanupError, diagramId, messageId: id },
                  "personal Room AI context cleanup failed"
                )
              )
            }
            const diagnostic =
              err instanceof InferenceTerminationUnconfirmedError
                ? err.diagnostic
                : { stage: "dispatcher", reasonCode: "unclassified_error" }
            const upstreamStatus =
              "upstreamStatus" in diagnostic && typeof diagnostic.upstreamStatus === "number"
                ? diagnostic.upstreamStatus
                : undefined
            const transportErrorName =
              "transportErrorName" in diagnostic &&
              typeof diagnostic.transportErrorName === "string"
                ? diagnostic.transportErrorName
                : undefined
            const summary =
              upstreamStatus !== undefined
                ? `Room AI downstream returned HTTP ${upstreamStatus}; inference termination is unconfirmed, so the slot remains reserved.`
                : transportErrorName
                  ? `Room AI downstream transport failed (${transportErrorName}); inference termination is unconfirmed, so the slot remains reserved.`
                  : `Room AI inference termination is unconfirmed at ${diagnostic.stage} (${diagnostic.reasonCode}); the slot remains reserved.`
            logger.error(
              {
                err,
                event: "room_ai.inference.termination_unconfirmed",
                diagramId,
                messageId: id,
                ...diagnostic,
              },
              summary
            )
            return
          }
          clearTimeout(timer)
          if (!(await isCurrentClaim(diagramId, token))) {
            logger.warn(
              {
                event: "room_ai.dispatch.stale_claim_fenced",
                diagramId,
                messageId: id,
              },
              "fenced stale Room AI dispatch completion after claim recovery"
            )
            await releaseConfirmedSlot(diagramId, token, id)
            return
          }
          await cleanupSidecars(diagramId, id, token, true).catch((err) =>
            logger.error({ err, diagramId, messageId: id }, "replica requirement cleanup failed")
          )
          if (!timedOut) {
            await update(diagramId, id, "answered", undefined, token).catch((err) =>
              logger.error(
                { err, diagramId, messageId: id },
                "failed to record completed inference"
              )
            )
          }
          await publishStatus(diagramId, "idle", token).catch((err) =>
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
