import { useMemo } from "react"
import type { Node } from "@xyflow/react"
import { EDGES } from "@/constants"
import type { IPoint } from "@/edges/Connection"
import { useDiagramStore, useEdgeGeometryStore } from "@/store/context"
import type { ObstacleRect } from "@/utils/geometry/obstacles"
import { getEdgeObstacles, getContainerBorderPolylines } from "@/utils/geometry/obstacles"
import { selectRouteEntriesIntersectingRect } from "@/utils/geometry/edgeGeometrySubscriptions"
import { useStableValue } from "./useStableValue"

const obstaclesEqual = (a: ObstacleRect[], b: ObstacleRect[]): boolean => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (
      x.id !== y.id ||
      x.x !== y.x ||
      x.y !== y.y ||
      x.width !== y.width ||
      x.height !== y.height ||
      !!x.soft !== !!y.soft
    ) {
      return false
    }
  }
  return true
}

const polylinesEqual = (a: IPoint[][], b: IPoint[][]): boolean => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const p = a[i]
    const q = b[i]
    if (p.length !== q.length) return false
    for (let j = 0; j < p.length; j++) {
      if (p[j].x !== q[j].x || p[j].y !== q[j].y) return false
    }
  }
  return true
}

export const useEdgeRoutingContext = ({
  selfId,
  nodes,
  sourceId,
  targetId,
  sourcePoint,
  targetPoint,
}: {
  selfId?: string
  nodes: Node[]
  sourceId: string
  targetId: string
  sourcePoint: IPoint
  targetPoint: IPoint
}): {
  obstacles: ObstacleRect[]
  neighborEdges: IPoint[][]
} => {
  const geometryById = useEdgeGeometryStore((state) => state.geometryById)
  const edges = useDiagramStore((state) => state.edges)
  const { x: sx, y: sy } = sourcePoint
  const { x: tx, y: ty } = targetPoint

  const isSibling = useMemo(() => {
    const byId = new Map(edges.map((edge) => [edge.id, edge]))
    const self = selfId ? byId.get(selfId) : undefined

    return (otherId: string): boolean => {
      const other = byId.get(otherId)
      if (!self || !other) return false

      const sharedNodes = ([other.source, other.target] as string[]).filter((n) =>
        [sourceId, targetId].includes(n)
      ).length
      if (sharedNodes !== 1) return false

      const ends = [
        [self.source, self.sourceHandle],
        [self.target, self.targetHandle],
      ] as const
      const otherEnds = [
        [other.source, other.sourceHandle],
        [other.target, other.targetHandle],
      ] as const

      return ends.some(([node, handle]) =>
        otherEnds.some(([otherNode, otherHandle]) => node === otherNode && handle === otherHandle)
      )
    }
  }, [edges, selfId, sourceId, targetId])

  const obstacles = useMemo(
    () => getEdgeObstacles(nodes, sourceId, targetId, { x: sx, y: sy }, { x: tx, y: ty }),
    [nodes, sourceId, targetId, sx, sy, tx, ty]
  )

  const neighborEdges = useMemo<IPoint[][]>(() => {
    const borders = getContainerBorderPolylines(nodes, sourceId, targetId)

    const pad = EDGES.STUB_LENGTH * 6
    const minX = Math.min(sx, tx) - pad
    const maxX = Math.max(sx, tx) + pad
    const minY = Math.min(sy, ty) - pad
    const maxY = Math.max(sy, ty) + pad

    const candidates = selectRouteEntriesIntersectingRect(
      geometryById,
      {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      },
      selfId
    )
    const neighbors: IPoint[][] = []
    for (let index = 0; index < candidates.length; index += 2) {
      const otherId = candidates[index] as string
      const polyline = candidates[index + 1] as IPoint[]
      if (selfId !== undefined && otherId >= selfId) continue
      if (isSibling(otherId)) continue
      neighbors.push(polyline)
    }

    neighbors.push(...borders)
    return neighbors
  }, [geometryById, selfId, nodes, sourceId, targetId, sx, sy, tx, ty, isSibling])

  const stableObstacles = useStableValue(obstacles, obstaclesEqual)
  const stableNeighbors = useStableValue(neighborEdges, polylinesEqual)

  return {
    obstacles: stableObstacles,
    neighborEdges: stableNeighbors,
  }
}
