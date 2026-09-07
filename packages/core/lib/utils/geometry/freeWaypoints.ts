import { IPoint } from "@/edges/Connection"
import { EDGES } from "@/utils/geometry/routingConstants"

export interface SegmentGhostHandle {
  segmentIndex: number
  position: IPoint
  segmentLengthSq: number
}

const snap = (value: number, grid: number): number =>
  grid > 0 ? Math.round(value / grid) * grid : Math.round(value)

export const snapPoint = (
  point: IPoint,
  grid: number = EDGES.BEND_SNAP_GRID_PX
): IPoint => ({ x: snap(point.x, grid), y: snap(point.y, grid) })

export const getSegmentGhostHandles = (
  route: readonly IPoint[],
  minimumSegmentLength: number = EDGES.WAYPOINT_GHOST_MIN_SEGMENT_PX
): SegmentGhostHandle[] => {
  const handles: SegmentGhostHandle[] = []
  const minLenSq = minimumSegmentLength * minimumSegmentLength
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i]
    const b = route[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSq = dx * dx + dy * dy
    if (lengthSq < minLenSq) continue
    handles.push({
      segmentIndex: i,
      position: {
        x: Math.round((a.x + b.x) / 2),
        y: Math.round((a.y + b.y) / 2),
      },
      segmentLengthSq: lengthSq,
    })
  }
  return handles
}

export const insertWaypoint = (
  interior: readonly IPoint[],
  segmentIndex: number,
  point: IPoint,
  grid: number = EDGES.BEND_SNAP_GRID_PX
): IPoint[] => {
  const index = Math.max(0, Math.min(segmentIndex, interior.length))
  const next = interior.slice()
  next.splice(index, 0, snapPoint(point, grid))
  return next
}

export const moveWaypoint = (
  interior: readonly IPoint[],
  index: number,
  point: IPoint,
  grid: number = EDGES.BEND_SNAP_GRID_PX
): IPoint[] => {
  if (index < 0 || index >= interior.length) return interior.slice()
  const next = interior.slice()
  next[index] = snapPoint(point, grid)
  return next
}

export const snapPointToAngle = (
  point: IPoint,
  reference: IPoint,
  divisions: number = 24
): IPoint => {
  const dx = point.x - reference.x
  const dy = point.y - reference.y
  const distance = Math.sqrt(dx * dx + dy * dy)
  if (distance === 0 || divisions <= 0) return { ...reference }
  const increment = (Math.PI * 2) / divisions
  const angle = Math.round(Math.atan2(dy, dx) / increment) * increment
  return {
    x: Math.round(reference.x + Math.cos(angle) * distance),
    y: Math.round(reference.y + Math.sin(angle) * distance),
  }
}

export const isWaypointCollapseCandidate = (
  route: readonly IPoint[],
  routeIndex: number,
  point: IPoint,
  tolerancePx: number
): boolean => {
  if (routeIndex <= 0 || routeIndex >= route.length - 1) return false
  const before = route[routeIndex - 1]
  const after = route[routeIndex + 1]
  const dx = after.x - before.x
  const dy = after.y - before.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return true
  const projection =
    ((point.x - before.x) * dx + (point.y - before.y) * dy) / lengthSq
  if (projection < 0 || projection > 1) return false
  const distanceX = point.x - (before.x + projection * dx)
  const distanceY = point.y - (before.y + projection * dy)
  return (
    distanceX * distanceX + distanceY * distanceY <= tolerancePx * tolerancePx
  )
}

export const removeWaypoint = (
  interior: readonly IPoint[],
  index: number
): IPoint[] => {
  if (index < 0 || index >= interior.length) return interior.slice()
  const next = interior.slice()
  next.splice(index, 1)
  return next
}

export const pruneCollinearWaypoints = (
  route: readonly IPoint[],
  tolerancePx: number = EDGES.WAYPOINT_COLLINEAR_TOLERANCE_PX
): IPoint[] => {
  if (route.length <= 2) return []
  const tolSq = tolerancePx * tolerancePx
  const kept: IPoint[] = [route[0]]
  for (let i = 1; i < route.length - 1; i++) {
    const a = kept[kept.length - 1]
    const b = route[i]
    const c = route[i + 1]
    const abx = c.x - a.x
    const aby = c.y - a.y
    const spanSq = abx * abx + aby * aby
    const cross = (b.x - a.x) * aby - (b.y - a.y) * abx
    if (spanSq === 0 || cross * cross <= tolSq * spanSq) continue
    kept.push(b)
  }
  return kept.slice(1)
}

export const exceedsDragThreshold = (
  from: IPoint,
  to: IPoint,
  thresholdPx: number = EDGES.WAYPOINT_DRAG_THRESHOLD_PX
): boolean => {
  const dx = to.x - from.x
  const dy = to.y - from.y
  return dx * dx + dy * dy > thresholdPx * thresholdPx
}
