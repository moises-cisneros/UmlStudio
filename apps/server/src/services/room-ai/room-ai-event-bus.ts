import type { RoomAiEvent } from "@umlstudio/core"
import { k, type Redis } from "../../redis.js"
import { logger } from "../../logger.js"

const CHANNEL = "umlstudio:room-ai:events"
const PUBLISH_STATUS_IF_CURRENT_CLAIM = `
-- room_ai_status_publish_fenced
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
local leaseExpiry = tonumber(redis.call('GET', KEYS[2]))
local redisTime = redis.call('TIME')
local nowMs = tonumber(redisTime[1]) * 1000 + math.floor(tonumber(redisTime[2]) / 1000)
if not leaseExpiry or leaseExpiry <= nowMs then return 0 end
local queueLength = redis.call('LLEN', KEYS[3])
local payload = cjson.encode({
  diagramId = ARGV[3],
  event = { type = 'ai.status', status = ARGV[2], queueLength = queueLength }
})
redis.call('PUBLISH', ARGV[4], payload)
return 1
`

/** Redis fans each event out to the relay attached to every server process. */
export async function createRoomAiEventBus(
  redis: Redis,
  deliver: (diagramId: string, event: RoomAiEvent) => void
) {
  const subscriber = redis.duplicate()
  subscriber.on("error", (err) => logger.error({ err }, "room AI subscriber error"))
  await subscriber.connect()
  try {
    await subscriber.subscribe(CHANNEL, (payload) => {
      try {
        const data = JSON.parse(payload) as { diagramId: string; event: RoomAiEvent }
        if (
          typeof data.diagramId !== "string" ||
          !data.event ||
          typeof data.event.type !== "string"
        ) {
          throw new Error("invalid room AI event")
        }
        deliver(data.diagramId, data.event)
      } catch (err) {
        logger.error({ err }, "invalid room AI event from Redis")
      }
    })
  } catch (err) {
    await subscriber.quit()
    throw err
  }
  return {
    async publish(diagramId: string, event: RoomAiEvent): Promise<void> {
      await redis.publish(CHANNEL, JSON.stringify({ diagramId, event }))
    },
    async publishStatusIfCurrentClaim(
      diagramId: string,
      status: "thinking" | "idle",
      token: string
    ): Promise<boolean> {
      const result = await redis.eval(PUBLISH_STATUS_IF_CURRENT_CLAIM, {
        keys: [k.aiActive(diagramId), k.aiActiveLease(diagramId), k.aiQueue(diagramId)],
        arguments: [token, status, diagramId, CHANNEL],
      })
      return Number(result) === 1
    },
    async close(): Promise<void> {
      await subscriber.unsubscribe(CHANNEL)
      await subscriber.quit()
    },
  }
}
