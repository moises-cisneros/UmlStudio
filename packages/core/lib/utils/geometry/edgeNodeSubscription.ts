import type { Node } from "@xyflow/react"
import type { EdgeGeometryNodeSnapshot } from "./edgeGeometryPreview"
import { isRoutingParentNodeType } from "./nodeGeometry"

const NO_EDGE_NODE_SUBSCRIPTION: readonly Node[] = []

export const selectEdgeNodeSubscription = (
  nodes: readonly Node[],
  subscribe: boolean
): readonly Node[] => (subscribe ? nodes : NO_EDGE_NODE_SUBSCRIPTION)

export const resolveEdgeGeometryNodes = (
  subscribedNodes: readonly Node[],
  getNodes: () => Node[],
  subscribed: boolean
): readonly Node[] => (subscribed ? subscribedNodes : getNodes())

export type EdgeLabelQueryBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export const selectNearbySettledNodeGeometry = (
  nodes: EdgeGeometryNodeSnapshot,
  edgeBounds: EdgeLabelQueryBounds,
  reach: number
): number[] => {
  const left = edgeBounds.minX - reach
  const top = edgeBounds.minY - reach
  const right = edgeBounds.maxX + reach
  const bottom = edgeBounds.maxY + reach
  const geometry: number[] = []

  for (const node of nodes.values()) {
    if (!node.width || !node.height || isRoutingParentNodeType(node.type))
      continue
    if (
      node.x < right &&
      node.x + node.width > left &&
      node.y < bottom &&
      node.y + node.height > top
    )
      geometry.push(node.x, node.y, node.width, node.height)
  }
  return geometry
}

export const createNearbySettledNodeGeometrySelector = (
  edgeBounds: EdgeLabelQueryBounds,
  reach: number
): ((nodes: EdgeGeometryNodeSnapshot) => number[]) => {
  let previousNodes: EdgeGeometryNodeSnapshot | undefined
  let previousSelection: number[] = []
  return (nodes) => {
    if (nodes === previousNodes) return previousSelection
    previousNodes = nodes
    previousSelection = selectNearbySettledNodeGeometry(
      nodes,
      edgeBounds,
      reach
    )
    return previousSelection
  }
}
