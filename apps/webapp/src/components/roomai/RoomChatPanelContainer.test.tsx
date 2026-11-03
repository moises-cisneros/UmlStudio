import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { RoomChatMessage } from "@umlstudio/core"
import { ApiError } from "@/services/DiagramApiClient"
import { RoomChatPanelContainer } from "./RoomChatPanelContainer"

const mocks = vi.hoisted(() => ({
  useRoomAi: vi.fn(),
  useAuthStore: vi.fn(),
  useEditorContext: vi.fn(),
  readPersonalRoomProfile: vi.fn(),
  writePersonalRoomProfile: vi.fn(),
  getPersonalProfileRevision: vi.fn(),
  sendSharedMessage: vi.fn(),
  updatePolicy: vi.fn(),
  sendVoiceMessage: vi.fn(),
  claimProposal: vi.fn(),
  completeProposal: vi.fn(),
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

const pendingProposal: RoomChatMessage = {
  ...sharedMessage,
  id: "proposal-1",
  author: { id: "room-ai", name: "Room AI", kind: "ai" },
  proposal: {
    diff: { add: { elements: [{ name: "Customer", type: "class" }] } },
    status: "pending",
    baseRev: 1,
  },
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
    mocks.useEditorContext.mockReturnValue({
      editor: { isReadonly: () => false },
      flushSharedReplica: mocks.flushSharedReplica,
    })
    mocks.flushSharedReplica.mockResolvedValue({ generation: "a".repeat(64), revision: 3 })
    mocks.readPersonalRoomProfile.mockResolvedValue(null)
    mocks.writePersonalRoomProfile.mockResolvedValue(undefined)
    mocks.getPersonalProfileRevision.mockResolvedValue(currentRevision)
    mocks.sendVoiceMessage.mockResolvedValue({ messageId: "voice-1", queuePosition: 1 })
    mocks.claimProposal.mockResolvedValue(pendingProposal.proposal!.diff)
    mocks.completeProposal.mockResolvedValue(undefined)
    mocks.sendSharedMessage.mockResolvedValue({
      messageId: "message-1",
      queuePosition: 1,
      profileUpdate: { profile: updatedProfile, revision: updatedRevision },
    })
    mocks.updatePolicy.mockResolvedValue({
      enabled: true,
      allowChanges: true,
      applyMode: "confirm",
      proactive: false,
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
      claimProposal: mocks.claimProposal,
      completeProposal: mocks.completeProposal,
      getPersonalProfileRevision: mocks.getPersonalProfileRevision,
      isSendingVoice: false,
      sendVoiceError: null,
      sendError: null,
      isSending: false,
      updatePolicy: mocks.updatePolicy,
      isUpdatingPolicy: false,
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

  it("does not claim a proposal while the editor is read-only", async () => {
    mocks.useEditorContext.mockReturnValue({
      editor: { isReadonly: () => true },
      flushSharedReplica: mocks.flushSharedReplica,
    })
    mocks.useRoomAi.mockReturnValue({ ...mocks.useRoomAi(), messages: [pendingProposal] })
    const user = userEvent.setup()
    render(<RoomChatPanelContainer diagramId="diagram-1" />)

    await user.click(screen.getByRole("button", { name: "Apply" }))

    expect(mocks.claimProposal).not.toHaveBeenCalled()
  })

  it("explains when the Room AI queue is full and the message was rejected", async () => {
    mocks.useRoomAi.mockReturnValue({
      ...mocks.useRoomAi(),
      sendError: new ApiError(429, "ROOM_AI_QUEUE_FULL", "room AI queue is full"),
    })

    render(<RoomChatPanelContainer diagramId="diagram-1" />)

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Room AI queue is full; your message was not added."
    )
  })

  it("keeps the generic send error for failures unrelated to queue capacity", async () => {
    mocks.useRoomAi.mockReturnValue({ ...mocks.useRoomAi(), sendError: new Error("network error") })

    render(<RoomChatPanelContainer diagramId="diagram-1" />)

    expect((await screen.findByRole("alert")).textContent).toContain("Could not send your message.")
  })

  it.each([
    ["ROOM_AI_CHANGES_DISABLED", "This room's policy does not allow change requests."],
    ["ROOM_AI_DISABLED", "Room AI is disabled for this room."],
  ] as const)("explains the room policy rejection %s", async (code, message) => {
    mocks.useRoomAi.mockReturnValue({
      ...mocks.useRoomAi(),
      sendError: new ApiError(403, code, "Forbidden"),
    })

    render(<RoomChatPanelContainer diagramId="diagram-1" />)

    expect((await screen.findByRole("alert")).textContent).toContain(message)
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
        intent: "ask",
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

  it("forwards the selected Changes intent to room.sendMessage", async () => {
    mocks.useRoomAi.mockReturnValue({
      ...mocks.useRoomAi(),
      policy: { enabled: true, allowChanges: true, applyMode: "confirm", proactive: false },
    })
    const user = userEvent.setup()
    render(<RoomChatPanelContainer diagramId="diagram-1" />)
    await waitFor(() => expect(mocks.getPersonalProfileRevision).toHaveBeenCalled())

    await user.click(screen.getByRole("button", { name: "Changes" }))
    await user.type(
      screen.getByPlaceholderText("Ask the AI about this diagram..."),
      "Add Customer class"
    )
    await user.click(screen.getByRole("button", { name: "Send" }))

    await waitFor(() =>
      expect(mocks.sendSharedMessage).toHaveBeenCalledWith({
        text: "Add Customer class",
        intent: "change",
        teachingProfile: initialProfile,
        profileRevision: currentRevision,
      })
    )
  })

  it("lets the diagram owner configure every Room AI policy field", async () => {
    mocks.useRoomAi.mockReturnValue({
      ...mocks.useRoomAi(),
      policy: {
        enabled: true,
        allowChanges: false,
        applyMode: "confirm",
        proactive: false,
        canConfigure: true,
      },
    })
    const user = userEvent.setup()
    render(<RoomChatPanelContainer diagramId="diagram-1" />)

    await user.click(screen.getByRole("button", { name: "Room AI settings" }))
    await user.click(screen.getByTestId("room-ai-enabled"))
    await user.click(screen.getByTestId("room-ai-allow-changes"))
    await user.click(screen.getByTestId("room-ai-proactive"))
    await user.click(screen.getByRole("combobox", { name: "Apply mode" }))
    await user.click(screen.getByRole("option", { name: "Automatic" }))
    await user.click(screen.getByRole("button", { name: "Save" }))

    expect(mocks.updatePolicy).toHaveBeenCalledWith({
      enabled: false,
      allowChanges: true,
      applyMode: "auto",
      proactive: true,
    })
  })

  it("does not show Room AI settings to non-owners", () => {
    mocks.useRoomAi.mockReturnValue({
      ...mocks.useRoomAi(),
      policy: {
        enabled: true,
        allowChanges: true,
        applyMode: "confirm",
        proactive: false,
        canConfigure: false,
      },
    })

    render(<RoomChatPanelContainer diagramId="diagram-1" />)

    expect(screen.queryByRole("button", { name: "Room AI settings" })).toBeNull()
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
      intent: "ask",
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
