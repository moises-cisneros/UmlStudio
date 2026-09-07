import type { Node, Rect } from "@xyflow/react"
import { EDGES } from "@/utils/geometry/routingConstants"
import {
  getRoutingPositionOnCanvas,
  isRoutingParentNodeType,
} from "@/utils/geometry/nodeGeometry"
import type { IPoint } from "@/edges/Connection"

export type ObstacleRect = {
  id: string
  x: number
  y: number
  width: number
  height: number
  soft: boolean
}

const contains = (rect: ObstacleRect, point: IPoint): boolean =>
  point.x >= rect.x &&
  point.x <= rect.x + rect.width &&
  point.y >= rect.y &&
  point.y <= rect.y + rect.height

const getAncestorIds = (node: Node, byId: Map<string, Node>): Set<string> => {
  const ancestors = new Set<string>()
  let current = node.parentId ? byId.get(node.parentId) : undefined
  while (current && !ancestors.has(current.id)) {
    ancestors.add(current.id)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return ancestors
}

const nodeSize = (node: Node): { width: number; height: number } => ({
  width: node.width ?? node.measured?.width ?? 0,
  height: node.height ?? node.measured?.height ?? 0,
})

export const getContainerBorderPolylines = (
  nodes: readonly Node[],
  sourceId: string,
  targetId: string,
  nodeIndex: NodeIndex = createNodeIndex(nodes)
): IPoint[][] => {
  const { byId, entries } = nodeIndex
  const containers = new Set<string>()
  for (const endpoint of [sourceId, targetId]) {
    const node = byId.get(endpoint)
    if (!node) continue
    for (const id of getAncestorIds(node, byId)) containers.add(id)
  }

  const borders: IPoint[][] = []
  for (const id of containers) {
    const entry = entries.get(id)
    if (!entry) continue
    const { x, y, width, height } = entry.body
    borders.push([
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
      { x, y },
    ])
  }
  return borders
}

type NodeEntry = { body: ObstacleRect; ancestors: Set<string> }
export type NodeIndex = {
  byId: Map<string, Node>
  entries: Map<string, NodeEntry>
}

export const createNodeIndex = (nodes: readonly Node[]): NodeIndex => {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const entries = new Map<string, NodeEntry>()
  for (const node of nodes) {
    if (node.hidden) continue
    const { width, height } = nodeSize(node)
    if (!width || !height) continue
    const { x, y } = getRoutingPositionOnCanvas(node, nodes)
    entries.set(node.id, {
      body: {
        id: node.id,
        x,
        y,
        width,
        height,
        soft: isRoutingParentNodeType(node.type),
      },
      ancestors: getAncestorIds(node, byId),
    })
  }

  return { byId, entries }
}

export const getEdgeObstacles = (
  nodes: readonly Node[],
  sourceId: string,
  targetId: string,
  sourcePoint: IPoint,
  targetPoint: IPoint,
  nodeIndex: NodeIndex = createNodeIndex(nodes),
  candidateBounds?: Rect
): ObstacleRect[] => {
  const { byId, entries } = nodeIndex
  const source = byId.get(sourceId)
  const target = byId.get(targetId)

  const excluded = new Set<string>()
  if (source) for (const id of getAncestorIds(source, byId)) excluded.add(id)
  if (target) for (const id of getAncestorIds(target, byId)) excluded.add(id)

  const obstacles: ObstacleRect[] = []

  for (const [id, otherPoint] of [
    [sourceId, targetPoint],
    [targetId, sourcePoint],
  ] as const) {
    const entry = entries.get(id)
    if (!entry || contains(entry.body, otherPoint)) continue
    obstacles.push({ ...entry.body, soft: false })
  }

  const candidates: ObstacleRect[] = []
  for (const [id, entry] of entries) {
    if (id === sourceId || id === targetId) continue
    if (excluded.has(id)) continue

    if (entry.ancestors.has(sourceId) || entry.ancestors.has(targetId)) continue

    if (contains(entry.body, sourcePoint) || contains(entry.body, targetPoint))
      continue

    candidates.push(entry.body)
  }

  const pad = 2 * EDGES.STUB_LENGTH + EDGES.NODE_CLEARANCE_PX
  let left =
    (candidateBounds?.x ?? Math.min(sourcePoint.x, targetPoint.x)) - pad
  let right =
    (candidateBounds
      ? candidateBounds.x + candidateBounds.width
      : Math.max(sourcePoint.x, targetPoint.x)) + pad
  let top = (candidateBounds?.y ?? Math.min(sourcePoint.y, targetPoint.y)) - pad
  let bottom =
    (candidateBounds
      ? candidateBounds.y + candidateBounds.height
      : Math.max(sourcePoint.y, targetPoint.y)) + pad

  const included = new Set<ObstacleRect>()
  for (let pass = 0; pass < 2; pass++) {
    const admitted: ObstacleRect[] = []
    for (const rect of candidates) {
      if (included.has(rect)) continue
      const near =
        rect.x - pad < right &&
        rect.x + rect.width + pad > left &&
        rect.y - pad < bottom &&
        rect.y + rect.height + pad > top
      if (near) admitted.push(rect)
    }
    if (admitted.length === 0) break

    for (const rect of admitted) {
      included.add(rect)
      left = Math.min(left, rect.x)
      right = Math.max(right, rect.x + rect.width)
      top = Math.min(top, rect.y)
      bottom = Math.max(bottom, rect.y + rect.height)
    }
  }
  obstacles.push(...candidates.filter((rect) => included.has(rect)))

  return obstacles
}
