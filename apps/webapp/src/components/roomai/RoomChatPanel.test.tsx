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

  it("shows when shared Room memory could not be loaded", () => {
    render(
      <RoomChatPanel
        messages={[]}
        aiStatus={IDLE_ROOM_AI_STATUS}
        hasSharedMemoryError
        onSend={vi.fn()}
      />
    )
    expect(screen.getByText("Shared room memory is unavailable.")).toBeTruthy()
  })

  it("shows when pinning a decision fails", () => {
    render(
      <RoomChatPanel messages={[]} aiStatus={IDLE_ROOM_AI_STATUS} hasPinError onSend={vi.fn()} />
    )
    expect(screen.getByText("Could not pin this message to shared memory.")).toBeTruthy()
  })

  it("shows the shared summary and pinned decisions in Room mode", () => {
    render(
      <RoomChatPanel
        messages={[]}
        aiStatus={IDLE_ROOM_AI_STATUS}
        sharedMemory={{ summary: "Use a layered architecture", pinnedDecisions: ["Use UUIDs"] }}
        onSend={vi.fn()}
      />
    )
    expect(screen.getByText("Use a layered architecture")).toBeTruthy()
    expect(screen.getByText("Use UUIDs")).toBeTruthy()
  })

  it("sends the trimmed draft and clears the input", async () => {
    const onSend = vi.fn()
    render(<RoomChatPanel messages={[]} aiStatus={IDLE_ROOM_AI_STATUS} onSend={onSend} />)
    const input = screen.getByPlaceholderText("Ask the AI about this diagram...")
    await userEvent.type(input, "  hello  ")
    await userEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(onSend).toHaveBeenCalledWith("hello")
    expect((input as HTMLInputElement).value).toBe("")
  })

  it("lets the collaborator switch between shared Room and private chat", async () => {
    const onModeChange = vi.fn()
    render(
      <RoomChatPanel
        messages={[]}
        aiStatus={IDLE_ROOM_AI_STATUS}
        mode="room"
        onModeChange={onModeChange}
        onSend={vi.fn()}
      />
    )

    await userEvent.click(screen.getByRole("button", { name: "Private" }))

    expect(onModeChange).toHaveBeenCalledWith("private")
  })
})
