import type { Node } from "@xyflow/react"
import type { Rect, XYPosition } from "@xyflow/system"

export const PACKAGE_TAB_HEIGHT = 10

export const getNodeConnectionRect = (
  nodeType: string | undefined,
  rect: Rect
): Rect => {
  if (nodeType !== "package") return rect
  const inset = Math.min(PACKAGE_TAB_HEIGHT, Math.max(0, rect.height))
  return {
    ...rect,
    y: rect.y + inset,
    height: Math.max(0, rect.height - inset),
  }
}

export const getRoutingPositionOnCanvas = (
  node: Node,
  allNodes: ReadonlyArray<Node>
): XYPosition => {
  const position: XYPosition = { x: node.position.x, y: node.position.y }
  let parent = node.parentId
    ? allNodes.find((candidate) => candidate.id === node.parentId)
    : null

  while (parent) {
    position.x += parent.position.x
    position.y += parent.position.y
    parent = parent.parentId
      ? allNodes.find((candidate) => candidate.id === parent!.parentId)
      : null
  }
  return position
}

const ROUTING_PARENT_NODE_TYPES = new Set([
  "package",
])

export const isRoutingParentNodeType = (nodeType?: string): boolean =>
  nodeType !== undefined && ROUTING_PARENT_NODE_TYPES.has(nodeType)
