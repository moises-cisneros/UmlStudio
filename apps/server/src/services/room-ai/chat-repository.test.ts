import { describe, expect, it, vi } from "vitest"
import type { Redis } from "../../redis.js"
import {
  enqueueChatMessage,
  type ChatRecord,
  type RoomAiReplicaRequirement,
} from "./chat-repository.js"

describe("Room AI chat queue script", () => {
  it("references only the Redis keys supplied by the enqueue caller", async () => {
    const evalScript = vi.fn(
      async (script: string, options: { keys: string[]; arguments: string[] }) => {
        const indices = Array.from(script.matchAll(/\bKEYS\[(\d+)\]/g), (match) => Number(match[1]))
        const largestIndex = Math.max(...indices)
        if (largestIndex > options.keys.length) {
          throw new Error(
            `enqueue script references KEYS[${largestIndex}] with ${options.keys.length} keys`
          )
        }
        return [1, 0]
      }
    )
    const redis = { eval: evalScript } as unknown as Redis
    const replica: RoomAiReplicaRequirement = { generation: "a".repeat(64), revision: 3 }

    await expect(
      enqueueChatMessage<ChatRecord>(redis, "room-1", { id: "message-1" }, 3600, replica)
    ).resolves.toEqual({ position: 1, active: false })
    expect(evalScript).toHaveBeenCalledOnce()
  })
})
