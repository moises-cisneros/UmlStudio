import { describe, expect, it, vi } from "vitest"
import type { Redis } from "../../redis.js"
import { createRoomAiService } from "./room-ai-service.js"

function createRedis(evalResult = 1) {
  return {
    exists: vi.fn(async () => 1),
    eval: vi.fn(async () => evalResult),
  } as unknown as Redis
}

const replica = {
  isComplete: () => true,
  getModel: () => ({ id: "room-1", nodes: [], edges: [] }),
}

describe("Room AI service privacy boundary", () => {
  it("returns a private answer without writing chat or publishing a room event", async () => {
    const redis = createRedis()
    const chat = {
      append: vi.fn(),
      update: vi.fn(),
      list: vi.fn(async () => ({ messages: [], hasMore: false })),
    }
    const publish = vi.fn()
    const respondPrivately = vi.fn(
      async ({ onInferenceStart }: { onInferenceStart?: () => void }) => {
        onInferenceStart?.()
        return { text: "User: private answer", provider: "self-hosted" }
      }
    )
    const service = createRoomAiService({
      redis,
      ttlSeconds: 3600,
      maxConcurrency: 1,
      chat: chat as never,
      publish,
      getSharedBoardReplicaAtLeast: () => replica as never,
      respondPrivately,
    })

    const result = await service.postPrivateMessage({
      diagramId: "room-1",
      author: { id: "user-1", email: "user@example.test", name: "User" },
      text: "private question",
      privateContext: "private memory",
      replicaGeneration: "a".repeat(64),
      replicaRevision: 3,
    })

    expect(result.text).toBe("User: private answer")
    expect(chat.append).not.toHaveBeenCalled()
    expect(chat.update).not.toHaveBeenCalled()
    expect(publish).not.toHaveBeenCalled()
    expect(redis.eval).toHaveBeenCalledTimes(2)
    expect(String(vi.mocked(redis.eval).mock.calls[0]?.[0])).toContain("SADD")
    expect(String(vi.mocked(redis.eval).mock.calls[1]?.[0])).toContain("SREM")
  })

  it("retains the inference slot when provider termination is unconfirmed", async () => {
    const redis = createRedis()
    const respondPrivately = vi.fn(
      async ({ onInferenceStart }: { onInferenceStart?: () => void }) => {
        onInferenceStart?.()
        throw new Error("provider connection ended without confirmation")
      }
    )
    const service = createRoomAiService({
      redis,
      ttlSeconds: 3600,
      maxConcurrency: 1,
      getSharedBoardReplicaAtLeast: () => replica as never,
      respondPrivately,
    })

    await expect(
      service.postPrivateMessage({
        diagramId: "room-1",
        author: { id: "user-1", email: "user@example.test", name: "User" },
        text: "private question",
        replicaGeneration: "a".repeat(64),
        replicaRevision: 3,
      })
    ).rejects.toThrow("provider connection ended without confirmation")
    expect(redis.eval).toHaveBeenCalledTimes(1)
    expect(respondPrivately).toHaveBeenCalledOnce()
  })
})
