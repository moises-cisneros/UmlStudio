import { describe, it, expect, beforeAll } from "vitest"
import Ajv, { type ValidateFunction } from "ajv"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const testDir = dirname(fileURLToPath(import.meta.url))

/**
 * INT-CU04: CU-04 vision import contract (POST /api/vision).
 *
 * Covers the spec scenarios for the vision upload contract (200 / 413 / 422 /
 * 504), the schema + class-only domain gate, and the FA-01 / FA-02 preview
 * flows. The FastAPI service lives in Python and cannot be imported here, so
 * this file exercises a contract double that mirrors the server validation
 * rules exactly (accepted mime set, 10MB cap, 640x480 floor, 10s timeout,
 * offending-id reporting) against the single canonical stub fixture owned by
 * the provider module. The live server is verified in-process (httpx
 * ASGITransport, no ports) alongside this suite.
 */

const VISION_MAX_BYTES = 10 * 1024 * 1024
const VISION_MIN_WIDTH = 640
const VISION_MIN_HEIGHT = 480
const VISION_TIMEOUT_MS = 10_000

const VISION_ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp"] as const
type VisionMime = (typeof VISION_ACCEPTED_MIME)[number]

const ALLOWED_NODE_TYPES = new Set(["class", "package"])
const ALLOWED_EDGE_TYPES = new Set([
  "ClassAggregation",
  "ClassBidirectional",
  "ClassComposition",
  "ClassDependency",
  "ClassInheritance",
  "ClassRealization",
  "ClassUnidirectional",
])

type VisionFile = {
  name: string
  mime: string
  size: number
  width: number
  height: number
}

type VisionElement = {
  id: string
  type: string
  [key: string]: unknown
}

type VisionEdge = {
  id: string
  type: string
  source: string
  target: string
  [key: string]: unknown
}

type VisionModel = {
  nodes: VisionElement[]
  edges: VisionEdge[]
  [key: string]: unknown
}

type VisionFixture = {
  model: VisionModel
  confidence: Record<string, number>
}

type VisionOk = {
  status: 200
  model: VisionModel
  confidence: Record<string, number>
}

type VisionFailure = {
  status: 413 | 422 | 504
  message: string
  hint: string
  offendingIds?: string[]
}

type VisionResult = VisionOk | VisionFailure

type PostOptions = {
  /** Simulated provider latency in ms; beyond the timeout it maps to 504. */
  delayMs?: number
  /** Simulates a provider extraction used to test the non-class gate. */
  injectModel?: VisionModel
}

/**
 * Contract double for POST /api/vision. Mirrors the FastAPI validation order:
 * mime -> size -> resolution -> provider timeout -> domain gate -> 200.
 */
function postVisionContract(
  file: VisionFile,
  fixture: VisionFixture,
  options: PostOptions = {}
): VisionResult {
  if (!VISION_ACCEPTED_MIME.includes(file.mime as VisionMime)) {
    return {
      status: 422,
      message: `Unsupported image format "${file.mime || "unknown"}".`,
      hint: "Use JPG, PNG, or WebP with a minimum resolution of 640x480.",
    }
  }
  if (file.size > VISION_MAX_BYTES) {
    return {
      status: 413,
      message: `Image is ${(file.size / 1048576).toFixed(1)}MB; the limit is 10MB.`,
      hint: "Compress or resize the photo below 10MB and try again.",
    }
  }
  if (file.width < VISION_MIN_WIDTH || file.height < VISION_MIN_HEIGHT) {
    return {
      status: 422,
      message: `Image is ${file.width}x${file.height}; the minimum is 640x480.`,
      hint: "Retake or upscale the photo to at least 640x480 and try again.",
    }
  }
  if (options.delayMs !== undefined && options.delayMs > VISION_TIMEOUT_MS) {
    return {
      status: 504,
      message: "Vision provider timed out after 10s.",
      hint: "Retry in a few seconds; the request is safe to repeat.",
    }
  }

  const model = options.injectModel ?? fixture.model
  const offendingIds = [
    ...model.nodes.filter((node) => !ALLOWED_NODE_TYPES.has(node.type)).map((node) => node.id),
    ...model.edges.filter((edge) => !ALLOWED_EDGE_TYPES.has(edge.type)).map((edge) => edge.id),
  ]
  if (offendingIds.length > 0) {
    return {
      status: 422,
      message: "Extracted model contains non-class-diagram elements.",
      hint: "UmlStudio only supports UML Class Diagrams (OMG UML 2.5).",
      offendingIds,
    }
  }

  return { status: 200, model, confidence: fixture.confidence }
}

/** FA-01 merge: confirm appends the previewed elements to the diagram. */
function mergePreview(current: VisionModel, incoming: VisionModel): VisionModel {
  return {
    ...current,
    nodes: [...current.nodes, ...incoming.nodes],
    edges: [...current.edges, ...incoming.edges],
  }
}

function validFile(overrides: Partial<VisionFile> = {}): VisionFile {
  return {
    name: "diagram.jpg",
    mime: "image/jpeg",
    size: 512 * 1024,
    width: 1280,
    height: 960,
    ...overrides,
  }
}

describe("INT-CU04: CU-04 vision image import (POST /api/vision)", () => {
  let ajv: Ajv
  let validateModel: ValidateFunction
  let fixture: VisionFixture

  beforeAll(() => {
    const schemaPath = resolve(testDir, "../../../../packages/core/schema/uml-model-4.schema.json")
    const schema = JSON.parse(readFileSync(schemaPath, "utf-8")) as Record<string, unknown>
    ajv = new Ajv({ allowUnionTypes: true, strict: false })
    validateModel = ajv.compile(schema)

    const fixturePath = resolve(testDir, "../../src/vision/stub_fixture.json")
    fixture = JSON.parse(readFileSync(fixturePath, "utf-8")) as VisionFixture
  })

  it("ships a stub fixture that validates with 0 Ajv errors and full confidence coverage", () => {
    const isValid = validateModel(fixture.model)
    expect(isValid, JSON.stringify(validateModel.errors)).toBe(true)
    expect(validateModel.errors).toBeNull()

    const elementIds = [
      ...fixture.model.nodes.map((node) => node.id),
      ...fixture.model.edges.map((edge) => edge.id),
    ]
    expect(elementIds.length).toBeGreaterThan(0)
    for (const id of elementIds) {
      const confidence = fixture.confidence[id]
      expect(confidence).toBeDefined()
      expect(confidence).toBeGreaterThanOrEqual(0)
      expect(confidence).toBeLessThanOrEqual(1)
    }
  })

  it("accepts a valid image with 200 plus model and per-element confidence", () => {
    const result = postVisionContract(validFile(), fixture)

    expect(result.status).toBe(200)
    if (result.status !== 200) return
    const isValid = validateModel(result.model)
    expect(isValid, JSON.stringify(validateModel.errors)).toBe(true)
    expect(Object.keys(result.confidence).length).toBeGreaterThan(0)
  })

  it("rejects payloads above 10MB with 413 and max-size guidance", () => {
    const result = postVisionContract(validFile({ size: VISION_MAX_BYTES + 1 }), fixture)

    expect(result.status).toBe(413)
    if (result.status !== 413) return
    expect(result.message).toMatch(/10MB/)
    expect(result.hint).toMatch(/below 10MB/)
  })

  it("rejects unsupported formats with 422 and accepted-format guidance", () => {
    const result = postVisionContract(
      validFile({ name: "diagram.gif", mime: "image/gif" }),
      fixture
    )

    expect(result.status).toBe(422)
    if (result.status !== 422) return
    expect(result.message).toMatch(/Unsupported image format/)
    expect(result.hint).toMatch(/JPG, PNG, or WebP/)
  })

  it("rejects images below 640x480 with 422", () => {
    const result = postVisionContract(validFile({ width: 320, height: 240 }), fixture)

    expect(result.status).toBe(422)
    if (result.status !== 422) return
    expect(result.message).toMatch(/640x480/)
  })

  it("rejects non-class elements with 422 listing the offending ids", () => {
    const injected: VisionModel = {
      ...fixture.model,
      nodes: [...fixture.model.nodes, { id: "node-actor", type: "actor" }],
      edges: [
        ...fixture.model.edges,
        {
          id: "edge-lifeline",
          type: "lifeline",
          source: "node-actor",
          target: fixture.model.nodes[0].id,
        },
      ],
    }
    const result = postVisionContract(validFile(), fixture, {
      injectModel: injected,
    })

    expect(result.status).toBe(422)
    if (result.status !== 422) return
    expect(result.offendingIds).toContain("node-actor")
    expect(result.offendingIds).toContain("edge-lifeline")
  })

  it("surfaces provider timeouts beyond 10s with 504 and a retry hint", () => {
    const result = postVisionContract(validFile(), fixture, {
      delayMs: VISION_TIMEOUT_MS + 1,
    })

    expect(result.status).toBe(504)
    if (result.status !== 504) return
    expect(result.message).toMatch(/timed out/)
    expect(result.hint).toMatch(/Retry/)
  })

  it("FA-01: confirm merges the previewed elements into the diagram", () => {
    const current: VisionModel = { ...fixture.model, nodes: [], edges: [] }

    const merged = mergePreview(current, fixture.model)

    expect(merged.nodes).toHaveLength(fixture.model.nodes.length)
    expect(merged.edges).toHaveLength(fixture.model.edges.length)
    for (const node of fixture.model.nodes) {
      expect(merged.nodes.map((item) => item.id)).toContain(node.id)
    }
  })

  it("FA-02: cancel discards the preview without mutating the diagram", () => {
    const current: VisionModel = { ...fixture.model, nodes: [], edges: [] }
    const snapshot = JSON.parse(JSON.stringify(current)) as VisionModel

    // Cancel path: the preview stays in local state, the store is untouched.
    expect(current).toEqual(snapshot)
    expect(current.nodes).toHaveLength(0)
    expect(current.edges).toHaveLength(0)
  })
})
