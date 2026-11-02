import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { RoomChatMessage } from "@umlstudio/core"
import { IDLE_ROOM_AI_STATUS } from "@/queries/roomAiCache"
import { RoomChatPanel } from "./RoomChatPanel"

const juanQuestion: RoomChatMessage = {
  id: "m1",
  diagramId: "d1",
  author: { id: "u-juan", name: "Juan", color: "#ff0000", kind: "user" },
  intent: "ask",
  text: "What patterns are used here?",
  status: "answered",
  createdAt: "2026-10-27T10:00:00.000Z",
}

const aiAnswer: RoomChatMessage = {
  id: "m2",
  diagramId: "d1",
  author: { id: "ai", name: "AI", kind: "ai" },
  text: "Strategy and Factory.",
  replyTo: "m1",
  createdAt: "2026-10-27T10:00:05.000Z",
}

describe("RoomChatPanel", () => {
  it("shows the author of each message", () => {
    render(
      <RoomChatPanel
        messages={[juanQuestion]}
        aiStatus={IDLE_ROOM_AI_STATUS}
        currentUserId="u-ana"
        onSend={vi.fn()}
      />
    )
    expect(screen.getByText("Juan")).toBeTruthy()
    expect(screen.getByText("What patterns are used here?")).toBeTruthy()
  })

  it("labels the current user's own messages as You", () => {
    render(
      <RoomChatPanel
        messages={[juanQuestion]}
        aiStatus={IDLE_ROOM_AI_STATUS}
        currentUserId="u-juan"
        onSend={vi.fn()}
      />
    )
    expect(screen.getByText("You")).toBeTruthy()
  })

  it("links an AI answer to its question through replyTo", () => {
    render(
      <RoomChatPanel
        messages={[juanQuestion, aiAnswer]}
        aiStatus={IDLE_ROOM_AI_STATUS}
        onSend={vi.fn()}
      />
    )
    const answer = screen.getAllByTestId("room-ai-message")[1]
    expect(answer.getAttribute("data-author-kind")).toBe("ai")
    expect(within(answer).getByText(/Replying to Juan: What patterns are used here\?/)).toBeTruthy()
  })

  it("shows who the AI is thinking for and the queue length", () => {
    render(
      <RoomChatPanel
        messages={[juanQuestion]}
        aiStatus={{ status: "thinking", forUserName: "Juan", queueLength: 2 }}
        onSend={vi.fn()}
      />
    )
    const status = screen.getByRole("status")
    expect(status.textContent).toContain("AI thinking for Juan")
    expect(status.textContent).toContain("2 in queue")
  })

  it("hides the status indicator when the AI is idle", () => {
    render(<RoomChatPanel messages={[]} aiStatus={IDLE_ROOM_AI_STATUS} onSend={vi.fn()} />)
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("does not show memory content or controls in the shared conversation", () => {
    render(<RoomChatPanel messages={[]} aiStatus={IDLE_ROOM_AI_STATUS} onSend={vi.fn()} />)
    expect(screen.getByText("Visible to everyone in this room")).toBeTruthy()
    expect(screen.queryByText(/memory/i)).toBeNull()
    expect(screen.queryByRole("button", { name: /memory|profile|pin/i })).toBeNull()
  })

  it("shows an honest inline status when profile learning or local saving fails", () => {
    render(
      <RoomChatPanel
        messages={[]}
        aiStatus={IDLE_ROOM_AI_STATUS}
        hasProfileSyncError
        onSend={vi.fn()}
      />
    )
    expect(screen.getByRole("alert").textContent).toContain("teaching preferences")
  })

  it("sends the trimmed draft with the default Ask intent and clears the input", async () => {
    const onSend = vi.fn()
    render(<RoomChatPanel messages={[]} aiStatus={IDLE_ROOM_AI_STATUS} onSend={onSend} />)
    const askButton = screen.getByRole("button", { name: "Ask" })
    const changeButton = screen.getByRole("button", { name: "Changes" })
    expect(askButton.getAttribute("aria-pressed")).toBe("true")
    expect(changeButton.getAttribute("aria-pressed")).toBe("false")

    const input = screen.getByPlaceholderText("Ask the AI about this diagram...")
    await userEvent.type(input, "  hello  ")
    await userEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(onSend).toHaveBeenCalledWith("hello", "ask")
    expect((input as HTMLInputElement).value).toBe("")
  })

  it("switches between Ask and Changes buttons and sends the selected intent", async () => {
    const onSend = vi.fn()
    render(<RoomChatPanel messages={[]} aiStatus={IDLE_ROOM_AI_STATUS} onSend={onSend} />)
    const askButton = screen.getByRole("button", { name: "Ask" })
    const changeButton = screen.getByRole("button", { name: "Changes" })
    const input = screen.getByPlaceholderText("Ask the AI about this diagram...")

    await userEvent.click(changeButton)
    expect(changeButton.getAttribute("aria-pressed")).toBe("true")
    expect(askButton.getAttribute("aria-pressed")).toBe("false")

    await userEvent.type(input, "Add a Customer class")
    await userEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(onSend).toHaveBeenCalledWith("Add a Customer class", "change")

    await userEvent.click(askButton)
    expect(askButton.getAttribute("aria-pressed")).toBe("true")
    expect(changeButton.getAttribute("aria-pressed")).toBe("false")

    await userEvent.type(input, "Why is Customer abstract?")
    await userEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(onSend).toHaveBeenLastCalledWith("Why is Customer abstract?", "ask")
  })

  it("treats /cambio as ordinary text rather than a command", async () => {
    const onSend = vi.fn()
    render(<RoomChatPanel messages={[]} aiStatus={IDLE_ROOM_AI_STATUS} onSend={onSend} />)
    const input = screen.getByPlaceholderText("Ask the AI about this diagram...")

    await userEvent.type(input, "/cambio Add Order relation")

    await userEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(onSend).toHaveBeenCalledWith("/cambio Add Order relation", "ask")
    expect((input as HTMLInputElement).value).toBe("")
  })

  it("disables Changes and keeps Ask intent when allowChanges is false", async () => {
    const onSend = vi.fn()
    render(
      <RoomChatPanel
        messages={[]}
        aiStatus={IDLE_ROOM_AI_STATUS}
        allowChanges={false}
        onSend={onSend}
      />
    )
    const askButton = screen.getByRole("button", { name: "Ask" })
    const changeButton = screen.getByRole("button", { name: "Changes" })
    expect((changeButton as HTMLButtonElement).disabled).toBe(true)
    expect(askButton.getAttribute("aria-pressed")).toBe("true")
    expect(changeButton.getAttribute("aria-pressed")).toBe("false")

    const input = screen.getByPlaceholderText("Ask the AI about this diagram...")
    await userEvent.type(input, "Add Order relation")
    await userEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(onSend).toHaveBeenCalledWith("Add Order relation", "ask")
  })

  it("exposes voice recording in the shared Room conversation", async () => {
    const onStartRecording = vi.fn()
    const voiceControls = {
      status: "idle" as const,
      elapsed: 0,
      audioUrl: null,
      hasSupport: true,
      isSending: false,
      hasError: false,
      onStartRecording,
      onStopRecording: vi.fn(),
      onCancelRecording: vi.fn(),
      onSendRecording: vi.fn(),
    }
    render(
      <RoomChatPanel
        messages={[]}
        aiStatus={IDLE_ROOM_AI_STATUS}
        onSend={vi.fn()}
        voiceControls={voiceControls}
      />
    )

    await userEvent.click(screen.getByRole("button", { name: "Record voice question" }))
    expect(onStartRecording).toHaveBeenCalledOnce()
    expect(screen.queryByRole("button", { name: "Private" })).toBeNull()
  })

  it("places the idle voice button in the composer between the input and send button", () => {
    render(
      <RoomChatPanel
        messages={[]}
        aiStatus={IDLE_ROOM_AI_STATUS}
        onSend={vi.fn()}
        voiceControls={{
          status: "idle",
          elapsed: 0,
          audioUrl: null,
          hasSupport: true,
          isSending: false,
          hasError: false,
          onStartRecording: vi.fn(),
          onStopRecording: vi.fn(),
          onCancelRecording: vi.fn(),
          onSendRecording: vi.fn(),
        }}
      />
    )

    const input = screen.getByPlaceholderText("Ask the AI about this diagram...")
    const recordButton = screen.getByRole("button", { name: "Record voice question" })
    const sendButton = screen.getByRole("button", { name: "Send" })
    const composer = sendButton.closest("form")

    expect(composer).not.toBeNull()
    expect(composer?.contains(input)).toBe(true)
    expect(composer?.contains(recordButton)).toBe(true)
    expect(Array.from(composer!.querySelectorAll("input, button"))).toEqual([
      input,
      recordButton,
      sendButton,
    ])
  })

  it("sends the recorded voice only when the collaborator confirms it", async () => {
    const onSendRecording = vi.fn()
    render(
      <RoomChatPanel
        messages={[]}
        aiStatus={IDLE_ROOM_AI_STATUS}
        onSend={vi.fn()}
        voiceControls={{
          status: "recorded",
          elapsed: 4,
          audioUrl: "blob:voice",
          hasSupport: true,
          isSending: false,
          hasError: false,
          onStartRecording: vi.fn(),
          onStopRecording: vi.fn(),
          onCancelRecording: vi.fn(),
          onSendRecording,
        }}
      />
    )

    expect(screen.getByLabelText("Recorded voice question preview")).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { name: "Send voice question" }))
    expect(onSendRecording).toHaveBeenCalledOnce()
  })
})
