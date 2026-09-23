import type { UMLModel, UmlStudioEdge, UmlStudioNode } from "@umlstudio/core"

/**
 * Front-end contract for vision import (POST /api/vision).
 *
 * The FastAPI endpoint is owned by another work unit; this module implements
 * the dialog side against the spec contract and degrades gracefully when the
 * endpoint is absent (network failure maps to a typed error with a hint).
 */

export const VISION_MAX_BYTES = 10 * 1024 * 1024
export const VISION_MIN_WIDTH = 640
export const VISION_MIN_HEIGHT = 480

export const VISION_ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp"] as const

export type VisionConfidence = Record<string, number>

export type VisionResponse = {
  model: UMLModel
  confidence: VisionConfidence
}

export type VisionErrorStatus = 413 | 422 | 504 | 0

export class VisionImportError extends Error {
  readonly status: VisionErrorStatus
  readonly hint: string

  constructor(status: VisionErrorStatus, message: string, hint: string) {
    super(message)
    this.name = "VisionImportError"
    this.status = status
    this.hint = hint
  }
}

function resolveVisionUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> })?.env
  const base = env?.["VITE_AI_SERVICE_URL"] || "http://127.0.0.1:8001"
  return `${base.replace(/\/$/, "")}/api/vision`
}

export function validateImageFile(file: File): void {
  if (!VISION_ACCEPTED_MIME.includes(file.type as (typeof VISION_ACCEPTED_MIME)[number])) {
    throw new VisionImportError(
      422,
      `Unsupported image format "${file.type || "unknown"}".`,
      "Use JPG, PNG, or WebP with a minimum resolution of 640x480."
    )
  }
  if (file.size > VISION_MAX_BYTES) {
    throw new VisionImportError(
      413,
      `Image is ${(file.size / 1048576).toFixed(1)}MB; the limit is 10MB.`,
      "Compress or resize the photo below 10MB and try again."
    )
  }
}

type FetchFn = typeof fetch

export async function uploadImageForVision(
  file: File,
  fetchFn: FetchFn = fetch
): Promise<VisionResponse> {
  validateImageFile(file)

  const formData = new FormData()
  formData.append("image", file, file.name)

  let response: Response
  try {
    response = await fetchFn(resolveVisionUrl(), {
      method: "POST",
      body: formData,
    })
  } catch {
    throw new VisionImportError(
      0,
      "Vision service is unavailable.",
      "Start apps/ai-service on :8001 or check VITE_AI_SERVICE_URL, then retry."
    )
  }

  if (response.ok) {
    const data = (await response.json()) as VisionResponse
    if (data?.model?.nodes && Array.isArray(data.model.nodes)) {
      data.model.nodes = data.model.nodes.map(normalizeVisionNode)
    }
    return data
  }

  if (response.status === 413) {
    throw new VisionImportError(
      413,
      "Image exceeds the 10MB limit.",
      "Compress or resize the photo below 10MB and try again."
    )
  }
  if (response.status === 422) {
    const detail = await readErrorDetail(response)
    throw new VisionImportError(
      422,
      detail || "The image could not be processed.",
      "Use JPG, PNG, or WebP with a minimum resolution of 640x480."
    )
  }
  if (response.status === 504) {
    throw new VisionImportError(
      504,
      "Vision provider timed out after 10s.",
      "Retry in a few seconds; the request is safe to repeat."
    )
  }
  throw new VisionImportError(
    0,
    `Vision request failed (HTTP ${response.status}).`,
    "Verify the vision service is running, then retry."
  )
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      detail?: string
      message?: string
    }
    return data.detail ?? data.message ?? ""
  } catch {
    return ""
  }
}

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

export type VisionModelValidation = {
  valid: boolean
  errors: string[]
  offendingIds: string[]
}

/**
 * Client-side re-validation before any Yjs merge (defense in depth; the
 * server enforces the same gate). Class diagrams only (OMG UML 2.5).
 */
export function validateVisionModel(model: unknown): VisionModelValidation {
  const errors: string[] = []
  const offendingIds: string[] = []

  if (!model || typeof model !== "object") {
    return {
      valid: false,
      errors: ["Extracted model is empty."],
      offendingIds,
    }
  }
  const candidate = model as Partial<UMLModel>
  if (!Array.isArray(candidate.nodes) || !Array.isArray(candidate.edges)) {
    return {
      valid: false,
      errors: ["Extracted model must contain nodes and edges arrays."],
      offendingIds,
    }
  }

  for (const node of candidate.nodes) {
    if (!ALLOWED_NODE_TYPES.has(node.type)) {
      errors.push(`Node "${node.id}" has forbidden type "${node.type}".`)
      offendingIds.push(node.id)
    }
  }
  for (const edge of candidate.edges) {
    if (!ALLOWED_EDGE_TYPES.has(edge.type)) {
      errors.push(`Relationship "${edge.id}" has forbidden type "${edge.type}".`)
      offendingIds.push(edge.id)
    }
  }

  return { valid: errors.length === 0, errors, offendingIds }
}

const DEFAULT_NODE_SIZE = { width: 180, height: 120 }
const CASCADE_STEP = 32

export function normalizeVisionNode(node: UmlStudioNode): UmlStudioNode {
  const data = (node.data ? { ...node.data } : { name: "Class" }) as Record<string, unknown>
  if (Array.isArray(data.attributes)) {
    data.attributes = data.attributes.map((attr: unknown, idx: number) => {
      if (typeof attr === "string") {
        return { id: `attr-${node.id}-${idx + 1}`, name: attr }
      }
      if (attr && typeof attr === "object") {
        const item = attr as { id?: string; name?: string }
        return {
          id: item.id || `attr-${node.id}-${idx + 1}`,
          name: typeof item.name === "string" ? item.name : String(attr),
        }
      }
      return { id: `attr-${node.id}-${idx + 1}`, name: String(attr ?? "") }
    })
  } else {
    data.attributes = []
  }

  if (Array.isArray(data.methods)) {
    data.methods = data.methods.map((meth: unknown, idx: number) => {
      if (typeof meth === "string") {
        return { id: `meth-${node.id}-${idx + 1}`, name: meth }
      }
      if (meth && typeof meth === "object") {
        const item = meth as { id?: string; name?: string; isAbstract?: boolean }
        return {
          id: item.id || `meth-${node.id}-${idx + 1}`,
          name: typeof item.name === "string" ? item.name : String(meth),
          ...(item.isAbstract ? { isAbstract: true } : {}),
        }
      }
      return { id: `meth-${node.id}-${idx + 1}`, name: String(meth ?? "") }
    })
  } else {
    data.methods = []
  }

  return {
    ...node,
    data: data as UmlStudioNode["data"],
  }
}

function randomId(): string {
  const cryptoRef = globalThis.crypto
  if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
    return cryptoRef.randomUUID()
  }
  return `vision-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}

function withGeometryFallback(node: UmlStudioNode, index: number): UmlStudioNode {
  const width = node.width > 0 ? node.width : DEFAULT_NODE_SIZE.width
  const height = node.height > 0 ? node.height : DEFAULT_NODE_SIZE.height
  const position = node.position ?? { x: 0, y: 0 }
  return {
    ...node,
    width,
    height,
    position: {
      x: position.x + index * CASCADE_STEP,
      y: position.y + index * CASCADE_STEP,
    },
    measured: node.measured ?? { width, height },
  }
}

/**
 * FA-01 merge: appends the extracted elements to the current diagram.
 * Never mutates its inputs; id collisions are remapped (edges follow).
 * FA-02 (cancel) never calls this — the preview stays in local state.
 */
export function mergeVisionModel(current: UMLModel, incoming: UMLModel): UMLModel {
  const takenIds = new Set([
    ...current.nodes.map((node) => node.id),
    ...current.edges.map((edge) => edge.id),
  ])
  const remappedIds = new Map<string, string>()

  const takeId = (id: string): string => {
    if (!takenIds.has(id)) {
      takenIds.add(id)
      return id
    }
    const fresh = randomId()
    takenIds.add(fresh)
    remappedIds.set(id, fresh)
    return fresh
  }

  const nodes: UmlStudioNode[] = incoming.nodes.map((node, index) =>
    withGeometryFallback(normalizeVisionNode({ ...node, id: takeId(node.id) }), index)
  )
  const edges: UmlStudioEdge[] = incoming.edges.map((edge) => ({
    ...edge,
    id: takeId(edge.id),
    source: remappedIds.get(edge.source) ?? edge.source,
    target: remappedIds.get(edge.target) ?? edge.target,
    sourceHandle: edge.sourceHandle || "right",
    targetHandle: edge.targetHandle || "left",
    data: edge.data ?? { points: [] },
  }))

  return {
    ...current,
    nodes: [...current.nodes, ...nodes],
    edges: [...current.edges, ...edges],
  }
}

export function formatConfidence(value: number | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—"
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`
}
