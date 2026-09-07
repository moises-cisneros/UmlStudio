import { useMemo } from "react"
import { useShallow } from "zustand/shallow"
import { EDGES } from "@/constants"
import { useEdgeGeometryStore } from "@/store/context"
import { IPoint, pointsToSvgPath } from "../edges/Connection"
import {
  LineJumpHit,
  buildPathWithLineJumps,
  computeLineJumpsForEdge,
} from "@/utils/edgeUtils"
import {
  createDisplayedRouteEntriesSelector,
  polylineBounds,
  selectedRoutesToRecord,
} from "@/utils/geometry/edgeGeometrySubscriptions"

export function useEdgeLineJumps(
  id: string | undefined,
  basePoints: IPoint[],
  enabled: boolean
): LineJumpHit[] {
  const baseBounds = useMemo(() => polylineBounds(basePoints), [basePoints])
  const selectIntersectingRoutes = useMemo(
    () => createDisplayedRouteEntriesSelector(baseBounds, id),
    [baseBounds, id]
  )
  const selectedRouteEntries = useEdgeGeometryStore(
    useShallow((state) =>
      enabled && id
        ? selectIntersectingRoutes(state.geometryById, state.previewById)
        : []
    )
  )

  return useMemo(() => {
    if (!enabled || !id) return []
    const geometryById = selectedRoutesToRecord(selectedRouteEntries)
    const geometryMap = new Map<string, IPoint[]>(Object.entries(geometryById))
    const edges = Object.keys(geometryById).map((edgeId) => ({ id: edgeId }))
    return computeLineJumpsForEdge(id, basePoints, edges, geometryMap)
  }, [enabled, id, basePoints, selectedRouteEntries])
}

export function buildEdgePath(
  points: IPoint[],
  lineJumps: LineJumpHit[],
  labelGap?: {
    segmentIndex: number
    center: IPoint
    halfSize: number
  }
): string {
  const seen = new Set<string>()
  const uniqueJumps = lineJumps.filter((jump) => {
    const key = `${jump.segmentIndex}:${Math.round(jump.point.x)}:${Math.round(
      jump.point.y
    )}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  if (labelGap) {
    const segmentIndex = labelGap.segmentIndex
    const start = points[segmentIndex]
    const end = points[segmentIndex + 1]
    if (start && end) {
      const dx = end.x - start.x
      const dy = end.y - start.y
      const lengthSq = dx * dx + dy * dy
      const length = Math.sqrt(lengthSq)
      if (length > 0) {
        const centerDistance = Math.max(
          0,
          Math.min(
            length,
            ((labelGap.center.x - start.x) * dx +
              (labelGap.center.y - start.y) * dy) /
              length
          )
        )
        const halfSize = Math.min(
          labelGap.halfSize,
          Math.max(0, centerDistance - 1),
          Math.max(0, length - centerDistance - 1)
        )
        const nx = dx / length
        const ny = dy / length
        const center = {
          x: start.x + nx * centerDistance,
          y: start.y + ny * centerDistance,
        }
        const gapStart = {
          x: center.x - nx * halfSize,
          y: center.y - ny * halfSize,
        }
        const gapEnd = {
          x: center.x + nx * halfSize,
          y: center.y + ny * halfSize,
        }
        const progress = (jump: LineJumpHit): number =>
          ((jump.point.x - start.x) * dx + (jump.point.y - start.y) * dy) /
          length
        const gapStartDistance = centerDistance - halfSize
        const gapEndDistance = centerDistance + halfSize
        const beforeJumps: LineJumpHit[] = []
        const afterJumps: LineJumpHit[] = []
        for (const jump of uniqueJumps) {
          if (jump.segmentIndex < segmentIndex) {
            beforeJumps.push(jump)
          } else if (jump.segmentIndex > segmentIndex) {
            afterJumps.push({
              ...jump,
              segmentIndex: jump.segmentIndex - segmentIndex,
            })
          } else {
            const distance = progress(jump)
            if (distance < gapStartDistance) beforeJumps.push(jump)
            else if (distance > gapEndDistance)
              afterJumps.push({ ...jump, segmentIndex: 0 })
          }
        }
        const beforePoints = [...points.slice(0, segmentIndex + 1), gapStart]
        const afterPoints = [gapEnd, ...points.slice(segmentIndex + 1)]
        return `${buildPathWithLineJumps(
          beforePoints,
          beforeJumps,
          EDGES.EDGE_LINE_JUMP_HEIGHT,
          EDGES.EDGE_LINE_JUMP_WIDTH
        )} ${buildPathWithLineJumps(
          afterPoints,
          afterJumps,
          EDGES.EDGE_LINE_JUMP_HEIGHT,
          EDGES.EDGE_LINE_JUMP_WIDTH
        )}`
      }
    }
  }

  if (uniqueJumps.length === 0) return pointsToSvgPath(points)
  return buildPathWithLineJumps(
    points,
    uniqueJumps,
    EDGES.EDGE_LINE_JUMP_HEIGHT,
    EDGES.EDGE_LINE_JUMP_WIDTH
  )
}
