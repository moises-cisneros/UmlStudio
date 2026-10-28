// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useWorkbenchStore } from "@/stores/useWorkbenchStore"
import { RightDockWorkspace } from "./RightDockWorkspace"

const sharedState = vi.hoisted(() => ({ diagramId: null as string | null }))

vi.mock("@/hooks/useSharedDiagramId", () => ({
  useSharedDiagramId: () => sharedState.diagramId,
}))
vi.mock("@/i18n", () => ({
  useTranslation: () => ({
    t: {
      agent: {
        title: "Agent",
        inspectorTitle: "Inspector",
        tabAgent: "Agent",
        tabInspector: "Inspector",
      },
      roomAi: { tabRoom: "Room" },
      common: { close: "Close" },
    },
  }),
}))
vi.mock("./AgentChatStream", () => ({
  AgentChatStream: () => <div data-testid="agent-chat">Agent chat</div>,
}))
vi.mock("./ClassInspectorTab", () => ({
  ClassInspectorTab: () => <div data-testid="inspector">Inspector</div>,
}))
vi.mock("@/components/roomai/RoomChatPanelContainer", () => ({
  RoomChatPanelContainer: () => <div data-testid="room-chat">Room chat</div>,
}))

beforeEach(() => {
  sharedState.diagramId = null
  useWorkbenchStore.setState({
    isAgentDockOpen: true,
    activeDockTab: "agent",
    previousIndividualDockTab: null,
  })
})

afterEach(() => cleanup())

describe("RightDockWorkspace", () => {
  it("hides Agent and shows Room while shared, then restores the individual tab", () => {
    const { rerender } = render(<RightDockWorkspace />)

    fireEvent.click(screen.getByRole("button", { name: "Inspector" }))
    expect(screen.getByTestId("inspector")).toBeTruthy()

    sharedState.diagramId = "shared-diagram"
    rerender(<RightDockWorkspace />)

    expect(screen.queryByRole("button", { name: "Agent" })).toBeNull()
    expect(screen.getByRole("button", { name: "Room" }).getAttribute("data-active")).toBe("true")
    expect(screen.getByTestId("room-chat")).toBeTruthy()
    expect(screen.queryByTestId("agent-chat")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Inspector" }))
    expect(screen.getByTestId("inspector")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Inspector" }).getAttribute("data-active")).toBe(
      "true"
    )

    sharedState.diagramId = null
    rerender(<RightDockWorkspace />)

    expect(screen.getByTestId("inspector")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Inspector" }).getAttribute("data-active")).toBe(
      "true"
    )
  })

  it("defaults to Room on direct shared entry and keeps Agent unmounted", () => {
    sharedState.diagramId = "shared-diagram"
    render(<RightDockWorkspace />)

    expect(screen.queryByRole("button", { name: "Agent" })).toBeNull()
    expect(screen.getByRole("button", { name: "Room" }).getAttribute("data-active")).toBe("true")
    expect(screen.getByTestId("room-chat")).toBeTruthy()
    expect(screen.queryByTestId("agent-chat")).toBeNull()
  })

  it("does not open a closed dock while synchronizing the shared tab", () => {
    sharedState.diagramId = "shared-diagram"
    useWorkbenchStore.setState({
      isAgentDockOpen: false,
      activeDockTab: "agent",
      previousIndividualDockTab: null,
    })

    const { rerender } = render(<RightDockWorkspace />)

    expect(useWorkbenchStore.getState().isAgentDockOpen).toBe(false)

    sharedState.diagramId = null
    rerender(<RightDockWorkspace />)

    expect(useWorkbenchStore.getState().isAgentDockOpen).toBe(false)
    expect(useWorkbenchStore.getState().activeDockTab).toBe("agent")
  })

  it("restores the individual tab after the dock unmounts in shared mode", () => {
    const { rerender, unmount } = render(<RightDockWorkspace />)
    fireEvent.click(screen.getByRole("button", { name: "Inspector" }))

    sharedState.diagramId = "shared-diagram"
    rerender(<RightDockWorkspace />)
    expect(screen.getByRole("button", { name: "Room" }).getAttribute("data-active")).toBe("true")

    act(() => useWorkbenchStore.setState({ isAgentDockOpen: false }))
    unmount()
    sharedState.diagramId = null
    act(() => useWorkbenchStore.setState({ isAgentDockOpen: true }))

    render(<RightDockWorkspace />)

    expect(screen.getByTestId("inspector")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Inspector" }).getAttribute("data-active")).toBe(
      "true"
    )
  })
})
