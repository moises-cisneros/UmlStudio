import { useCallback } from "react"
import { useReactFlow, type Rect, type XYPosition } from "@xyflow/react"
import { pickNearestConnectable } from "@/utils/connectionModes"

const DROP_HIT_RADIUS_PX = 11

export type FreeformDropTarget = { id: string; type?: string; rect: Rect }

export function useFreeformDropTarget() {
  const { getIntersectingNodes, getInternalNode } = useReactFlow()
  return useCallback(
    (point: XYPosition, fromNodeId?: string): FreeformDropTarget | null => {
      const hits = getIntersectingNodes({
        x: point.x - DROP_HIT_RADIUS_PX,
        y: point.y - DROP_HIT_RADIUS_PX,
        width: DROP_HIT_RADIUS_PX * 2,
        height: DROP_HIT_RADIUS_PX * 2,
      }).filter((node) => node.width != null && node.height != null)
      if (hits.length === 0) return null

      const nonSource = hits.filter((node) => node.id !== fromNodeId)
      const pool = nonSource.length > 0 ? nonSource : hits

      const candidates = pool.flatMap((node) => {
        const internal = getInternalNode(node.id)
        return internal
          ? [
              {
                node,
                type: node.type,
                rect: {
                  x: internal.internals.positionAbsolute.x,
                  y: internal.internals.positionAbsolute.y,
                  width: node.width!,
                  height: node.height!,
                },
              },
            ]
          : []
      })
      const best = pickNearestConnectable(candidates, point)
      return best ? { id: best.node.id, type: best.node.type, rect: best.rect } : null
    },
    [getIntersectingNodes, getInternalNode]
  )
}
