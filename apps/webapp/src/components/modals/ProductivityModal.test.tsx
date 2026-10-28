// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react"
import { ProductivityModal } from "./ProductivityModal"

const { fetchProductivityReport, computeLocalProductivityReport, auditProductivityWithAi } =
  vi.hoisted(() => ({
    fetchProductivityReport: vi.fn(),
    computeLocalProductivityReport: vi.fn(),
    auditProductivityWithAi: vi.fn(),
  }))

vi.mock("@/contexts", () => ({
  useEditorContext: () => ({ editor: null }),
  useModalContext: () => ({ closeModal: vi.fn() }),
}))

vi.mock("@/i18n", () => ({ useTranslation: () => ({ t: { common: { close: "Close" } } }) }))
vi.mock("@/stores/useAuthStore", () => ({ useAuthStore: () => null }))
vi.mock("@/utils/localProductivityTracker", () => ({ setTrackingPaused: vi.fn() }))
vi.mock("./HomeDialog", () => ({
  HomeDialogContent: ({ children }: React.PropsWithChildren) => children,
}))
vi.mock("@/services/productivityService", () => ({
  fetchProductivityReport,
  computeLocalProductivityReport,
  auditProductivityWithAi,
  exportProductivityAsJson: vi.fn(),
}))

const report = {
  collaborators: [],
  totalActiveSeconds: 60,
  totalIdleSeconds: 0,
  bottlenecks: [],
  velocity: { classesPerHour: 1, refactorsPerHour: 0 },
  fluencyScore: 100,
  fluencyStatus: "green" as const,
}

beforeEach(() => {
  fetchProductivityReport.mockResolvedValue(report)
  computeLocalProductivityReport.mockReturnValue(report)
  auditProductivityWithAi.mockResolvedValue({
    diagnosis: "Looks good",
    recommendations: [],
    pattern_suggestions: [],
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.history.replaceState({}, "", "/")
})

describe("ProductivityModal AI audit", () => {
  it("blocks the AI audit in shared mode while keeping the productivity report available", async () => {
    window.history.replaceState({}, "", "/shared/diagram-1")
    render(<ProductivityModal diagramId="diagram-1" />)

    await screen.findByText("Tiempo Activo")
    expect(screen.getByText("1m 0s")).toBeTruthy()
    fireEvent.click(screen.getByRole("tab", { name: "Diagnóstico IA" }))

    const auditButton = screen.getByRole("button", { name: "Analizar con IA" })
    expect((auditButton as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(auditButton)
    await waitFor(() => expect(auditProductivityWithAi).not.toHaveBeenCalled())
  })

  it("still allows AI audit in individual mode", async () => {
    window.history.replaceState({}, "", "/local/diagram-1")
    render(<ProductivityModal diagramId="diagram-1" />)
    fireEvent.click(screen.getByRole("tab", { name: "Diagnóstico IA" }))

    const auditButton = await screen.findByRole("button", { name: "Analizar con IA" })
    await waitFor(() => expect((auditButton as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(auditButton)
    await waitFor(() => expect(auditProductivityWithAi).toHaveBeenCalledWith(report))
  })
})
