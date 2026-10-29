import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { RoomChatMessage } from "@umlstudio/core"
import { RoomChatPanelContainer } from "./RoomChatPanelContainer"

const mocks = vi.hoisted(() => ({
  useRoomAi: vi.fn(),
  useAuthStore: vi.fn(),
  useEditorContext: vi.fn(),
  readPersonalRoomProfile: vi.fn(),
  writePersonalRoomProfile: vi.fn(),
  getPersonalProfileRevision: vi.fn(),
  sendSharedMessage: vi.fn(),
  sendVoiceMessage: vi.fn(),
  flushSharedReplica: vi.fn(),
  useVoiceRecorder: vi.fn(),
  cancelRecording: vi.fn(),
  resetRecording: vi.fn(),
}))

vi.mock("@/queries/roomAiQueries", () => ({ useRoomAi: mocks.useRoomAi }))
vi.mock("@/hooks/useVoiceRecorder", () => ({ useVoiceRecorder: mocks.useVoiceRecorder }))
vi.mock("@/stores/useAuthStore", () => ({ useAuthStore: mocks.useAuthStore }))
vi.mock("@/contexts", () => ({ useEditorContext: mocks.useEditorContext }))
vi.mock("@/services/personalRoomMemory", () => ({
  readPersonalRoomProfile: mocks.readPersonalRoomProfile,
  writePersonalRoomProfile: mocks.writePersonalRoomProfile,
}))

const sharedMessage: RoomChatMessage = {
  id: "shared-1",
  diagramId: "diagram-1",
  author: { id: "collaborator", name: "Collaborator", kind: "user" },
  text: "Shared room message",
  createdAt: "2026-10-28T00:00:00.000Z",
}

const initialProfile = { detailLevel: "balanced", exampleStyle: "none" } as const
const currentRevision = "11111111-1111-4111-8111-111111111111"
const updatedProfile = { detailLevel: "concise", exampleStyle: "analogy" } as const
const updatedRevision = "22222222-2222-4222-8222-222222222222"

describe("RoomChatPanelContainer hidden teaching profile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useAuthStore.mockImplementation((selector) =>
      selector({ user: { id: "user-1", name: "User" } })
    )
    mocks.useEditorContext.mockReturnValue({ flushSharedReplica: mocks.flushSharedReplica })
    mocks.flushSharedReplica.mockResolvedValue({ generation: "a".repeat(64), revision: 3 })
    mocks.readPersonalRoomProfile.mockResolvedValue(null)
    mocks.writePersonalRoomProfile.mockResolvedValue(undefined)
    mocks.getPersonalProfileRevision.mockResolvedValue(currentRevision)
    mocks.sendVoiceMessage.mockResolvedValue({ messageId: "voice-1", queuePosition: 1 })
    mocks.sendSharedMessage.mockResolvedValue({
      messageId: "message-1",
      queuePosition: 1,
      profileUpdate: { profile: updatedProfile, revision: updatedRevision },
    })
    mocks.useVoiceRecorder.mockReturnValue({
      status: "idle",
      elapsed: 0,
      audioBlob: null,
      audioUrl: null,
      hasSupport: false,
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
      cancelRecording: mocks.cancelRecording,
      resetRecording: mocks.resetRecording,
    })
    mocks.useRoomAi.mockReturnValue({
      messages: [sharedMessage],
      isLoading: false,
      loadError: null,
      aiStatus: { status: "idle", queueLength: 0 },
      sendMessage: mocks.sendSharedMessage,
      sendVoiceMessage: mocks.sendVoiceMessage,
      getPersonalProfileRevision: mocks.getPersonalProfileRevision,
      isSendingVoice: false,
      sendVoiceError: null,
      sendError: null,
      isSending: false,
    })
  })

  it("does not render a profile or memory management panel", async () => {
    render(<RoomChatPanelContainer diagramId="diagram-1" />)
    await waitFor(() =>
      expect(mocks.readPersonalRoomProfile).toHaveBeenCalledWith("user-1", "diagram-1")
    )

    expect(screen.queryByLabelText(/personal memory/i)).toBeNull()
    expect(screen.queryByRole("button", { name: /memory|profile|pin/i })).toBeNull()
    expect(screen.getByText("Shared room message")).toBeTruthy()
  })

  it("learns automatically from a typed public interaction and saves only the closed result locally", async () => {
    const user = userEvent.setup()
    render(<RoomChatPanelContainer diagramId="diagram-1" />)
    await waitFor(() => expect(mocks.getPersonalProfileRevision).toHaveBeenCalled())
    await user.type(screen.getByPlaceholderText("Ask the AI about this diagram..."), "Explain this")
    await user.click(screen.getByRole("button", { name: "Send" }))

    await waitFor(() =>
      expect(mocks.sendSharedMessage).toHaveBeenCalledWith({
        text: "Explain this",
        teachingProfile: initialProfile,
        profileRevision: currentRevision,
      })
    )
    await waitFor(() =>
      expect(mocks.writePersonalRoomProfile).toHaveBeenCalledWith("user-1", "diagram-1", {
        profile: updatedProfile,
        revision: updatedRevision,
      })
    )
    expect(JSON.stringify(mocks.sendSharedMessage.mock.calls)).not.toContain("personal notes")
  })

  it("keeps the saved profile when automatic learning fails", async () => {
    mocks.readPersonalRoomProfile.mockResolvedValue({
      profile: updatedProfile,
      revision: currentRevision,
    })
    mocks.sendSharedMessage.mockResolvedValue({
      messageId: "message-1",
      queuePosition: 1,
      profileLearningFailed: true,
    })
    const user = userEvent.setup()
    render(<RoomChatPanelContainer diagramId="diagram-1" />)
    await waitFor(() => expect(mocks.readPersonalRoomProfile).toHaveBeenCalled())
    await user.type(screen.getByPlaceholderText("Ask the AI about this diagram..."), "Explain this")
    await user.click(screen.getByRole("button", { name: "Send" }))

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy())
    expect(mocks.writePersonalRoomProfile).not.toHaveBeenCalled()
    expect(mocks.sendSharedMessage).toHaveBeenCalledWith({
      text: "Explain this",
      teachingProfile: updatedProfile,
      profileRevision: currentRevision,
    })
  })

  it("uses the same hidden learning path after voice transcription", async () => {
    const audio = new Blob(["voice"], { type: "audio/webm" })
    mocks.useVoiceRecorder.mockReturnValue({
      status: "recorded",
      elapsed: 4,
      audioBlob: audio,
      audioUrl: "blob:voice",
      hasSupport: true,
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
      cancelRecording: vi.fn(),
      resetRecording: mocks.resetRecording,
    })
    mocks.sendVoiceMessage.mockResolvedValue({
      messageId: "voice-1",
      queuePosition: 1,
      profileUpdate: { profile: updatedProfile, revision: updatedRevision },
    })
    const user = userEvent.setup()
    render(<RoomChatPanelContainer diagramId="diagram-1" />)
    await waitFor(() => expect(mocks.getPersonalProfileRevision).toHaveBeenCalled())
    await user.click(screen.getByRole("button", { name: "Send voice question" }))

    await waitFor(() =>
      expect(mocks.sendVoiceMessage).toHaveBeenCalledWith({
        file: audio,
        filename: "voz.webm",
        teachingProfile: initialProfile,
        profileRevision: currentRevision,
      })
    )
    await waitFor(() => expect(mocks.writePersonalRoomProfile).toHaveBeenCalled())
    expect(mocks.resetRecording).toHaveBeenCalledOnce()
  })

  it("does not overwrite the local profile when the browser cannot save an acknowledged update", async () => {
    mocks.readPersonalRoomProfile.mockResolvedValue({
      profile: initialProfile,
      revision: currentRevision,
    })
    mocks.writePersonalRoomProfile.mockRejectedValue(new Error("storage unavailable"))
    const user = userEvent.setup()
    render(<RoomChatPanelContainer diagramId="diagram-1" />)
    await waitFor(() => expect(mocks.readPersonalRoomProfile).toHaveBeenCalled())
    await user.type(screen.getByPlaceholderText("Ask the AI about this diagram..."), "Explain this")
    await user.click(screen.getByRole("button", { name: "Send" }))

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy())
    expect(mocks.writePersonalRoomProfile).toHaveBeenCalledWith("user-1", "diagram-1", {
      profile: updatedProfile,
      revision: updatedRevision,
    })
  })
})
