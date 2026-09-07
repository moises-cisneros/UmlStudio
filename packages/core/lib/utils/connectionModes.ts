import { type Rect, type XYPosition, Position } from "@xyflow/system"
import {
  type FreeformEdgeAnchor,
  getFreeformAnchorFromPoint,
  getFreeformAnchorPoint,
} from "./edgeUtils"
import { getNodeConnectionRect } from "./geometry/nodeGeometry"

export type ConnectionMode =
  | "freeform-rect"
  | "package"
  | "none"

const MODE_OVERRIDES: Record<string, ConnectionMode> = {
  colorDescription: "none",
  titleAndDesctiption: "none",
  package: "package",
}

export function getConnectionMode(nodeType?: string): ConnectionMode {
  return (nodeType ? MODE_OVERRIDES[nodeType] : undefined) ?? "freeform-rect"
}

export function dropAnchorIsAimed(_nodeType?: string): boolean {
  return false
}

export function distanceToRect(point: XYPosition, rect: Rect): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width))
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height))
  return Math.hypot(dx, dy)
}

export function pickNearestConnectable<T>(
  candidates: ReadonlyArray<{ node: T; type?: string; rect: Rect }>,
  point: XYPosition
): { node: T; rect: Rect } | null {
  let best: { node: T; rect: Rect } | null = null
  let bestDistance = Infinity
  for (const candidate of candidates) {
    if (getConnectionMode(candidate.type) === "none") continue
    const distance = distanceToRect(point, candidate.rect)
    if (distance <= bestDistance) {
      bestDistance = distance
      best = { node: candidate.node, rect: candidate.rect }
    }
  }
  return best
}

export function getEdgeAnchorFromPoint(
  nodeType: string | undefined,
  point: XYPosition,
  rect: Rect
): FreeformEdgeAnchor | null {
  switch (getConnectionMode(nodeType)) {
    case "none":
      return null
    case "package":
      return getFreeformAnchorFromPoint(
        point,
        getNodeConnectionRect(nodeType, rect)
      )
    case "freeform-rect":
    default:
      return getFreeformAnchorFromPoint(point, rect)
  }
}

export function getEdgeAnchorPoint(
  nodeType: string | undefined,
  rect: Rect,
  anchor: FreeformEdgeAnchor
): { point: XYPosition; position: Position } {
  switch (getConnectionMode(nodeType)) {
    case "package":
      return getFreeformAnchorPoint(
        getNodeConnectionRect(nodeType, rect),
        anchor
      )
    case "none":
    case "freeform-rect":
    default:
      return getFreeformAnchorPoint(rect, anchor)
  }
}
