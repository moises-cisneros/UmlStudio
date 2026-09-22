// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, cleanup } from "@testing-library/react"
import type { UMLModel } from "@umlstudio/core"
import { EditorContext } from "@/contexts/EditorContext"
import { VisionImportDialog } from "./VisionImportDialog"
import {
  VisionImportError,
  mergeVisionModel,
  uploadImageForVision,
  validateImageFile,
  validateVisionModel,
} from "./visionImport"

function makeModel(overrides: Partial<UMLModel> = {}): UMLModel {
  return {
    version: "4.0.0",
    id: "diagram-1",
    title: "Test",
    type: "ClassDiagram" as UMLModel["type"],
    nodes: [
      {
        id: "n-user",
        width: 180,
        height: 120,
        type: "class",
        position: { x: 10, y: 20 },
        data: { name: "User" },
        measured: { width: 180, height: 120 },
      },
    ],
    edges: [],
    assessments: {},
    ...overrides,
  }
}

function pngFile(name = "photo.png", size = 1024): File {
  const bytes = new Uint8Array(size)
  return new File([bytes], name, { type: "image/png" })
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("validateImageFile", () => {
  it("accepts JPG, PNG, and WebP within 10MB", () => {
    expect(() => validateImageFile(pngFile())).not.toThrow()
    expect(() =>
      validateImageFile(new File([new Uint8Array(8)], "a.jpg", { type: "image/jpeg" }))
    ).not.toThrow()
  })

  it("rejects unsupported formats with a 422-style error", () => {
    const err = (() => {
      try {
        validateImageFile(new File([new Uint8Array(8)], "a.gif", { type: "image/gif" }))
      } catch (error) {
        return error
      }
      return null
    })()
    expect(err).toBeInstanceOf(VisionImportError)
    expect((err as VisionImportError).status).toBe(422)
  })

  it("rejects oversize payloads with a 413-style error", () => {
    const err = (() => {
      try {
        validateImageFile(pngFile("big.png", 11 * 1024 * 1024))
      } catch (error) {
        return error
      }
      return null
    })()
    expect(err).toBeInstanceOf(VisionImportError)
    expect((err as VisionImportError).status).toBe(413)
  })
})

describe("uploadImageForVision", () => {
  it("returns the extracted model on 200", async () => {
    const model = makeModel()
    const fetchMock = vi.fn(async () => jsonResponse(200, { model, confidence: { "n-user": 0.9 } }))
    const result = await uploadImageForVision(pngFile(), fetchMock)
    expect(result.model.nodes).toHaveLength(1)
    expect(result.confidence["n-user"]).toBe(0.9)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("maps 413, 422, and 504 to typed errors with hints", async () => {
    for (const status of [413, 422, 504] as const) {
      const fetchMock = vi.fn(async () => jsonResponse(status, { detail: "server says no" }))
      const err = await uploadImageForVision(pngFile(), fetchMock).catch((error: unknown) => error)
      expect(err).toBeInstanceOf(VisionImportError)
      expect((err as VisionImportError).status).toBe(status)
      expect((err as VisionImportError).hint.length).toBeGreaterThan(0)
    }
  })

  it("degrades gracefully when the endpoint is absent", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed")
    })
    const err = await uploadImageForVision(pngFile(), fetchMock).catch((error: unknown) => error)
    expect(err).toBeInstanceOf(VisionImportError)
    expect((err as VisionImportError).status).toBe(0)
  })
})

describe("validateVisionModel", () => {
  it("passes a schema-shaped class diagram with zero errors", () => {
    const result = validateVisionModel(makeModel())
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("rejects non-class elements and lists offending ids", () => {
    const model = makeModel({
      nodes: [
        {
          id: "n-actor",
          width: 100,
          height: 100,
          type: "actor" as unknown as "class",
          position: { x: 0, y: 0 },
          data: {},
          measured: { width: 100, height: 100 },
        },
      ],
    })
    const result = validateVisionModel(model)
    expect(result.valid).toBe(false)
    expect(result.offendingIds).toContain("n-actor")
  })
})

describe("mergeVisionModel (FA-01 / FA-02)", () => {
  it("appends extracted elements without mutating the inputs", () => {
    const current = makeModel()
    const incoming = makeModel({
      id: "vision",
      title: "Vision",
      nodes: [
        {
          id: "n-order",
          width: 0,
          height: 0,
          type: "class",
          position: { x: 0, y: 0 },
          data: { name: "Order" },
          measured: { width: 0, height: 0 },
        },
      ],
    })
    const merged = mergeVisionModel(current, incoming)
    expect(merged.nodes.map((node) => node.id)).toEqual(["n-user", "n-order"])
    expect(current.nodes).toHaveLength(1)
    expect(incoming.nodes).toHaveLength(1)
    expect(merged.id).toBe("diagram-1")
  })

  it("remaps colliding ids and rewires edges", () => {
    const current = makeModel()
    const incoming = makeModel({
      nodes: [
        {
          id: "n-user",
          width: 180,
          height: 120,
          type: "class",
          position: { x: 0, y: 0 },
          data: { name: "Admin" },
          measured: { width: 180, height: 120 },
        },
      ],
      edges: [
        {
          id: "e-1",
          source: "n-user",
          target: "n-user",
          type: "ClassInheritance",
          sourceHandle: "",
          targetHandle: "",
          data: { points: [] },
        },
      ],
    })
    const merged = mergeVisionModel(current, incoming)
    expect(merged.nodes.map((node) => node.id)).toContain("n-user")
    const added = merged.nodes[1]
    expect(added.id).not.toBe("n-user")
    expect(merged.edges[0].source).toBe(added.id)
    expect(merged.edges[0].target).toBe(added.id)
    expect(merged.edges[0].sourceHandle).toBe("right")
  })
})

describe("VisionImportDialog", () => {
  function renderDialog(current: UMLModel, onAssign: (model: UMLModel) => void) {
    const editor = {
      get model(): UMLModel {
        return current
      },
      set model(value: UMLModel) {
        onAssign(value)
      },
    }
    return render(
      <EditorContext
        value={{
          editor: editor as never,
          diagramName: "Test",
          setDiagramName: () => {},
          setEditor: () => {},
        }}
      >
        <VisionImportDialog open onClose={() => {}} />
      </EditorContext>
    )
  }

  it("previews extracted classes then merges on confirm (FA-01)", async () => {
    const model = makeModel()
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { model, confidence: { "n-user": 0.82 } }))
    )
    const assigned: UMLModel[] = []
    renderDialog(makeModel({ nodes: [] }), (value) => assigned.push(value))

    fireEvent.change(screen.getByLabelText("Diagram photo", { selector: "input" }), {
      target: { files: [pngFile()] },
    })

    expect(await screen.findByText("User")).toBeTruthy()
    expect(screen.getByText("82%")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /confirm import/i }))
    expect(assigned).toHaveLength(1)
    expect(assigned[0].nodes.map((node) => node.id)).toContain("n-user")
  })

  it("cancel discards the preview without mutating the diagram (FA-02)", async () => {
    const model = makeModel()
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { model, confidence: {} }))
    )
    const assigned: UMLModel[] = []
    renderDialog(makeModel({ nodes: [] }), (value) => assigned.push(value))

    fireEvent.change(screen.getByLabelText("Diagram photo", { selector: "input" }), {
      target: { files: [pngFile()] },
    })
    expect(await screen.findByText("User")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }))
    expect(assigned).toHaveLength(0)
  })
})
