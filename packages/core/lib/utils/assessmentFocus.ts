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
    const route =
      routes.previewById[element.id] ?? routes.geometryById[element.id]
    if (route?.length > 1)
      return getStraightMidSegment(route, route[0], route[route.length - 1])
        .point
  }

  const nodeIds =
    "source" in element ? [element.source, element.target] : [element.id]
  const anchors = nodeIds
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node): node is Node => node !== undefined)
  if (anchors.length === 0) return undefined

  const sum = anchors.reduce(
    (center, node) => {
      const position = getPositionOnCanvas(node, nodes)
      return {
        x: center.x + position.x + (node.width ?? 0) / 2,
        y: center.y + position.y + (node.height ?? 0) / 2,
      }
    },
    { x: 0, y: 0 }
  )
  return { x: sum.x / anchors.length, y: sum.y / anchors.length }
}

export function applyAssessmentFocus<
  T extends { id: string; className?: string },
>(elements: T[], focusedId: string | null): T[] {
  if (!focusedId) return elements
  if (!elements.some((element) => element.id === focusedId)) return elements
  return elements.map((element) =>
    element.id === focusedId
      ? {
          ...element,
          className: [element.className, ASSESSMENT_FOCUS_CLASS]
            .filter(Boolean)
            .join(" "),
        }
      : element
  )
}
