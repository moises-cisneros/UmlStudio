import { z } from "zod"
import type { RoomAiPolicy } from "@umlstudio/core"
import { k, type Redis } from "../../redis.js"

export const DEFAULT_ROOM_AI_POLICY: RoomAiPolicy = {
  enabled: true,
  allowChanges: false,
  applyMode: "confirm",
  proactive: false,
}

export const RoomAiPolicySchema = z
  .object({
    enabled: z.boolean(),
    allowChanges: z.boolean(),
    applyMode: z.enum(["confirm", "auto"]),
    proactive: z.boolean(),
  })
  .strict()

function deserializePolicy(fields: Record<string, string>): RoomAiPolicy | null {
  if (Object.keys(fields).length === 0) return null
  const toBoolean = (value: string | undefined): boolean | undefined => {
    if (value === "true") return true
    if (value === "false") return false
    return undefined
  }
  const parsed = RoomAiPolicySchema.safeParse({
    enabled: toBoolean(fields.enabled),
    allowChanges: toBoolean(fields.allowChanges),
    applyMode: fields.applyMode,
    proactive: toBoolean(fields.proactive),
  })
  return parsed.success ? parsed.data : null
}

export function createRoomAiPolicyRepository(redis: Redis, ttlSeconds: number) {
  return {
    async get(diagramId: string): Promise<RoomAiPolicy> {
      return deserializePolicy(await redis.hGetAll(k.aiPolicy(diagramId))) ?? DEFAULT_ROOM_AI_POLICY
    },

    async set(diagramId: string, rawPolicy: RoomAiPolicy): Promise<RoomAiPolicy> {
      const policy = RoomAiPolicySchema.parse(rawPolicy)
      const multi = redis.multi()
      multi.hSet(k.aiPolicy(diagramId), {
        enabled: String(policy.enabled),
        allowChanges: String(policy.allowChanges),
        applyMode: policy.applyMode,
        proactive: String(policy.proactive),
      })
      multi.expire(k.aiPolicy(diagramId), ttlSeconds)
      await multi.exec()
      return policy
    },
  }
}

export type RoomAiPolicyRepository = ReturnType<typeof createRoomAiPolicyRepository>
