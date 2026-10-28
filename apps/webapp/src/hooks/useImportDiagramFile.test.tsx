// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useImportDiagramFile } from "./useImportDiagramFile"

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  createModel: vi.fn(),
  uploadImageForVision: vi.fn(),
  importDiagram: vi.fn(),
  importXmiDiagram: vi.fn(),
  toastWarning: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  collaborators: { isCollaborativeBlocked: false, isShared: true },
}))

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }))
vi.mock("@/stores/usePersistenceModelStore", () => ({
  usePersistenceModelStore: (
    selector: (state: { createModel: typeof mocks.createModel }) => unknown
  ) => selector({ createModel: mocks.createModel }),
}))
vi.mock("./useCollaborators", () => ({ useCollaborators: () => mocks.collaborators }))
vi.mock("@/i18n", () => ({
  useTranslation: () => ({ t: { collaborators: { importBlockedToast: "Import blocked" } } }),
}))
vi.mock("react-toastify", () => ({
  toast: {
    warning: mocks.toastWarning,
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}))
vi.mock("@/logger", () => ({ log: { error: vi.fn() } }))
vi.mock("@/components/vision/visionImport", () => ({
  uploadImageForVision: mocks.uploadImageForVision,
  validateVisionModel: vi.fn(() => ({ valid: true, errors: [] })),
}))
vi.mock("@umlstudio/core", () => ({
  importDiagram: mocks.importDiagram,
  importXmiDiagram: mocks.importXmiDiagram,
}))

describe("useImportDiagramFile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.collaborators.isCollaborativeBlocked = false
    mocks.collaborators.isShared = true
    mocks.importDiagram.mockReturnValue({ id: "old", title: "Imported", nodes: [], edges: [] })
    mocks.navigate.mockResolvedValue(undefined)
  })

  it("blocks image vision uploads in shared mode before calling the service", async () => {
    const { result } = renderHook(() => useImportDiagramFile())
    const image = new File([new Uint8Array([1])], "diagram.png", { type: "image/png" })

    await act(async () => result.current(image))

    expect(mocks.uploadImageForVision).not.toHaveBeenCalled()
    expect(mocks.createModel).not.toHaveBeenCalled()
    expect(mocks.toastWarning).toHaveBeenCalledWith("Import blocked")
  })

  it("continues to import JSON files outside shared mode", async () => {
    mocks.collaborators.isShared = false
    const { result } = renderHook(() => useImportDiagramFile())
    const json = new File(["{}"], "diagram.json", { type: "application/json" })
    vi.spyOn(json, "text").mockResolvedValue("{}")

    await act(async () => result.current(json))

    expect(mocks.importDiagram).toHaveBeenCalledWith({})
    expect(mocks.createModel).toHaveBeenCalledOnce()
    expect(mocks.uploadImageForVision).not.toHaveBeenCalled()
    expect(mocks.navigate).toHaveBeenCalledOnce()
  })

  it("preserves the existing threshold block for JSON and XMI imports", async () => {
    mocks.collaborators.isCollaborativeBlocked = true
    const { result } = renderHook(() => useImportDiagramFile())
    const json = new File(["{}"], "diagram.json", { type: "application/json" })
    const xmi = new File(["<xmi />"], "diagram.xmi", { type: "application/xml" })
    vi.spyOn(json, "text").mockResolvedValue("{}")
    vi.spyOn(xmi, "text").mockResolvedValue("<xmi />")

    await act(async () => {
      await result.current(json)
      await result.current(xmi)
    })

    expect(mocks.importDiagram).not.toHaveBeenCalled()
    expect(mocks.importXmiDiagram).not.toHaveBeenCalled()
    expect(mocks.createModel).not.toHaveBeenCalled()
    expect(mocks.toastWarning).toHaveBeenCalledTimes(2)
  })
})
