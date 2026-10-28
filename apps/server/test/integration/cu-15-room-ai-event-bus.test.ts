import { afterEach, describe, expect, it, vi } from "vitest"
import type { RoomAiEvent } from "@umlstudio/core"
import { getRedis } from "../../src/__tests__/setup.js"
import { createRoomAiEventBus } from "../../src/services/room-ai/room-ai-event-bus.js"

describe("Room AI event bus", () => {
  const buses: Array<{ close(): Promise<void> }> = []
  afterEach(async () => {
    await Promise.all(buses.splice(0).map((bus) => bus.close()))
  })

  it("delivers policy updates across instances exactly once", async () => {
    const redis = await getRedis()
    const received: Array<{ room: string; event: RoomAiEvent }> = []
    const first = await createRoomAiEventBus(redis, () => {})
    const second = await createRoomAiEventBus(redis, (room, event) =>
      received.push({ room, event })
    )
    buses.push(first, second)
    const event: RoomAiEvent = {
      type: "policy.updated",
      policy: { enabled: true, allowChanges: true, applyMode: "confirm", proactive: false },
    }
    await first.publish("room-a", event)
    await vi.waitFor(() => expect(received).toEqual([{ room: "room-a", event }]))
  })
})
