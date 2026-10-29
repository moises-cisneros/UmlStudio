import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { RoomChatMessage } from "@umlstudio/core"
import { RoomChatPanelContainer } from "./RoomChatPanelContainer"

const mocks = vi.hoisted(() => ({
  useRoomAi: vi.fn(),
  useAuthStore: vi.fn(),
  useEditorContext: vi.fn(),
  readPersonalRoomMemory: vi.fn(),
  writePersonalRoomMemory: vi.fn(),
  postPrivateRoomAiMessage: vi.fn(),
  sendSharedMessage: vi.fn(),
  flushSharedReplica: vi.fn(),
}))

vi.mock("@/queries/roomAiQueries", () => ({ useRoomAi: mocks.useRoomAi }))
vi.mock("@/stores/useAuthStore", () => ({ useAuthStore: mocks.useAuthStore }))
vi.mock("@/contexts", () => ({ useEditorContext: mocks.useEditorContext }))
vi.mock("@/services/personalRoomMemory", () => ({
  readPersonalRoomMemory: mocks.readPersonalRoomMemory,
  writePersonalRoomMemory: mocks.writePersonalRoomMemory,
}))
vi.mock("@/services/DiagramApiClient", () => ({
  DiagramApiClient: { postPrivateRoomAiMessage: mocks.postPrivateRoomAiMessage },
}))

const sharedMessage: RoomChatMessage = {
  id: "shared-1",
  diagramId: "diagram-1",
  author: { id: "collaborator", name: "Collaborator", kind: "user" },
  text: "Shared room message",
  createdAt: "2026-10-28T00:00:00.000Z",
}

describe("RoomChatPanelContainer private state", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useAuthStore.mockImplementation((selector) =>
      selector({ user: { id: "user-1", name: "User" } })
    )
    mocks.useEditorContext.mockReturnValue({ flushSharedReplica: mocks.flushSharedReplica })
    mocks.flushSharedReplica.mockResolvedValue({ generation: "a".repeat(64), revision: 3 })
    mocks.readPersonalRoomMemory.mockResolvedValue("personal notes")
    mocks.writePersonalRoomMemory.mockResolvedValue(undefined)
    mocks.postPrivateRoomAiMessage.mockResolvedValue({
      text: "User: private answer",
      provider: "self_hosted",
    })
    mocks.useRoomAi.mockReturnValue({
      messages: [sharedMessage],
      isLoading: false,
      loadError: null,
      aiStatus: { status: "idle", queueLength: 0 },
      sendMessage: mocks.sendSharedMessage,
      sendError: null,
      isSending: false,
      sharedMemory: null,
      pinMessage: vi.fn(),
    })
  })

  it("keeps the private transcript out of shared chat and clears it when the room changes", async () => {
    const user = userEvent.setup()
    const view = render(<RoomChatPanelContainer diagramId="diagram-1" />)

    await user.click(screen.getByRole("button", { name: "Private" }))
    await waitFor(() =>
      expect(mocks.readPersonalRoomMemory).toHaveBeenCalledWith("user-1", "diagram-1")
    )
    await user.type(screen.getByRole("textbox", { name: /privately/i }), "private question")
    await user.click(screen.getByRole("button", { name: "Send" }))

    expect(await screen.findByText("User: private answer")).toBeTruthy()
    expect(mocks.postPrivateRoomAiMessage).toHaveBeenCalledWith("diagram-1", {
      text: "private question",
      privateContext: "personal notes",
      replica: { generation: "a".repeat(64), revision: 3 },
    })
    expect(mocks.sendSharedMessage).not.toHaveBeenCalled()

    view.rerender(<RoomChatPanelContainer diagramId="diagram-2" />)
    await waitFor(() =>
      expect(mocks.readPersonalRoomMemory).toHaveBeenCalledWith("user-1", "diagram-2")
    )
    expect(screen.queryByText("User: private answer")).toBeNull()
  })
})
