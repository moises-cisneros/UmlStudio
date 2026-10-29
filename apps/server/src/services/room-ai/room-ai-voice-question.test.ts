import { describe, expect, it, vi } from "vitest"
import type { AuthProfile } from "../auth-service.js"
import type { RoomAiReplicaRequirement } from "./chat-repository.js"
import {
  createRoomAiVoiceQuestionService,
  RoomAiVoiceQuestionUnclearError,
} from "./room-ai-voice-question.js"

const author = { id: "user-1", email: "user@example.test", name: "Juan" } as AuthProfile
const replica: RoomAiReplicaRequirement = { generation: "a".repeat(64), revision: 7 }

describe("Room AI voice question service", () => {
  it("transcribes audio and queues the transcript as the authenticated author's public ask", async () => {
    const transcribe = vi.fn(async () => ({
      text: "  What classes are on the board?  ",
      confidence: 0.9,
    }))
    const postMessage = vi.fn(async () => ({ messageId: "message-1", queuePosition: 1 }))
    const service = createRoomAiVoiceQuestionService({ transcribe, postMessage })
    const bytes = new Uint8Array([1, 2, 3])

    const result = await service({
      diagramId: "diagram-1",
      author,
      bytes,
      filename: "voice.webm",
      contentType: "audio/webm",
      replica,
      teachingProfile: { detailLevel: "concise", exampleStyle: "uml" },
      profileRevision: "11111111-1111-4111-8111-111111111111",
    })

    expect(transcribe).toHaveBeenCalledWith({
      bytes,
      filename: "voice.webm",
      contentType: "audio/webm",
    })
    expect(postMessage).toHaveBeenCalledWith({
      diagramId: "diagram-1",
      author,
      text: "What classes are on the board?",
      intent: "ask",
      replica,
      teachingProfile: { detailLevel: "concise", exampleStyle: "uml" },
      profileRevision: "11111111-1111-4111-8111-111111111111",
    })
    expect(result).toEqual({ messageId: "message-1", queuePosition: 1 })
  })

  it("does not publish empty or low-confidence audio as a Room question", async () => {
    const transcribe = vi.fn(async () => ({ text: "background noise", confidence: 0.1 }))
    const postMessage = vi.fn()
    const service = createRoomAiVoiceQuestionService({ transcribe, postMessage })

    await expect(
      service({
        diagramId: "diagram-1",
        author,
        bytes: new Uint8Array([1]),
        filename: "voice.webm",
        contentType: "audio/webm",
        replica,
      })
    ).rejects.toBeInstanceOf(RoomAiVoiceQuestionUnclearError)
    expect(postMessage).not.toHaveBeenCalled()
  })

  it("does not enqueue transcripts beyond the existing Room message limit", async () => {
    const transcribe = vi.fn(async () => ({ text: "x".repeat(4001), confidence: 0.9 }))
    const postMessage = vi.fn()
    const service = createRoomAiVoiceQuestionService({ transcribe, postMessage })

    await expect(
      service({
        diagramId: "diagram-1",
        author,
        bytes: new Uint8Array([1]),
        filename: "voice.webm",
        contentType: "audio/webm",
        replica,
      })
    ).rejects.toThrow("Room message is too long")
    expect(postMessage).not.toHaveBeenCalled()
  })
})
