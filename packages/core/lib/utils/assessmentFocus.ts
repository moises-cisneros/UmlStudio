import type { Edge, Node } from "@xyflow/react"
import type { EdgeGeometryStore } from "@/store/edgeGeometryStore"
import type { IPoint } from "@/edges/Connection"
import { getPositionOnCanvas } from "@/utils/nodeUtils"
import { getStraightMidSegment } from "@/utils/geometry/edgeLabelLayout"

export const ASSESSMENT_FOCUS_CLASS = "umlstudio-assessment-focus"

export const getAssessmentElementCenter = (
  element: Node | Edge,
  nodes: Node[],
  routes: Pick<EdgeGeometryStore, "geometryById" | "previewById">
): IPoint | undefined => {
  if ("source" in element) {
    const route = routes.previewById[element.id] ?? routes.geometryById[element.id]
    if (route?.length > 1)
      return getStraightMidSegment(route, route[0], route[route.length - 1]).point
  }

  const nodeIds = "source" in element ? [element.source, element.target] : [element.id]
  const anchors = nodeIds
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node): node is Node => node !== undefined)
  if (anchors.length === 0) return undefined

  const sum = anchors.reduce(
    (center, node) => {
      const position = getPositionOnCanvas(node, nodes)
      const posX = Number.isFinite(position?.x) ? position.x : 0
      const posY = Number.isFinite(position?.y) ? position.y : 0
      const w = Number.isFinite(node.width) ? (node.width as number) : 160
      const h = Number.isFinite(node.height) ? (node.height as number) : 100
      return {
        x: center.x + posX + w / 2,
        y: center.y + posY + h / 2,
      }
    },
    { x: 0, y: 0 }
  )
  const finalX = sum.x / anchors.length
  const finalY = sum.y / anchors.length
  if (!Number.isFinite(finalX) || !Number.isFinite(finalY)) return undefined
  return { x: finalX, y: finalY }
}

export function applyAssessmentFocus<T extends { id: string; className?: string }>(
  elements: T[],
  focusedId: string | null
): T[] {
  if (!focusedId) return elements
  if (!elements.some((element) => element.id === focusedId)) return elements
  return elements.map((element) =>
    element.id === focusedId
      ? {
          ...element,
          className: [element.className, ASSESSMENT_FOCUS_CLASS].filter(Boolean).join(" "),
        }
      : element
  )
}
