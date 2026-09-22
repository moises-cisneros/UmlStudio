import { Position } from "@xyflow/system"
import { IPoint } from "@/edges/Connection"
import { removeDuplicatePoints } from "@/utils/edgeUtils"
import { EDGES } from "@/utils/geometry/routingConstants"

export function collapseCollinearPoints(points: IPoint[]): IPoint[] {
  if (points.length <= 2) return points
  const result: IPoint[] = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1]
    const curr = points[i]
    const next = points[i + 1]
    const collinearX = Math.abs(prev.x - curr.x) < 1 && Math.abs(curr.x - next.x) < 1
    const collinearY = Math.abs(prev.y - curr.y) < 1 && Math.abs(curr.y - next.y) < 1
    if (!collinearX && !collinearY) result.push(curr)
  }
  result.push(points[points.length - 1])
  return result
}

export type SegmentKind = "source-terminal" | "target-terminal" | "inner"

export interface BendHandle {
  segmentIndex: number
  position: IPoint
  orientation: "H" | "V"
  kind: SegmentKind
  bendableLength: number
}

const ORIENTATION_TOLERANCE_PX = 1

const snapToGrid = (value: number, grid: number): number => {
  if (grid <= 0) return value
  return Math.round(value / grid) * grid
}

export function getSegmentOrientation(points: IPoint[], segmentIndex: number): "H" | "V" {
  const start = points[segmentIndex]
  const end = points[segmentIndex + 1]
  if (!start || !end) return "H"
  return Math.abs(start.y - end.y) <= ORIENTATION_TOLERANCE_PX ? "H" : "V"
}

export function getSegmentKind(segmentIndex: number, totalPoints: number): SegmentKind {
  if (segmentIndex === 0) return "source-terminal"
  if (segmentIndex === totalPoints - 2) return "target-terminal"
  return "inner"
}

export function getStubExit(nodePoint: IPoint, position: Position, stubLength: number): IPoint {
  switch (position) {
    case Position.Right:
      return { x: nodePoint.x + stubLength, y: nodePoint.y }
    case Position.Left:
      return { x: nodePoint.x - stubLength, y: nodePoint.y }
    case Position.Bottom:
      return { x: nodePoint.x, y: nodePoint.y + stubLength }
    case Position.Top:
    default:
      return { x: nodePoint.x, y: nodePoint.y - stubLength }
  }
}

export function getBendHandlePosition(points: IPoint[], segmentIndex: number): IPoint {
  const totalPoints = points.length
  if (totalPoints < 2) return { x: 0, y: 0 }

  const start = points[segmentIndex]
  const end = points[segmentIndex + 1]

  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  }
}

const terminalArmFloorPx = (grid: number): number => {
  const g = grid > 0 ? grid : 1
  return Math.ceil((EDGES.ORTHOGONAL_ARM_OVERLAP_PX + 1) / g) * g
}

const terminalBendFloorPx = (): number =>
  EDGES.MIN_STUB_LENGTH + terminalArmFloorPx(EDGES.BEND_SNAP_GRID_PX)

export function getBendableSegments(points: IPoint[], safeAreaPx: number): BendHandle[] {
  const collapsed = collapseCollinearPoints(points)
  if (collapsed.length < 2) return []

  const lastSegment = collapsed.length - 2

  const handles: BendHandle[] = []
  for (let i = 0; i <= lastSegment; i++) {
    const start = collapsed[i]
    const end = collapsed[i + 1]
    const rawLength = Math.abs(end.x - start.x) + Math.abs(end.y - start.y)
    if (rawLength <= 0) continue

    const reserveStart = i === 0 ? Math.min(safeAreaPx, rawLength / 2) : 0
    const reserveEnd = i === lastSegment ? Math.min(safeAreaPx, rawLength / 2) : 0
    const bendRegion = rawLength - reserveStart - reserveEnd

    const kind = getSegmentKind(i, collapsed.length)
    const isTerminal = kind !== "inner"
    const isLoneSegment = lastSegment === 0
    if (isTerminal && !isLoneSegment && rawLength < terminalBendFloorPx()) {
      continue
    }

    const fitsPastSafeArea = bendRegion > 0
    const centreFromStart = fitsPastSafeArea ? reserveStart + bendRegion / 2 : rawLength / 2

    const t = centreFromStart / rawLength
    handles.push({
      segmentIndex: i,
      position: {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      },
      orientation: getSegmentOrientation(collapsed, i),
      kind,
      bendableLength: fitsPastSafeArea ? bendRegion : rawLength,
    })
  }

  return handles
}

export function applyInnerSegmentBend(
  points: IPoint[],
  segmentIndex: number,
  delta: IPoint,
  snapGrid: number
): IPoint[] {
  const collapsed = collapseCollinearPoints(points)
  if (collapsed.length < 2) return points
  if (segmentIndex < 0 || segmentIndex >= collapsed.length - 1) return points
  points = collapsed

  const lastSegmentIndex = points.length - 2
  const orientation = getSegmentOrientation(points, segmentIndex)
  const updated = [...points]

  const adjSourceSame =
    segmentIndex > 0 && getSegmentOrientation(points, segmentIndex - 1) === orientation
  const adjTargetSame =
    segmentIndex < lastSegmentIndex &&
    getSegmentOrientation(points, segmentIndex + 1) === orientation

  const finalizePoints = (candidate: IPoint[]): IPoint[] => {
    const deduplicated = removeDuplicatePoints(candidate)
    if (deduplicated.length < 2) return deduplicated

    return deduplicated
  }

  if (orientation === "H") {
    const newY = snapToGrid(points[segmentIndex].y + delta.y, snapGrid)
    updated[segmentIndex] = { x: updated[segmentIndex].x, y: newY }
    updated[segmentIndex + 1] = { x: updated[segmentIndex + 1].x, y: newY }

    if (adjSourceSame && adjTargetSame) {
      return finalizePoints([
        ...updated.slice(0, segmentIndex),
        points[segmentIndex],
        updated[segmentIndex],
        updated[segmentIndex + 1],
        points[segmentIndex + 1],
        ...updated.slice(segmentIndex + 2),
      ])
    }

    if (adjTargetSame) {
      return finalizePoints([
        ...updated.slice(0, segmentIndex + 2),
        points[segmentIndex + 1],
        ...updated.slice(segmentIndex + 2),
      ])
    }

    if (adjSourceSame) {
      return finalizePoints([
        ...updated.slice(0, segmentIndex),
        points[segmentIndex],
        ...updated.slice(segmentIndex),
      ])
    }
  } else {
    const newX = snapToGrid(points[segmentIndex].x + delta.x, snapGrid)
    updated[segmentIndex] = { x: newX, y: updated[segmentIndex].y }
    updated[segmentIndex + 1] = { x: newX, y: updated[segmentIndex + 1].y }

    if (adjSourceSame && adjTargetSame) {
      return finalizePoints([
        ...updated.slice(0, segmentIndex),
        points[segmentIndex],
        updated[segmentIndex],
        updated[segmentIndex + 1],
        points[segmentIndex + 1],
        ...updated.slice(segmentIndex + 2),
      ])
    }

    if (adjTargetSame) {
      return finalizePoints([
        ...updated.slice(0, segmentIndex + 2),
        points[segmentIndex + 1],
        ...updated.slice(segmentIndex + 2),
      ])
    }

    if (adjSourceSame) {
      return finalizePoints([
        ...updated.slice(0, segmentIndex),
        points[segmentIndex],
        ...updated.slice(segmentIndex),
      ])
    }
  }

  return finalizePoints(updated)
}

export function computeToolbarPosition(
  pathMiddlePosition: IPoint,
  isMiddlePathHorizontal: boolean,
  extraClearance = 0
): IPoint {
  return {
    x: pathMiddlePosition.x + (isMiddlePathHorizontal ? 0 : -52 - extraClearance),
    y: pathMiddlePosition.y + (isMiddlePathHorizontal ? -64 - extraClearance : 0),
  }
}

function computeTerminalJogCoordinate(
  endpointCoord: number,
  cornerCoord: number,
  stubLength: number,
  snapGrid: number
): number {
  const grid = snapGrid > 0 ? snapGrid : 1
  const armFloor = terminalArmFloorPx(grid)
  const minStub = Math.min(EDGES.MIN_STUB_LENGTH, stubLength)

  const span = Math.abs(cornerCoord - endpointCoord)
  const direction = cornerCoord >= endpointCoord ? 1 : -1
  const stub = Math.min(stubLength, Math.max(minStub, span - armFloor))
  return snapToGrid(endpointCoord + direction * stub, snapGrid)
}

export function applyTerminalSegmentBend(
  points: IPoint[],
  handle: BendHandle,
  delta: IPoint,
  sourcePosition: Position,
  targetPosition: Position,
  stubLength: number,
  snapGrid: number
): IPoint[] {
  if (points.length < 2) return points

  const orientation = getSegmentOrientation(points, handle.segmentIndex)

  if (handle.kind === "source-terminal") {
    points = collapseCollinearPoints(points)
    const stubExit = getStubExit(points[0], sourcePosition, stubLength)
    const isSingleSegment = points.length === 2
    const targetStubExit = isSingleSegment
      ? getStubExit(points[points.length - 1], targetPosition, stubLength)
      : null
    const updatedPoints = [...points]

    if (orientation === "H") {
      const newY = snapToGrid(stubExit.y + delta.y, snapGrid)
      if (isSingleSegment && targetStubExit) {
        return removeDuplicatePoints([
          points[0],
          stubExit,
          { x: stubExit.x, y: newY },
          { x: targetStubExit.x, y: newY },
          targetStubExit,
          points[1],
        ])
      }
      const jogX = computeTerminalJogCoordinate(
        points[0].x,
        updatedPoints[1].x,
        stubLength,
        snapGrid
      )
      updatedPoints[1] = { x: updatedPoints[1].x, y: newY }
      return removeDuplicatePoints([
        points[0],
        { x: jogX, y: points[0].y },
        { x: jogX, y: newY },
        updatedPoints[1],
        ...updatedPoints.slice(2),
        points[points.length - 1],
      ])
    }

    const newX = snapToGrid(stubExit.x + delta.x, snapGrid)
    if (isSingleSegment && targetStubExit) {
      return removeDuplicatePoints([
        points[0],
        stubExit,
        { x: newX, y: stubExit.y },
        { x: newX, y: targetStubExit.y },
        targetStubExit,
        points[1],
      ])
    }
    const jogY = computeTerminalJogCoordinate(points[0].y, updatedPoints[1].y, stubLength, snapGrid)
    updatedPoints[1] = { x: newX, y: updatedPoints[1].y }
    return removeDuplicatePoints([
      points[0],
      { x: points[0].x, y: jogY },
      { x: newX, y: jogY },
      updatedPoints[1],
      ...updatedPoints.slice(2),
      points[points.length - 1],
    ])
  }

  if (handle.kind === "target-terminal") {
    points = collapseCollinearPoints(points)
    const lastIdx = points.length - 1
    const lastSegIdx = points.length - 2
    const stubExit = getStubExit(points[lastIdx], targetPosition, stubLength)

    if (orientation === "H") {
      const newY = snapToGrid(stubExit.y + delta.y, snapGrid)
      const updatedPoints = [...points]
      const cornerX = updatedPoints[lastSegIdx].x
      const jogX = computeTerminalJogCoordinate(points[lastIdx].x, cornerX, stubLength, snapGrid)
      updatedPoints[lastSegIdx] = { x: cornerX, y: newY }
      const leading = updatedPoints.slice(0, lastSegIdx + 1)
      return removeDuplicatePoints([
        points[0],
        ...leading,
        { x: jogX, y: newY },
        { x: jogX, y: points[lastIdx].y },
        points[lastIdx],
      ])
    }

    const newX = snapToGrid(stubExit.x + delta.x, snapGrid)
    const updatedPoints = [...points]
    const cornerY = updatedPoints[lastSegIdx].y
    const jogY = computeTerminalJogCoordinate(points[lastIdx].y, cornerY, stubLength, snapGrid)
    updatedPoints[lastSegIdx] = { x: newX, y: cornerY }
    const leading = updatedPoints.slice(0, lastSegIdx + 1)
    return removeDuplicatePoints([
      points[0],
      ...leading,
      { x: newX, y: jogY },
      { x: points[lastIdx].x, y: jogY },
      points[lastIdx],
    ])
  }

  return points
}
