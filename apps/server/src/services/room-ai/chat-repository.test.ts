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
      enqueueChatMessage<ChatRecord>(redis, "room-1", { id: "message-1" }, 3600, replica, {
        requesterId: "user-1",
        teachingProfile: null,
        revision: null,
      })
    ).resolves.toEqual({ position: 1, active: false })
    expect(evalScript).toHaveBeenCalledOnce()
  })

  it("stores only an approved profile and opaque revision in a short-lived sidecar", async () => {
    const evalScript = vi.fn(async () => [1, 0])
    const redis = { eval: evalScript } as unknown as Redis
    const replica: RoomAiReplicaRequirement = { generation: "a".repeat(64), revision: 3 }
    const teachingProfile = { detailLevel: "balanced" as const, exampleStyle: "analogy" as const }
    const revision = "11111111-1111-4111-8111-111111111111"
    const message = {
      id: "message-1",
      author: { id: "user-1", name: "Ada", kind: "user" },
      text: "Explain this diagram",
    }

    await enqueueChatMessage(redis, "room-1", message, 3600, replica, {
      requesterId: "user-1",
      teachingProfile,
      revision,
    })

    const [script, options] = evalScript.mock.calls[0]
    expect(options.keys).toHaveLength(7)
    expect(options.keys[6]).toContain("personal-profile")
    expect(script).toContain("KEYS[7]")
    expect(options.arguments[1]).not.toContain(JSON.stringify(teachingProfile))
    expect(options.arguments[5]).toBe(
      JSON.stringify({ requesterId: "user-1", teachingProfile, revision })
    )
    expect(options.arguments[4]).toBe("900")
  })
})
