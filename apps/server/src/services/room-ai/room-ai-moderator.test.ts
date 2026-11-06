import { describe, expect, it, vi } from "vitest"
import type { RoomAiPolicy, RoomChatMessage, UMLModel } from "@umlstudio/core"
import { createRoomAiModerator, runLocalSolidAudit } from "./room-ai-moderator.js"
import type { BoardReplica } from "./board-replica.js"
import type { AuthorshipRepository } from "./authorship-repository.js"
import type { ChatRepository } from "./chat-repository.js"

describe("RoomAiModerator (CU-15 FA-07 / RF-62 / Backlog E6-01)", () => {
  function makeSampleModel(classWithViolation = true): UMLModel {
    return {
      id: "diag-1",
      title: "Test Diagram",
      version: "4.0.0",
      type: "ClassDiagram",
      nodes: [
        {
          id: "node-god-class",
          type: "umlClass",
          position: { x: 0, y: 0 },
          data: {
            name: "GodClass",
            type: "Class",
            methods: classWithViolation
              ? ["m1()", "m2()", "m3()", "m4()", "m5()", "m6()", "m7()", "m8()"]
              : ["m1()"],
            attributes: classWithViolation ? ["a1", "a2", "a3", "a4", "a5", "a6"] : ["a1"],
          },
        },
      ],
      edges: [],
    }
  }

  function setupModerator(
    overrides: {
      policy?: Partial<RoomAiPolicy>
      authorshipMap?: Record<string, string>
      profiles?: Record<string, { name: string }>
      model?: UMLModel
      inactivityDelayMs?: number
      rateLimitMs?: number
      now?: () => number
    } = {}
  ) {
    const policy: RoomAiPolicy = {
      enabled: true,
      allowChanges: true,
      applyMode: "confirm",
      proactive: true,
      ...overrides.policy,
    }

    const currentModel = overrides.model ?? makeSampleModel(true)

    const replica: BoardReplica = {
      roomId: "diag-1",
      generation: "gen-1",
      getModel: () => currentModel,
      getRevision: () => 1,
      isComplete: () => true,
      applyFrame: () => true,
      destroy: vi.fn(),
    }

    const authorship: AuthorshipRepository = {
      record: vi.fn().mockResolvedValue(undefined),
      getAll: vi
        .fn()
        .mockResolvedValue(overrides.authorshipMap ?? { "node-god-class": "user-alice" }),
    }

    const appendedMessages: RoomChatMessage[] = []
    const chat: ChatRepository<RoomChatMessage> = {
      append: vi.fn().mockImplementation(async (_diagramId, msg) => {
        appendedMessages.push(msg)
      }),
      update: vi.fn().mockResolvedValue(true),
      commitAnswer: vi.fn().mockResolvedValue(true),
      list: vi.fn().mockResolvedValue({ messages: appendedMessages, hasMore: false }),
    }

    const publishedEvents: unknown[] = []
    const publish = vi.fn().mockImplementation((_diagramId, event) => {
      publishedEvents.push(event)
    })

    const profiles = overrides.profiles ?? {
      "user-alice": { name: "Alice" },
    }

    const resolveUserProfile = vi.fn().mockImplementation(async (userId: string) => {
      return profiles[userId]
    })

    const moderator = createRoomAiModerator({
      getPolicy: vi.fn().mockResolvedValue(policy),
      getBoardReplica: () => replica,
      authorship,
      resolveUserProfile,
      chat,
      publish,
      inactivityDelayMs: overrides.inactivityDelayMs ?? 20_000,
      rateLimitMs: overrides.rateLimitMs ?? 120_000,
      now: overrides.now,
    })

    return {
      moderator,
      appendedMessages,
      publishedEvents,
      authorship,
      resolveUserProfile,
      chat,
      publish,
    }
  }

  it("runLocalSolidAudit detects SRP/God Class violation", () => {
    const model = makeSampleModel(true)
    const result = runLocalSolidAudit(model)
    expect(result.violations.length).toBe(1)
    expect(result.violations[0].element_name).toBe("GodClass")
    expect(result.violations[0].principle).toContain("Single Responsibility Principle")
  })

  it("disabled when proactive is false", async () => {
    const { moderator, appendedMessages, publish } = setupModerator({
      policy: { proactive: false },
    })

    const result = await moderator.triggerAudit("diag-1")
    expect(result).toBeUndefined()
    expect(appendedMessages.length).toBe(0)
    expect(publish).not.toHaveBeenCalled()
  })

  it("disabled when policy.enabled is false", async () => {
    const { moderator, appendedMessages, publish } = setupModerator({
      policy: { enabled: false, proactive: true },
    })

    const result = await moderator.triggerAudit("diag-1")
    expect(result).toBeUndefined()
    expect(appendedMessages.length).toBe(0)
    expect(publish).not.toHaveBeenCalled()
  })

  it("publishes remark addressed to the author", async () => {
    const { moderator, appendedMessages, publish } = setupModerator({
      authorshipMap: { "node-god-class": "user-alice" },
      profiles: { "user-alice": { name: "Alice" } },
    })

    const msg = await moderator.triggerAudit("diag-1")
    expect(msg).toBeDefined()
    expect(msg?.author.kind).toBe("ai")
    expect(msg?.text).toContain("@Alice:")
    expect(msg?.text).toContain("GodClass")
    expect(appendedMessages.length).toBe(1)
    expect(publish).toHaveBeenCalledWith("diag-1", {
      type: "message.created",
      message: msg,
    })
  })

  it("rate limits remarks to at most one every 2 minutes", async () => {
    let fakeTime = 1_000_000
    const now = () => fakeTime

    const { moderator, appendedMessages } = setupModerator({
      now,
      rateLimitMs: 120_000,
    })

    // First remark succeeds
    const firstMsg = await moderator.triggerAudit("diag-1")
    expect(firstMsg).toBeDefined()
    expect(appendedMessages.length).toBe(1)

    // Second remark at 60s is suppressed by rate limit
    fakeTime += 60_000
    const secondMsg = await moderator.triggerAudit("diag-1")
    expect(secondMsg).toBeUndefined()
    expect(appendedMessages.length).toBe(1)

    // Third remark at 121s succeeds
    fakeTime += 61_000
    const thirdMsg = await moderator.triggerAudit("diag-1")
    expect(thirdMsg).toBeDefined()
    expect(appendedMessages.length).toBe(2)
  })

  it("triggers audit after inactivity delay following board change", async () => {
    vi.useFakeTimers()
    try {
      const { moderator, appendedMessages } = setupModerator({
        inactivityDelayMs: 20_000,
      })

      moderator.onBoardChanged("diag-1")
      expect(appendedMessages.length).toBe(0)

      // Advance by 19 seconds: not yet triggered
      vi.advanceTimersByTime(19_000)
      expect(appendedMessages.length).toBe(0)

      // Another change resets the timer
      moderator.onBoardChanged("diag-1")
      vi.advanceTimersByTime(10_000)
      expect(appendedMessages.length).toBe(0)

      // Advance remaining 10 seconds: now total 20s from second change
      await vi.advanceTimersByTimeAsync(10_000)
      expect(appendedMessages.length).toBe(1)
      expect(appendedMessages[0].text).toContain("@Alice:")
    } finally {
      vi.useRealTimers()
    }
  })
})
