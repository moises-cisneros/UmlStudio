import type { Node, XYPosition } from "@xyflow/react"
import { generateUUID, type DropElementConfig } from "@/constants"

function hasStringId(item: unknown): item is { id: string } {
  return (
    typeof item === "object" && item !== null && typeof (item as { id?: unknown }).id === "string"
  )
}

export function remintNestedChildIds<T extends Record<string, unknown>>(data: T): T {
  const result: Record<string, unknown> = { ...data }
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value) && value.some(hasStringId)) {
      result[key] = value.map((item) =>
        hasStringId(item) ? { ...item, id: generateUUID() } : item
      )
    }
  }
  return result as T
}

export function instantiatePaletteData(
  defaultData?: Record<string, unknown>
): Record<string, unknown> {
  return remintNestedChildIds(structuredClone(defaultData ?? {}))
}

export function buildPaletteNode(
  config: DropElementConfig,
  position: XYPosition,
  options: { parentId?: string; selected?: boolean } = {}
): Node {
  const width = config.dropWidth ?? config.width
  const height = config.dropHeight ?? config.height
  return {
    id: generateUUID(),
    type: config.type,
    position: { ...position },
    width,
    height,
    measured: { width, height },
    data: instantiatePaletteData(config.defaultData),
    parentId: options.parentId,
    selected: options.selected ?? false,
  }
}

export interface VisibleFlowRect {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function snapToGrid(point: XYPosition, snapPx: number): XYPosition {
  if (snapPx <= 0) return { ...point }
  return {
    x: Math.round(point.x / snapPx) * snapPx,
    y: Math.round(point.y / snapPx) * snapPx,
  }
}

function isRectVisible(
  topLeft: XYPosition,
  width: number,
  height: number,
  rect: VisibleFlowRect
): boolean {
  return (
    topLeft.x < rect.maxX &&
    topLeft.x + width > rect.minX &&
    topLeft.y < rect.maxY &&
    topLeft.y + height > rect.minY
  )
}

export function resolveTapPosition(params: {
  centeredPosition: XYPosition
  anchorAbsolute: XYPosition | null
  nodeWidth: number
  nodeHeight: number
  visibleRect: VisibleFlowRect
  stepPx: number
  snapPx: number
}): XYPosition {
  const { centeredPosition, anchorAbsolute, nodeWidth, nodeHeight } = params
  if (anchorAbsolute) {
    const cascaded = snapToGrid(
      {
        x: anchorAbsolute.x + params.stepPx,
        y: anchorAbsolute.y + params.stepPx,
      },
      params.snapPx
    )
    if (isRectVisible(cascaded, nodeWidth, nodeHeight, params.visibleRect)) {
      return cascaded
    }
  }
  return centeredPosition
}
