import type { RoomAiEvent } from "@umlstudio/core"
import type { Redis } from "../../redis.js"
import { logger } from "../../logger.js"

const CHANNEL = "umlstudio:room-ai:events"

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
    async close(): Promise<void> {
      await subscriber.unsubscribe(CHANNEL)
      await subscriber.quit()
    },
  }
}
