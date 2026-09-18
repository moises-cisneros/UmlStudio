import { CANVAS, EDGES } from "@/utils/geometry/routingConstants"
import { IPoint, pointsToSvgPath } from "@/edges/Connection"
import { DiagramEdgeType, UMLDiagramType } from "@/typings"
import type { ObstacleRect } from "@/utils/geometry/obstacles"
import { clamp } from "@/utils/geometry/scalar"
import {
  routeAroundObstacles,
  routeConflictsWithNeighborEdges,
  routeRunsTooCloseToBody,
} from "@/utils/geometry/orthogonalRouter"
import {
  Position,
  ConnectionLineType,
  getSmoothStepPath,
  type Rect,
  type XYPosition,
} from "@xyflow/system"

export const adjustTargetCoordinates = (
  targetX: number,
  targetY: number,
  targetPosition: Position,
  markerPadding: number
): { targetX: number; targetY: number } => {
  if (targetPosition === "left") {
    targetX -= markerPadding
  } else if (targetPosition === "right") {
    targetX += markerPadding
  } else if (targetPosition === "top") {
    targetY -= markerPadding
  } else if (targetPosition === "bottom") {
    targetY += markerPadding
  }
  return { targetX, targetY }
}

export const adjustSourceCoordinates = (
  sourceX: number,
  sourceY: number,
  sourcePosition: Position,
  sourcePadding: number
): { sourceX: number; sourceY: number } => {
  if (sourcePosition === "left") {
    sourceX += sourcePadding
  } else if (sourcePosition === "right") {
    sourceX -= sourcePadding
  } else if (sourcePosition === "top") {
    sourceY += sourcePadding
  } else if (sourcePosition === "bottom") {
    sourceY -= sourcePadding
  }
  return { sourceX, sourceY }
}

export const getTargetConnectionPointPadding = (
  markerPadding: number,
  hasResolvedAnchor: boolean
): number =>
  hasResolvedAnchor ? markerPadding - EDGES.MARKER_PADDING : markerPadding

export const getEndpointSideFromSegment = (
  from: IPoint,
  toward: IPoint
): Position => {
  const dx = toward.x - from.x
  const dy = toward.y - from.y
  if (Math.abs(dx) >= Math.abs(dy))
    return dx >= 0 ? Position.Right : Position.Left
  return dy >= 0 ? Position.Bottom : Position.Top
}

export const roundAnchorPointOutward = (
  point: XYPosition,
  position: Position
): XYPosition => ({
  x:
    position === Position.Left
      ? Math.floor(point.x)
      : position === Position.Right
        ? Math.ceil(point.x)
        : Math.round(point.x),
  y:
    position === Position.Top
      ? Math.floor(point.y)
      : position === Position.Bottom
        ? Math.ceil(point.y)
        : Math.round(point.y),
})

export const calculateDynamicEdgeLabels = (
  x: number,
  y: number,
  direction: string
) => {
  const offset = 10
  const textOffset = 15

  switch (direction) {
    case "top": {
      const topYOffset = -5
      return {
        roleX: x - offset,
        roleY: y + topYOffset,
        roleTextAnchor: "end" as const,
        multiplicityX: x + offset,
        multiplicityY: y + topYOffset,
        multiplicityTextAnchor: "start" as const,
      }
    }
    case "bottom": {
      const bottomYOffset = textOffset
      return {
        roleX: x - offset,
        roleY: y + bottomYOffset,
        roleTextAnchor: "end" as const,
        multiplicityX: x + offset,
        multiplicityY: y + bottomYOffset,
        multiplicityTextAnchor: "start" as const,
      }
    }
    case "left": {
      const leftXOffset = -5
      return {
        roleX: x + leftXOffset,
        roleY: y - offset,
        roleTextAnchor: "end" as const,
        multiplicityX: x + leftXOffset,
        multiplicityY: y + 20,
        multiplicityTextAnchor: "end" as const,
      }
    }
    case "right": {
      return {
        roleX: x + 5,
        roleY: y - offset,
        roleTextAnchor: "start" as const,
        multiplicityX: x + 5,
        multiplicityY: y + 20,
        multiplicityTextAnchor: "start" as const,
      }
    }
    default: {
      return {
        roleX: x,
        roleY: y - offset,
        roleTextAnchor: "middle" as const,
        multiplicityX: x,
        multiplicityY: y + offset,
        multiplicityTextAnchor: "middle" as const,
      }
    }
  }
}

export interface EdgeMarkerStyles {
  markerEnd?: string
  markerStart?: string
  markerPadding?: number
  strokeDashArray?: string
  offset?: number
}

export function getEdgeMarkerStyles(edgeType: string): EdgeMarkerStyles {
  switch (edgeType) {
    case "ClassBidirectional":
      return {
        markerPadding: EDGES.MARKER_PADDING,
        strokeDashArray: "0",
        offset: 0,
      }
    case "ClassUnidirectional":
      return {
        markerPadding: EDGES.MARKER_PADDING,
        markerEnd: "url(#black-arrow)",
        strokeDashArray: "0",
        offset: 0,
      }
    case "ClassAggregation":
      return {
        markerPadding: EDGES.MARKER_PADDING,
        markerEnd: "url(#white-rhombus)",
        strokeDashArray: "0",
        offset: 0,
      }
    case "ClassComposition":
      return {
        markerPadding: EDGES.MARKER_PADDING,
        markerEnd: "url(#black-rhombus)",
        strokeDashArray: "0",
        offset: 0,
      }
    case "ClassInheritance":
      return {
        markerPadding: EDGES.MARKER_PADDING,
        markerEnd: "url(#white-triangle)",
        strokeDashArray: "0",
        offset: 0,
      }
    case "ClassRealization":
      return {
        markerPadding: EDGES.MARKER_PADDING,
        markerEnd: "url(#white-triangle)",
        strokeDashArray: "10",
        offset: 0,
      }
    case "ClassDependency":
      return {
        markerPadding: EDGES.MARKER_PADDING,
        markerEnd: "url(#black-arrow)",
        strokeDashArray: "10",
        offset: 0,
      }
    default:
      return {
        markerPadding: EDGES.MARKER_PADDING,
        strokeDashArray: "0",
        offset: 0,
      }
  }
}

function distance(p1: XYPosition, p2: XYPosition): number {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2)
}

interface FindClosestHandleParams {
  point: XYPosition
  rect: Rect
  useFourHandles?: boolean
}

type RectHandlePoint = {
  label: string
  position: XYPosition
  side: Position
}

export type FreeformEdgeAnchor = {
  side: Position
  ratio: number
}

const sideToHandleId: Record<Position, "top" | "right" | "bottom" | "left"> = {
  top: "top",
  right: "right",
  bottom: "bottom",
  left: "left",
}

const HANDLE_SNAP_STEP_PX = 5
const HANDLE_RATIO_START = 0.2
const HANDLE_RATIO_END = 0.8

export function isFreeformEdgeAnchor(
  anchor: unknown
): anchor is FreeformEdgeAnchor {
  if (!anchor || typeof anchor !== "object") return false

  const candidate = anchor as Partial<FreeformEdgeAnchor>
  return (
    (candidate.side === "top" ||
      candidate.side === "right" ||
      candidate.side === "bottom" ||
      candidate.side === "left") &&
    typeof candidate.ratio === "number" &&
    Number.isFinite(candidate.ratio)
  )
}

export function getSideHandleIdForPosition(
  position: Position
): "top" | "right" | "bottom" | "left" {
  return sideToHandleId[position]
}

export function getFreeformAnchorFromPoint(
  point: XYPosition,
  rect: Rect
): FreeformEdgeAnchor {
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height

  const pastX = point.x < rect.x ? -1 : point.x > right ? 1 : 0
  const pastY = point.y < rect.y ? -1 : point.y > bottom ? 1 : 0
  const ratioAlong = (offset: number, length: number) =>
    length > 0 ? clamp(Math.round(offset), 0, length) / length : 0.5

  if (pastX !== 0 && pastY !== 0) {
    const overshootX = pastX > 0 ? point.x - right : rect.x - point.x
    const overshootY = pastY > 0 ? point.y - bottom : rect.y - point.y
    return overshootX >= overshootY
      ? {
          side: (pastX > 0 ? "right" : "left") as Position,
          ratio: pastY > 0 ? 1 : 0,
        }
      : {
          side: (pastY > 0 ? "bottom" : "top") as Position,
          ratio: pastX > 0 ? 1 : 0,
        }
  }
  if (pastX !== 0) {
    return {
      side: (pastX > 0 ? "right" : "left") as Position,
      ratio: ratioAlong(point.y - rect.y, rect.height),
    }
  }
  if (pastY !== 0) {
    return {
      side: (pastY > 0 ? "bottom" : "top") as Position,
      ratio: ratioAlong(point.x - rect.x, rect.width),
    }
  }

  const x = clamp(point.x, rect.x, right)
  const y = clamp(point.y, rect.y, bottom)
  const candidates: Array<{
    side: Position
    point: XYPosition
    axisLength: number
    offset: number
  }> = [
    {
      side: "top" as Position,
      point: { x, y: rect.y },
      axisLength: rect.width,
      offset: x - rect.x,
    },
    {
      side: "right" as Position,
      point: { x: right, y },
      axisLength: rect.height,
      offset: y - rect.y,
    },
    {
      side: "bottom" as Position,
      point: { x, y: bottom },
      axisLength: rect.width,
      offset: x - rect.x,
    },
    {
      side: "left" as Position,
      point: { x: rect.x, y },
      axisLength: rect.height,
      offset: y - rect.y,
    },
  ]

  let closest = candidates[0]
  let minDistance = distance(point, closest.point)

  for (const candidate of candidates.slice(1)) {
    const candidateDistance = distance(point, candidate.point)
    if (candidateDistance < minDistance) {
      closest = candidate
      minDistance = candidateDistance
    }
  }

  const roundedOffset = clamp(Math.round(closest.offset), 0, closest.axisLength)

  return {
    side: closest.side,
    ratio: closest.axisLength > 0 ? roundedOffset / closest.axisLength : 0.5,
  }
}

export function getFreeformAnchorPoint(
  rect: Rect,
  anchor: FreeformEdgeAnchor
): { point: XYPosition; position: Position } {
  const ratio = clamp(anchor.ratio, 0, 1)

  switch (anchor.side) {
    case Position.Top: {
      const offset = Math.round(rect.width * ratio)
      return {
        point: { x: rect.x + offset, y: rect.y },
        position: Position.Top,
      }
    }
    case Position.Right: {
      const offset = Math.round(rect.height * ratio)
      return {
        point: { x: rect.x + rect.width, y: rect.y + offset },
        position: Position.Right,
      }
    }
    case Position.Bottom: {
      const offset = Math.round(rect.width * ratio)
      return {
        point: { x: rect.x + offset, y: rect.y + rect.height },
        position: Position.Bottom,
      }
    }
    case Position.Left: {
      const offset = Math.round(rect.height * ratio)
      return {
        point: { x: rect.x, y: rect.y + offset },
        position: Position.Left,
      }
    }
    default: {
      const unhandled: never = anchor.side
      throw new Error(`getFreeformAnchorPoint: unhandled side ${unhandled}`)
    }
  }
}

const ARC_LENGTH_PX = 28

const snapToGridStep = (value: number, axisLength: number): number => {
  const snapped = Math.round(value / HANDLE_SNAP_STEP_PX) * HANDLE_SNAP_STEP_PX
  return clamp(snapped, 0, axisLength)
}

export type AxisHandlePlan = {
  offsets: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  visibleArcCount: 1 | 3 | 5
}

const EMPTY_PLAN: AxisHandlePlan = {
  offsets: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  visibleArcCount: 1,
}

const buildOffsets = (visible: number[]): AxisHandlePlan["offsets"] => {
  if (visible.length === 5) {
    const [v0, v2, v4, v6, v8] = visible
    return [
      v0,
      snapToGridStep((v0 + v2) / 2, Number.POSITIVE_INFINITY),
      v2,
      snapToGridStep((v2 + v4) / 2, Number.POSITIVE_INFINITY),
      v4,
      snapToGridStep((v4 + v6) / 2, Number.POSITIVE_INFINITY),
      v6,
      snapToGridStep((v6 + v8) / 2, Number.POSITIVE_INFINITY),
      v8,
    ]
  }
  if (visible.length === 3) {
    const [v0, v4, v8] = visible
    const v2 = snapToGridStep((v0 + v4) / 2, Number.POSITIVE_INFINITY)
    const v6 = snapToGridStep((v4 + v8) / 2, Number.POSITIVE_INFINITY)
    return [v0, v0, v2, v4, v4, v4, v6, v8, v8]
  }
  const [v4] = visible
  return [v4, v4, v4, v4, v4, v4, v4, v4, v4]
}

const findStage1Offsets = (axisLength: number): number[] | null => {
  if (axisLength <= 0) return null

  const ideal = [0, 1, 2, 3, 4].map(
    (index) =>
      axisLength *
      (HANDLE_RATIO_START +
        ((HANDLE_RATIO_END - HANDLE_RATIO_START) * index) / 4)
  )

  const maxGridUnit = Math.floor(axisLength / HANDLE_SNAP_STEP_PX)
  if (maxGridUnit < 4) return null

  let bestOffsets: number[] | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (
    let stepUnits = 1;
    stepUnits <= Math.floor(maxGridUnit / 4);
    stepUnits++
  ) {
    const maxStartUnit = maxGridUnit - 4 * stepUnits
    for (let startUnit = 0; startUnit <= maxStartUnit; startUnit++) {
      const offsets = [0, 1, 2, 3, 4].map(
        (index) => (startUnit + index * stepUnits) * HANDLE_SNAP_STEP_PX
      )
      let score = 0
      for (let i = 0; i < offsets.length; i++) {
        const delta = offsets[i] - ideal[i]
        score += delta * delta
      }
      score -= stepUnits * 1e-3
      if (score < bestScore) {
        bestScore = score
        bestOffsets = offsets
      }
    }
  }

  if (!bestOffsets) return null
  return [bestOffsets[0], bestOffsets[2], bestOffsets[4]]
}

const findStage2Offsets = (axisLength: number): number[] | null => {
  if (axisLength <= 0) return null

  const positions = [0, 1, 2, 3, 4].map((index) => {
    const ratio =
      HANDLE_RATIO_START + ((HANDLE_RATIO_END - HANDLE_RATIO_START) * index) / 4
    return snapToGridStep(axisLength * ratio, axisLength)
  })

  for (let i = 1; i < positions.length; i++) {
    if (positions[i] <= positions[i - 1]) return null
  }
  return positions
}

const solveAxisPlan = (axisLength: number): AxisHandlePlan => {
  if (!Number.isFinite(axisLength) || axisLength <= 0) return EMPTY_PLAN

  const stage2 = findStage2Offsets(axisLength)
  if (stage2) {
    let allFit = true
    for (let i = 1; i < stage2.length; i++) {
      if (stage2[i] - stage2[i - 1] < ARC_LENGTH_PX) {
        allFit = false
        break
      }
    }
    if (allFit) {
      return {
        offsets: buildOffsets(stage2),
        visibleArcCount: 5,
      }
    }
  }

  const stage1 = findStage1Offsets(axisLength)
  if (stage1 && stage1[1] - stage1[0] >= ARC_LENGTH_PX) {
    return {
      offsets: buildOffsets(stage1),
      visibleArcCount: 3,
    }
  }

  const center = snapToGridStep(axisLength / 2, axisLength)
  return {
    offsets: buildOffsets([center]),
    visibleArcCount: 1,
  }
}

export function getAxisHandlePlan(axisLength: number): AxisHandlePlan {
  return solveAxisPlan(axisLength)
}

export function reduceVisibleArcCountForZoom(
  offsets: AxisHandlePlan["offsets"],
  baseVisibleArcCount: 1 | 3 | 5,
  zoom: number
): 1 | 3 | 5 {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  const requiredFlowSpacing = ARC_LENGTH_PX / Math.min(safeZoom, 1)

  if (baseVisibleArcCount >= 5) {
    const minAdjacent = Math.min(
      offsets[2] - offsets[0],
      offsets[4] - offsets[2],
      offsets[6] - offsets[4],
      offsets[8] - offsets[6]
    )
    if (minAdjacent >= requiredFlowSpacing) return 5
  }
  if (baseVisibleArcCount >= 3) {
    const minAdjacent = Math.min(
      offsets[4] - offsets[0],
      offsets[8] - offsets[4]
    )
    if (minAdjacent >= requiredFlowSpacing) return 3
  }
  return 1
}

export function getDistributedHandleOffsets(axisLength: number): number[] {
  return [...solveAxisPlan(axisLength).offsets]
}

export function getDistributedHandleOffsetPercents(
  axisLength: number
): [string, string, string, string, string, string, string, string, string] {
  if (!Number.isFinite(axisLength) || axisLength <= 0) {
    return ["0%", "0%", "0%", "0%", "0%", "0%", "0%", "0%", "0%"]
  }

  const offsets = solveAxisPlan(axisLength).offsets
  return offsets.map((offset) => `${(offset / axisLength) * 100}%`) as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ]
}

function getCanonicalHandlePoints(
  rect: Rect,
  useFourHandles: boolean
): RectHandlePoint[] {
  const xs = getDistributedHandleOffsets(rect.width).map(
    (offset) => rect.x + offset
  )
  const ys = getDistributedHandleOffsets(rect.height).map(
    (offset) => rect.y + offset
  )
  const [
    xStart,
    xBetween1,
    xMidStart,
    xBetween3,
    xMiddle,
    xBetween5,
    xMidEnd,
    xBetween7,
    xEnd,
  ] = xs
  const [
    yStart,
    yBetween1,
    yMidStart,
    yBetween3,
    yMiddle,
    yBetween5,
    yMidEnd,
    yBetween7,
    yEnd,
  ] = ys

  const points: RectHandlePoint[] = [
    { label: "top", position: { x: xMiddle, y: yStart }, side: Position.Top },
    {
      label: "bottom",
      position: { x: xMiddle, y: yEnd },
      side: Position.Bottom,
    },
    { label: "left", position: { x: xStart, y: yMiddle }, side: Position.Left },
    {
      label: "right",
      position: { x: xEnd, y: yMiddle },
      side: Position.Right,
    },
  ]

  if (!useFourHandles) {
    points.push(
      {
        label: "top-left",
        position: { x: xStart, y: yStart },
        side: Position.Top,
      },
      {
        label: "top-between-left-mid-left",
        position: { x: xBetween1, y: yStart },
        side: Position.Top,
      },
      {
        label: "top-mid-left",
        position: { x: xMidStart, y: yStart },
        side: Position.Top,
      },
      {
        label: "top-between-mid-left-center",
        position: { x: xBetween3, y: yStart },
        side: Position.Top,
      },
      {
        label: "top-between-center-mid-right",
        position: { x: xBetween5, y: yStart },
        side: Position.Top,
      },
      {
        label: "top-mid-right",
        position: { x: xMidEnd, y: yStart },
        side: Position.Top,
      },
      {
        label: "top-between-mid-right-right",
        position: { x: xBetween7, y: yStart },
        side: Position.Top,
      },
      {
        label: "top-right",
        position: { x: xEnd, y: yStart },
        side: Position.Top,
      },
      {
        label: "right-between-top-mid-top",
        position: { x: xEnd, y: yBetween1 },
        side: Position.Right,
      },
      {
        label: "right-mid-top",
        position: { x: xEnd, y: yMidStart },
        side: Position.Right,
      },
      {
        label: "right-between-mid-top-center",
        position: { x: xEnd, y: yBetween3 },
        side: Position.Right,
      },
      {
        label: "right-between-center-mid-bottom",
        position: { x: xEnd, y: yBetween5 },
        side: Position.Right,
      },
      {
        label: "right-mid-bottom",
        position: { x: xEnd, y: yMidEnd },
        side: Position.Right,
      },
      {
        label: "right-between-mid-bottom-bottom",
        position: { x: xEnd, y: yBetween7 },
        side: Position.Right,
      },
      {
        label: "bottom-right",
        position: { x: xEnd, y: yEnd },
        side: Position.Bottom,
      },
      {
        label: "bottom-between-right-mid-right",
        position: { x: xBetween7, y: yEnd },
        side: Position.Bottom,
      },
      {
        label: "bottom-mid-right",
        position: { x: xMidEnd, y: yEnd },
        side: Position.Bottom,
      },
      {
        label: "bottom-between-mid-right-center",
        position: { x: xBetween5, y: yEnd },
        side: Position.Bottom,
      },
      {
        label: "bottom-between-center-mid-left",
        position: { x: xBetween3, y: yEnd },
        side: Position.Bottom,
      },
      {
        label: "bottom-mid-left",
        position: { x: xMidStart, y: yEnd },
        side: Position.Bottom,
      },
      {
        label: "bottom-between-mid-left-left",
        position: { x: xBetween1, y: yEnd },
        side: Position.Bottom,
      },
      {
        label: "bottom-left",
        position: { x: xStart, y: yEnd },
        side: Position.Bottom,
      },
      {
        label: "left-between-bottom-mid-bottom",
        position: { x: xStart, y: yBetween7 },
        side: Position.Left,
      },
      {
        label: "left-mid-bottom",
        position: { x: xStart, y: yMidEnd },
        side: Position.Left,
      },
      {
        label: "left-between-mid-bottom-center",
        position: { x: xStart, y: yBetween5 },
        side: Position.Left,
      },
      {
        label: "left-between-center-mid-top",
        position: { x: xStart, y: yBetween3 },
        side: Position.Left,
      },
      {
        label: "left-mid-top",
        position: { x: xStart, y: yMidStart },
        side: Position.Left,
      },
      {
        label: "left-between-mid-top-top",
        position: { x: xStart, y: yBetween1 },
        side: Position.Left,
      }
    )
  }

  return points
}

export function findClosestHandle({
  point,
  rect,
  useFourHandles = false,
}: FindClosestHandleParams): string {
  const points = getCanonicalHandlePoints(rect, useFourHandles).filter(
    (candidate) => !candidate.label.includes("-between-")
  )

  let closest = points[0]
  let minDist = distance(point, points[0].position)

  for (const p of points) {
    const d = distance(point, p.position)
    if (d < minDist) {
      minDist = d
      closest = p
    }
  }

  return closest.label
}

export function getEllipseHandlePosition(
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  handle: string
): { x: number; y: number } {
  const angleMap: { [key: string]: number } = {
    right: 0,
    "right-mid-bottom": Math.PI / 10,
    "right-bottom": Math.PI / 5,
    "bottom-right": (3 * Math.PI) / 10,
    "bottom-mid-right": (2 * Math.PI) / 5,
    bottom: Math.PI / 2,
    "bottom-mid-left": (3 * Math.PI) / 5,
    "bottom-left": (7 * Math.PI) / 10,
    "left-bottom": (4 * Math.PI) / 5,
    "left-mid-bottom": (9 * Math.PI) / 10,
    left: Math.PI,
    "left-mid-top": (11 * Math.PI) / 10,
    "left-top": (6 * Math.PI) / 5,
    "top-left": (13 * Math.PI) / 10,
    "top-mid-left": (7 * Math.PI) / 5,
    top: (3 * Math.PI) / 2,
    "top-mid-right": (8 * Math.PI) / 5,
    "top-right": (17 * Math.PI) / 10,
    "right-top": (9 * Math.PI) / 5,
    "right-mid-top": (19 * Math.PI) / 10,
  }

  const angle = angleMap[handle] ?? 0

  return {
    x: centerX + radiusX * Math.cos(angle),
    y: centerY + radiusY * Math.sin(angle),
  }
}

export type Orientation = "horizontal" | "vertical"

export type AxisAlignedSegment = {
  index: number
  start: IPoint
  end: IPoint
  orientation: Orientation
  fixed: number
  min: number
  max: number
}

export function getAxisAlignedSegments(
  points: IPoint[],
  tolerance: number = 1
): AxisAlignedSegment[] {
  const segments: AxisAlignedSegment[] = []
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i]
    const end = points[i + 1]
    const isVertical = Math.abs(start.x - end.x) <= tolerance
    const isHorizontal = Math.abs(start.y - end.y) <= tolerance

    if (!isVertical && !isHorizontal) continue

    if (isVertical) {
      const min = Math.min(start.y, end.y)
      const max = Math.max(start.y, end.y)
      segments.push({
        index: i,
        start,
        end,
        orientation: "vertical",
        fixed: start.x,
        min,
        max,
      })
    } else {
      const min = Math.min(start.x, end.x)
      const max = Math.max(start.x, end.x)
      segments.push({
        index: i,
        start,
        end,
        orientation: "horizontal",
        fixed: start.y,
        min,
        max,
      })
    }
  }

  return segments
}

export type LineJumpHit = {
  segmentIndex: number
  point: IPoint
  orientation: Orientation
}

export function findLineJumpIntersections(
  baseSegments: AxisAlignedSegment[],
  otherSegments: AxisAlignedSegment[],
  jumpWidth: number,
  preferredOrientation: Orientation | "any" = "horizontal",
  tolerance: number = 1
): LineJumpHit[] {
  const margin = jumpWidth / 2 + 2
  const hits: LineJumpHit[] = []

  for (const base of baseSegments) {
    if (
      preferredOrientation !== "any" &&
      base.orientation !== preferredOrientation
    ) {
      continue
    }

    for (const other of otherSegments) {
      if (base.orientation === other.orientation) continue

      if (
        base.orientation === "horizontal" &&
        other.orientation === "vertical"
      ) {
        const x = other.fixed
        const y = base.fixed
        if (
          x < base.min + margin ||
          x > base.max - margin ||
          y < other.min + tolerance ||
          y > other.max - tolerance
        ) {
          continue
        }

        hits.push({
          segmentIndex: base.index,
          point: { x, y },
          orientation: base.orientation,
        })
      }

      if (
        base.orientation === "vertical" &&
        other.orientation === "horizontal"
      ) {
        const x = base.fixed
        const y = other.fixed
        if (
          y < base.min + margin ||
          y > base.max - margin ||
          x < other.min + tolerance ||
          x > other.max - tolerance
        ) {
          continue
        }

        hits.push({
          segmentIndex: base.index,
          point: { x, y },
          orientation: base.orientation,
        })
      }
    }
  }

  return hits
}

export function buildPathWithLineJumps(
  points: IPoint[],
  jumps: LineJumpHit[],
  jumpHeight: number,
  jumpWidth: number = EDGES.EDGE_LINE_JUMP_WIDTH
): string {
  if (points.length === 0) return ""
  if (jumps.length === 0) return pointsToSvgPath(points)

  const round = (num: number) => Math.round(num)
  const fmt = (point: IPoint) => `${round(point.x)} ${round(point.y)}`
  const jumpsBySegment = new Map<number, LineJumpHit[]>()

  for (const jump of jumps) {
    const list = jumpsBySegment.get(jump.segmentIndex) ?? []
    list.push(jump)
    jumpsBySegment.set(jump.segmentIndex, list)
  }

  const pathParts = [`M ${fmt(points[0])}`]

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i]
    const end = points[i + 1]
    const isHorizontal = Math.abs(start.y - end.y) < 1
    const segmentLength = isHorizontal
      ? Math.abs(end.x - start.x)
      : Math.abs(end.y - start.y)

    const segmentJumps = jumpsBySegment.get(i)
    if (!segmentJumps || segmentJumps.length === 0) {
      pathParts.push(`L ${fmt(end)}`)
      continue
    }

    if (segmentLength < jumpWidth * 1.2) {
      pathParts.push(`L ${fmt(end)}`)
      continue
    }

    const coordKey = (jump: LineJumpHit) =>
      isHorizontal ? jump.point.x : jump.point.y
    const direction = isHorizontal
      ? Math.sign(end.x - start.x) || 1
      : Math.sign(end.y - start.y) || 1
    const sortedJumps = [...segmentJumps].sort((a, b) =>
      direction >= 0 ? coordKey(a) - coordKey(b) : coordKey(b) - coordKey(a)
    )
    const margin = jumpWidth / 2 + 2
    let lastCoord = direction >= 0 ? -Infinity : Infinity

    for (const jump of sortedJumps) {
      const coord = coordKey(jump)
      const min = isHorizontal
        ? Math.min(start.x, end.x)
        : Math.min(start.y, end.y)
      const max = isHorizontal
        ? Math.max(start.x, end.x)
        : Math.max(start.y, end.y)

      if (coord < min + margin || coord > max - margin) {
        continue
      }
      if (
        (direction >= 0 && coord - lastCoord < jumpWidth) ||
        (direction < 0 && lastCoord - coord < jumpWidth)
      ) {
        continue
      }

      const halfJump = Math.min(jumpWidth / 2, segmentLength / 2 - 2)
      if (halfJump <= 1) continue

      const startCoord = direction >= 0 ? -halfJump : halfJump
      const endCoord = direction >= 0 ? halfJump : -halfJump
      const jumpStart = isHorizontal
        ? { x: coord + startCoord, y: start.y }
        : { x: start.x, y: coord + startCoord }
      const jumpEnd = isHorizontal
        ? { x: coord + endCoord, y: start.y }
        : { x: start.x, y: coord + endCoord }
      const control = isHorizontal
        ? { x: coord, y: start.y - Math.abs(jumpHeight) }
        : { x: start.x + Math.abs(jumpHeight), y: coord }

      pathParts.push(`L ${fmt(jumpStart)}`, `Q ${fmt(control)} ${fmt(jumpEnd)}`)

      lastCoord = coord
    }

    pathParts.push(`L ${fmt(end)}`)
  }

  return pathParts.join(" ")
}

export function computeLineJumpsForEdge(
  edgeId: string,
  basePoints: IPoint[],
  edges: ReadonlyArray<{ id: string }>,
  geometryMap: ReadonlyMap<string, IPoint[]>
): LineJumpHit[] {
  const baseSegments = getAxisAlignedSegments(basePoints)
  if (baseSegments.length === 0) return []

  const hits: LineJumpHit[] = []
  for (const other of edges) {
    if (other.id === edgeId) continue
    const otherPoints = geometryMap.get(other.id)
    if (!otherPoints || otherPoints.length < 2) continue
    hits.push(
      ...findLineJumpIntersections(
        baseSegments,
        getAxisAlignedSegments(otherPoints),
        EDGES.EDGE_LINE_JUMP_WIDTH,
        "horizontal"
      )
    )
  }
  return hits
}

export function calculateOverlayPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  _type?: string
): string {
  const sX = Math.round(sourceX)
  const sY = Math.round(sourceY)
  const tX = Math.round(targetX)
  const tY = Math.round(targetY)

  return `M ${sX},${sY} L ${tX},${tY}`
}

export function calculateStraightPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  _type?: string
): string {
  const sX = Math.round(sourceX)
  const sY = Math.round(sourceY)
  const tX = Math.round(targetX)
  const tY = Math.round(targetY)

  return `M ${sX},${sY} L ${tX},${tY}`
}

export function simplifySvgPath(path: string): string {
  const round = (num: number) => Math.round(num)

  const withSpaces = path.replace(/([MLQ])(?=[-0-9])/gi, "$1 ")
  const cleaned = withSpaces.replace(/,/g, " ").trim()
  const tokens = cleaned.split(/\s+/)
  const outputTokens: string[] = []
  let i = 0

  while (i < tokens.length) {
    const token = tokens[i].toUpperCase()
    if (token === "M" || token === "L") {
      const x = parseFloat(tokens[i + 1])
      const y = parseFloat(tokens[i + 2])
      if (!isNaN(x) && !isNaN(y)) {
        outputTokens.push(token, round(x).toString(), round(y).toString())
      }
      i += 3
    } else if (token === "Q") {
      const cx = parseFloat(tokens[i + 1])
      const cy = parseFloat(tokens[i + 2])
      const ex = parseFloat(tokens[i + 3])
      const ey = parseFloat(tokens[i + 4])
      if (cx === ex && cy === ey) {
        outputTokens.push("L", round(ex).toString(), round(ey).toString())
      } else {
        outputTokens.push(
          "Q",
          round(cx).toString(),
          round(cy).toString(),
          round(ex).toString(),
          round(ey).toString()
        )
      }
      i += 5
    } else {
      const x = parseFloat(tokens[i])
      const y = parseFloat(tokens[i + 1])
      if (!isNaN(x) && !isNaN(y)) {
        outputTokens.push(round(x).toString(), round(y).toString())
      }
      i += 2
    }
  }

  return outputTokens.join(" ")
}

export function simplifyPoints(points: IPoint[]): IPoint[] {
  if (points.length < 3) return points
  const result: IPoint[] = [points[0]]

  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1]
    const curr = points[i]
    const next = points[i + 1]
    if (prev.x === curr.x && curr.x === next.x) {
      continue
    }
    if (prev.y === curr.y && curr.y === next.y) {
      continue
    }
    result.push(curr)
  }
  result.push(points[points.length - 1])
  return result
}

export function parseSvgPath(path: string): IPoint[] {
  const tokens = simplifySvgPath(path).replace(/,/g, " ").trim().split(/\s+/)
  const points: IPoint[] = []
  let i = 0
  while (i < tokens.length) {
    const token = tokens[i]
    if (token === "M" || token === "L") {
      const x = parseFloat(tokens[i + 1])
      const y = parseFloat(tokens[i + 2])
      if (!isNaN(x) && !isNaN(y)) {
        points.push({ x, y })
      }
      i += 3
    } else {
      const x = parseFloat(tokens[i])
      const y = parseFloat(tokens[i + 1])
      if (!isNaN(x) && !isNaN(y)) {
        points.push({ x, y })
      }
      i += 2
    }
  }
  return simplifyPoints(points)
}

export function removeDuplicatePoints(points: IPoint[]): IPoint[] {
  if (points.length === 0) return points
  const filtered: IPoint[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const prev = filtered[filtered.length - 1]
    const current = points[i]
    if (current.x !== prev.x || current.y !== prev.y) {
      filtered.push(current)
    }
  }
  return filtered
}

type SegmentAxis = "horizontal" | "vertical"

const getSegmentAxisForPosition = (position: Position): SegmentAxis => {
  switch (position) {
    case Position.Left:
    case Position.Right:
      return "horizontal"
    case Position.Top:
    case Position.Bottom:
      return "vertical"
    default:
      return "vertical"
  }
}

const getAlternatingAxis = (
  firstAxis: SegmentAxis,
  segmentIndex: number
): SegmentAxis =>
  segmentIndex % 2 === 0
    ? firstAxis
    : firstAxis === "horizontal"
      ? "vertical"
      : "horizontal"

const canConnectWithSingleSegment = (
  sourcePoint: IPoint,
  targetPoint: IPoint,
  axis: SegmentAxis
): boolean =>
  axis === "horizontal"
    ? sourcePoint.y === targetPoint.y
    : sourcePoint.x === targetPoint.x

function getMinimumOrthogonalSegmentCount(
  sourcePoint: IPoint,
  targetPoint: IPoint,
  sourceAxis: SegmentAxis,
  targetAxis: SegmentAxis
): number {
  if (sourceAxis !== targetAxis) return 2
  return canConnectWithSingleSegment(sourcePoint, targetPoint, sourceAxis)
    ? 1
    : 3
}

const getLaneValue = (
  points: IPoint[],
  index: number,
  axis: SegmentAxis,
  fallbackPoint: IPoint
): number => {
  const point = points[Math.min(index, points.length - 1)] ?? fallbackPoint
  return axis === "horizontal" ? point.x : point.y
}

const buildOrthogonalPathFromLanes = (
  laneValues: number[],
  segmentCount: number,
  sourcePoint: IPoint,
  targetPoint: IPoint,
  sourceAxis: SegmentAxis,
  targetAxis: SegmentAxis
): IPoint[] => {
  const result: IPoint[] = [{ ...sourcePoint }]

  for (let i = 1; i < segmentCount; i++) {
    const previousPoint = result[result.length - 1]
    const axis = getAlternatingAxis(sourceAxis, i - 1)

    result.push(
      axis === "horizontal"
        ? { x: laneValues[i], y: previousPoint.y }
        : { x: previousPoint.x, y: laneValues[i] }
    )
  }

  const penultimatePoint = result[result.length - 1]
  if (penultimatePoint) {
    if (targetAxis === "horizontal") {
      penultimatePoint.y = targetPoint.y
    } else {
      penultimatePoint.x = targetPoint.x
    }
  }

  result.push({ ...targetPoint })
  return removeDuplicatePoints(result)
}

const isSourceLaneCompatible = (
  position: Position,
  sourcePoint: IPoint,
  laneValue: number
): boolean => {
  switch (position) {
    case Position.Left:
      return laneValue < sourcePoint.x
    case Position.Right:
      return laneValue > sourcePoint.x
    case Position.Top:
      return laneValue < sourcePoint.y
    case Position.Bottom:
      return laneValue > sourcePoint.y
    default:
      return false
  }
}

const isTargetApproachCompatible = (
  position: Position,
  penultimatePoint: IPoint,
  targetPoint: IPoint
): boolean => {
  switch (position) {
    case Position.Left:
      return penultimatePoint.x < targetPoint.x
    case Position.Right:
      return penultimatePoint.x > targetPoint.x
    case Position.Top:
      return penultimatePoint.y < targetPoint.y
    case Position.Bottom:
      return penultimatePoint.y > targetPoint.y
    default:
      return false
  }
}

const getStubExitCoord = (
  position: Position,
  point: IPoint,
  stubLength: number
): number => {
  switch (position) {
    case Position.Right:
      return point.x + stubLength
    case Position.Left:
      return point.x - stubLength
    case Position.Bottom:
      return point.y + stubLength
    case Position.Top:
    default:
      return point.y - stubLength
  }
}

const getStubExitPoint = (
  position: Position,
  point: IPoint,
  stubLength: number
): IPoint => {
  switch (position) {
    case Position.Right:
      return { x: point.x + stubLength, y: point.y }
    case Position.Left:
      return { x: point.x - stubLength, y: point.y }
    case Position.Bottom:
      return { x: point.x, y: point.y + stubLength }
    case Position.Top:
    default:
      return { x: point.x, y: point.y - stubLength }
  }
}

const getFacingGap = (
  sourcePoint: IPoint,
  targetPoint: IPoint,
  sourcePosition: Position,
  targetPosition: Position
): number | null => {
  if (sourcePosition === Position.Right && targetPosition === Position.Left) {
    return targetPoint.x - sourcePoint.x
  }
  if (sourcePosition === Position.Left && targetPosition === Position.Right) {
    return sourcePoint.x - targetPoint.x
  }
  if (sourcePosition === Position.Bottom && targetPosition === Position.Top) {
    return targetPoint.y - sourcePoint.y
  }
  if (sourcePosition === Position.Top && targetPosition === Position.Bottom) {
    return sourcePoint.y - targetPoint.y
  }
  return null
}

const isStraightFacingShot = (
  sourcePoint: IPoint,
  targetPoint: IPoint,
  sourcePosition: Position,
  targetPosition: Position
): boolean => {
  const gap = getFacingGap(
    sourcePoint,
    targetPoint,
    sourcePosition,
    targetPosition
  )
  if (gap === null || gap <= 0) return false

  return getSegmentAxisForPosition(sourcePosition) === "horizontal"
    ? sourcePoint.y === targetPoint.y
    : sourcePoint.x === targetPoint.x
}

export const getEffectiveStubLength = (
  sourcePoint: IPoint,
  targetPoint: IPoint,
  sourcePosition: Position,
  targetPosition: Position
): number => {
  const gap = getFacingGap(
    sourcePoint,
    targetPoint,
    sourcePosition,
    targetPosition
  )
  if (gap === null || gap <= 0) return EDGES.STUB_LENGTH

  if (
    isStraightFacingShot(
      sourcePoint,
      targetPoint,
      sourcePosition,
      targetPosition
    )
  ) {
    return Math.min(EDGES.STUB_LENGTH, gap)
  }

  const halfGapOnGrid =
    Math.floor(gap / 2 / CANVAS.SNAP_TO_GRID_PX) * CANVAS.SNAP_TO_GRID_PX

  return Math.max(
    EDGES.MIN_STUB_LENGTH,
    Math.min(EDGES.STUB_LENGTH, halfGapOnGrid)
  )
}

const toCanvasGrid = (value: number): number =>
  Math.round(value / CANVAS.SNAP_TO_GRID_PX) * CANVAS.SNAP_TO_GRID_PX

const laneClearsEndpoint = (
  lane: number,
  axis: "x" | "y",
  point: IPoint,
  position: Position,
  stubLength: number
): boolean => {
  const alongStub = (limit: number, keepAbove: boolean): boolean =>
    keepAbove ? lane >= limit : lane <= limit
  const acrossStub = (coordinate: number): boolean =>
    Math.abs(lane - coordinate) >= CANVAS.SNAP_TO_GRID_PX

  switch (position) {
    case Position.Right:
      return axis === "x"
        ? alongStub(point.x + stubLength, true)
        : acrossStub(point.y)
    case Position.Left:
      return axis === "x"
        ? alongStub(point.x - stubLength, false)
        : acrossStub(point.y)
    case Position.Bottom:
      return axis === "y"
        ? alongStub(point.y + stubLength, true)
        : acrossStub(point.x)
    case Position.Top:
    default:
      return axis === "y"
        ? alongStub(point.y - stubLength, false)
        : acrossStub(point.x)
  }
}

const snapRouteLanesToGrid = (
  points: IPoint[],
  sourcePoint: IPoint,
  targetPoint: IPoint,
  sourcePosition: Position,
  targetPosition: Position,
  stubLength: number
): IPoint[] => {
  if (points.length < 4) return points

  const snapped = points.map((point) => ({ ...point }))
  const lastLane = snapped.length - 3

  for (let i = 1; i <= lastLane; i++) {
    const start = snapped[i]
    const end = snapped[i + 1]
    const axis: "x" | "y" | null =
      start.x === end.x ? "x" : start.y === end.y ? "y" : null
    if (!axis) continue

    const lane = start[axis]
    const nearest = toCanvasGrid(lane)
    const grid = CANVAS.SNAP_TO_GRID_PX
    const candidates = [nearest, nearest - grid, nearest + grid].sort(
      (a, b) => Math.abs(a - lane) - Math.abs(b - lane)
    )
    const fits = (candidate: number): boolean =>
      (i !== 1 ||
        laneClearsEndpoint(
          candidate,
          axis,
          sourcePoint,
          sourcePosition,
          stubLength
        )) &&
      (i !== lastLane ||
        laneClearsEndpoint(
          candidate,
          axis,
          targetPoint,
          targetPosition,
          stubLength
        )) &&
      laneKeepsCorner(candidate, axis, sourcePoint, sourcePosition) &&
      laneKeepsCorner(candidate, axis, targetPoint, targetPosition)

    const chosen = candidates.find(fits) ?? lane
    start[axis] = chosen
    end[axis] = chosen
  }

  return snapped
}

const laneKeepsCorner = (
  lane: number,
  axis: "x" | "y",
  point: IPoint,
  position: Position
): boolean => {
  const stubAxis =
    getSegmentAxisForPosition(position) === "horizontal" ? "x" : "y"
  if (axis === stubAxis) return true

  return Math.abs(lane - point[axis]) >= CANVAS.SNAP_TO_GRID_PX
}

const isRoutableOrthogonalPath = (
  points: IPoint[],
  sourcePoint: IPoint,
  targetPoint: IPoint,
  sourcePosition: Position,
  targetPosition: Position
): boolean =>
  points.length >= 2 &&
  !hasDiagonalSegment(points) &&
  !hasCollapsingSegments(points) &&
  isSourceLaneCompatible(
    sourcePosition,
    sourcePoint,
    getLaneValue(
      points,
      1,
      getSegmentAxisForPosition(sourcePosition),
      targetPoint
    )
  ) &&
  isTargetApproachCompatible(
    targetPosition,
    points[points.length - 2],
    targetPoint
  )

const pushLanesClearOfStubs = (
  points: IPoint[],
  sourcePoint: IPoint,
  targetPoint: IPoint,
  sourcePosition: Position,
  targetPosition: Position,
  previousLanes?: IPoint[]
): IPoint[] => {
  if (points.length < 4) return points

  const result = points.map((point) => ({ ...point }))
  const lastLane = result.length - 3
  const minStub = getMinimumStubLength(
    sourcePoint,
    targetPoint,
    sourcePosition,
    targetPosition
  )
  const clearance = EDGES.STUB_LENGTH

  const stubs = [
    {
      point: sourcePoint,
      position: sourcePosition,
      from: result[0],
      to: result[1],
      adjacentLane: 1,
    },
    {
      point: targetPoint,
      position: targetPosition,
      from: result[result.length - 2],
      to: result[result.length - 1],
      adjacentLane: lastLane,
    },
  ]

  for (let i = 1; i <= lastLane; i++) {
    const start = result[i]
    const end = result[i + 1]
    const lane: "x" | "y" | null =
      start.x === end.x ? "x" : start.y === end.y ? "y" : null
    if (!lane) continue
    const along = lane === "x" ? "y" : "x"

    const lines = stubs
      .filter((stub) => {
        const stubLane =
          getSegmentAxisForPosition(stub.position) === "horizontal" ? "y" : "x"
        if (stubLane !== lane) return false

        if (stub.adjacentLane === i) return false

        const laneFrom = Math.min(start[along], end[along])
        const laneTo = Math.max(start[along], end[along])
        const stubFrom = Math.min(stub.from[along], stub.to[along])
        const stubTo = Math.max(stub.from[along], stub.to[along])
        return Math.max(laneFrom, stubFrom) < Math.min(laneTo, stubTo)
      })
      .map((stub) => stub.point[lane])
    if (lines.length === 0) continue

    const previous = previousLanes?.[i]?.[lane]
    const isClear = (value: number): boolean =>
      lines.every((line) => Math.abs(value - line) >= clearance)
    const flipped =
      previous !== undefined &&
      lines.some(
        (line) =>
          previous !== line &&
          Math.sign(start[lane] - line) !== Math.sign(previous - line)
      )
    if (!flipped && (isClear(start[lane]) || previous !== undefined)) continue

    const reference = previous ?? start[lane]
    const candidates = lines
      .flatMap((line) => [line - clearance, line + clearance])
      .map(toCanvasGrid)
      .filter(
        (candidate) =>
          isClear(candidate) &&
          (i !== 1 ||
            laneClearsEndpoint(
              candidate,
              lane,
              sourcePoint,
              sourcePosition,
              minStub
            )) &&
          (i !== lastLane ||
            laneClearsEndpoint(
              candidate,
              lane,
              targetPoint,
              targetPosition,
              minStub
            ))
      )
      .sort(
        (a, b) => Math.abs(a - reference) - Math.abs(b - reference) || a - b
      )

    if (candidates.length === 0) continue

    start[lane] = candidates[0]
    end[lane] = candidates[0]
  }

  return result
}

type RouteScore = [
  hardCrossings: number,
  softCrossings: number,
  bends: number,
  length: number,
  order: number,
]

const segmentHitsRect = (
  from: IPoint,
  to: IPoint,
  rect: ObstacleRect
): boolean => {
  const left = Math.min(from.x, to.x)
  const right = Math.max(from.x, to.x)
  const top = Math.min(from.y, to.y)
  const bottom = Math.max(from.y, to.y)

  return (
    left < rect.x + rect.width &&
    right > rect.x &&
    top < rect.y + rect.height &&
    bottom > rect.y
  )
}

const countCrossings = (
  points: IPoint[],
  obstacles: readonly ObstacleRect[]
): { hard: number; soft: number } => {
  let hard = 0
  let soft = 0

  for (const rect of obstacles) {
    let hit = false
    for (let i = 0; i < points.length - 1 && !hit; i++) {
      hit = segmentHitsRect(points[i], points[i + 1], rect)
    }
    if (!hit) continue
    if (rect.soft) soft += 1
    else hard += 1
  }

  return { hard, soft }
}

export const routeCrossesHardObstacle = (
  points: IPoint[],
  obstacles: readonly ObstacleRect[]
): boolean => countCrossings(points, obstacles).hard > 0

const getRouteScore = (
  points: IPoint[],
  obstacles: readonly ObstacleRect[],
  order: number
): RouteScore => {
  const { hard, soft } = countCrossings(points, obstacles)
  let length = 0
  for (let i = 0; i < points.length - 1; i++) {
    length +=
      Math.abs(points[i + 1].x - points[i].x) +
      Math.abs(points[i + 1].y - points[i].y)
  }

  return [hard, soft, Math.max(points.length - 2, 0), length, order]
}

const isBetterScore = (a: RouteScore, b: RouteScore): boolean => {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i]
  }
  return false
}

const buildBridgeRoute = (
  sourcePoint: IPoint,
  targetPoint: IPoint,
  sourcePosition: Position,
  targetPosition: Position,
  stubLength: number,
  lane: number
): IPoint[] => {
  const sourceStub = getStubExitPoint(sourcePosition, sourcePoint, stubLength)
  const targetStub = getStubExitPoint(targetPosition, targetPoint, stubLength)

  if (getSegmentAxisForPosition(sourcePosition) === "horizontal") {
    return removeDuplicatePoints([
      sourcePoint,
      sourceStub,
      { x: sourceStub.x, y: lane },
      { x: targetStub.x, y: lane },
      targetStub,
      targetPoint,
    ])
  }

  return removeDuplicatePoints([
    sourcePoint,
    sourceStub,
    { x: lane, y: sourceStub.y },
    { x: lane, y: targetStub.y },
    targetStub,
    targetPoint,
  ])
}

const getObstacleLanes = (
  obstacles: readonly ObstacleRect[],
  sourcePosition: Position
): number[] => {
  const grid = CANVAS.SNAP_TO_GRID_PX
  const acrossY = getSegmentAxisForPosition(sourcePosition) === "horizontal"
  const lanes = new Set<number>()

  for (const rect of obstacles) {
    if (acrossY) {
      lanes.add(toCanvasGrid(rect.y - grid))
      lanes.add(toCanvasGrid(rect.y + rect.height + grid))
    } else {
      lanes.add(toCanvasGrid(rect.x - grid))
      lanes.add(toCanvasGrid(rect.x + rect.width + grid))
    }
  }

  return [...lanes]
}

export const routeOrthogonalPath = (
  sourcePoint: IPoint,
  targetPoint: IPoint,
  sourcePosition: Position,
  targetPosition: Position,
  obstacles: readonly ObstacleRect[] = [],
  neighborEdges: readonly IPoint[][] = []
): IPoint[] => {
  const stubLength = getEffectiveStubLength(
    sourcePoint,
    targetPoint,
    sourcePosition,
    targetPosition
  )
  const minStub = getMinimumStubLength(
    sourcePoint,
    targetPoint,
    sourcePosition,
    targetPosition
  )

  const routeWithStub = (offset: number): IPoint[] => {
    const [path] = getSmoothStepPath({
      sourceX: sourcePoint.x,
      sourceY: sourcePoint.y,
      sourcePosition,
      targetX: targetPoint.x,
      targetY: targetPoint.y,
      targetPosition,
      borderRadius: EDGES.STEP_BORDER_RADIUS,
      offset,
    })

    return removeDuplicatePoints(
      pushLanesClearOfStubs(
        snapRouteLanesToGrid(
          removeDuplicatePoints(parseSvgPath(simplifySvgPath(path))),
          sourcePoint,
          targetPoint,
          sourcePosition,
          targetPosition,
          offset
        ),
        sourcePoint,
        targetPoint,
        sourcePosition,
        targetPosition
      )
    )
  }

  const grid = CANVAS.SNAP_TO_GRID_PX
  const offsets = [
    stubLength,
    stubLength + grid,
    stubLength - grid,
    stubLength + 2 * grid,
  ].filter((offset) => offset >= minStub)

  const candidates: IPoint[][] = offsets.map(routeWithStub)

  const cheapRoute = candidates.find((points) =>
    isRoutableOrthogonalPath(
      points,
      sourcePoint,
      targetPoint,
      sourcePosition,
      targetPosition
    )
  )

  const hardObstacles = obstacles.filter((o) => !o.soft)
  const cheapClearOfHard =
    cheapRoute !== undefined &&
    countCrossings(cheapRoute, hardObstacles).hard === 0
  const cheapKeepsClearance =
    cheapRoute !== undefined &&
    !routeRunsTooCloseToBody(
      cheapRoute,
      hardObstacles,
      EDGES.NODE_CLEARANCE_PX,
      EDGES.MIN_NODE_CLEARANCE_PX,
      CANVAS.SNAP_TO_GRID_PX,
      stubLength
    )
  const cheapClearOfEdges =
    cheapRoute !== undefined &&
    !routeConflictsWithNeighborEdges(cheapRoute, neighborEdges)
  if (
    cheapRoute &&
    cheapClearOfHard &&
    cheapKeepsClearance &&
    cheapClearOfEdges
  ) {
    return cheapRoute
  }

  if (hardObstacles.length === 0 && neighborEdges.length === 0) {
    return (
      cheapRoute ??
      getStubCollisionFallbackPoints(
        sourcePoint,
        targetPoint,
        sourcePosition,
        targetPosition
      )
    )
  }

  const searched = routeAroundObstacles(
    sourcePoint,
    targetPoint,
    sourcePosition,
    targetPosition,
    obstacles,
    stubLength,
    stubLength,
    neighborEdges
  )
  if (
    searched &&
    isRoutableOrthogonalPath(
      searched,
      sourcePoint,
      targetPoint,
      sourcePosition,
      targetPosition
    )
  ) {
    return searched
  }

  for (const lane of getObstacleLanes(obstacles, sourcePosition)) {
    candidates.push(
      buildBridgeRoute(
        sourcePoint,
        targetPoint,
        sourcePosition,
        targetPosition,
        stubLength,
        lane
      )
    )
  }

  candidates.push(
    getStubCollisionFallbackPoints(
      sourcePoint,
      targetPoint,
      sourcePosition,
      targetPosition
    )
  )

  let best: IPoint[] | null = null
  let bestScore: RouteScore | null = null
  candidates.forEach((points, order) => {
    if (
      !isRoutableOrthogonalPath(
        points,
        sourcePoint,
        targetPoint,
        sourcePosition,
        targetPosition
      )
    ) {
      return
    }
    const score = getRouteScore(points, obstacles, order)
    if (!bestScore || isBetterScore(score, bestScore)) {
      best = points
      bestScore = score
    }
  })

  return (
    best ??
    getStubCollisionFallbackPoints(
      sourcePoint,
      targetPoint,
      sourcePosition,
      targetPosition
    )
  )
}

const getDetourLane = (sourceCoord: number, targetCoord: number): number => {
  const grid = CANVAS.SNAP_TO_GRID_PX
  const low = Math.min(sourceCoord, targetCoord)
  const high = Math.max(sourceCoord, targetCoord)

  if (high - low >= 2 * grid) {
    const middle = (low + high) / 2
    const lowest = Math.ceil((low + grid) / grid) * grid
    const highest = Math.floor((high - grid) / grid) * grid
    if (lowest <= highest) {
      const snapped = toCanvasGrid(middle)
      if (snapped >= lowest && snapped <= highest) return snapped
      return Math.abs(lowest - middle) <= Math.abs(highest - middle)
        ? lowest
        : highest
    }
  }

  return toCanvasGrid(low - EDGES.STUB_LENGTH)
}

const getStubCollisionFallbackPoints = (
  sourcePoint: IPoint,
  targetPoint: IPoint,
  sourcePosition: Position,
  targetPosition: Position
): IPoint[] => {
  const sharedLaneSnapTolerance = Math.abs(
    EDGES.SOURCE_CONNECTION_POINT_PADDING - EDGES.MARKER_PADDING
  )
  const sourceStub = getStubExitPoint(
    sourcePosition,
    sourcePoint,
    EDGES.STUB_LENGTH
  )
  const targetStub = getStubExitPoint(
    targetPosition,
    targetPoint,
    EDGES.STUB_LENGTH
  )
  const sourceAxis = getSegmentAxisForPosition(sourcePosition)

  if (sourceAxis === "horizontal") {
    const stubLaneDelta = Math.abs(sourceStub.x - targetStub.x)
    if (
      sourcePoint.y !== targetPoint.y &&
      stubLaneDelta > 0 &&
      stubLaneDelta <= sharedLaneSnapTolerance
    ) {
      const sharedX = Math.round((sourceStub.x + targetStub.x) / 2)
      return removeDuplicatePoints([
        sourcePoint,
        { x: sharedX, y: sourcePoint.y },
        { x: sharedX, y: targetPoint.y },
        targetPoint,
      ])
    }

    const bridgeY = getDetourLane(sourcePoint.y, targetPoint.y)
    return removeDuplicatePoints([
      sourcePoint,
      sourceStub,
      { x: sourceStub.x, y: bridgeY },
      { x: targetStub.x, y: bridgeY },
      targetStub,
      targetPoint,
    ])
  }

  const stubLaneDelta = Math.abs(sourceStub.y - targetStub.y)
  if (
    sourcePoint.x !== targetPoint.x &&
    stubLaneDelta > 0 &&
    stubLaneDelta <= sharedLaneSnapTolerance
  ) {
    const sharedY = Math.round((sourceStub.y + targetStub.y) / 2)
    return removeDuplicatePoints([
      sourcePoint,
      { x: sourcePoint.x, y: sharedY },
      { x: targetPoint.x, y: sharedY },
      targetPoint,
    ])
  }

  const bridgeX = getDetourLane(sourcePoint.x, targetPoint.x)
  return removeDuplicatePoints([
    sourcePoint,
    sourceStub,
    { x: bridgeX, y: sourceStub.y },
    { x: bridgeX, y: targetStub.y },
    targetStub,
    targetPoint,
  ])
}

const removeRedundantLanes = (
  points: IPoint[],
  sourceStubExit: IPoint,
  targetStubExit: IPoint
): IPoint[] => {
  if (points.length < 3) return points

  const isStubExit = (point: IPoint): boolean =>
    (point.x === sourceStubExit.x && point.y === sourceStubExit.y) ||
    (point.x === targetStubExit.x && point.y === targetStubExit.y)

  const kept: IPoint[] = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const previous = kept[kept.length - 1]
    const current = points[i]
    const next = points[i + 1]
    const collinear =
      (previous.x === current.x && current.x === next.x) ||
      (previous.y === current.y && current.y === next.y)
    if (collinear && !isStubExit(current)) continue
    kept.push(current)
  }
  kept.push(points[points.length - 1])

  return kept
}

const hasCollapsingSegments = (result: IPoint[]): boolean => {
  for (let i = 1; i < result.length - 2; i++) {
    const prev = result[i - 1]
    const curr = result[i]
    const next = result[i + 1]
    const horizBack =
      prev.y === curr.y &&
      curr.y === next.y &&
      (curr.x - prev.x) * (next.x - curr.x) < 0
    const vertBack =
      prev.x === curr.x &&
      curr.x === next.x &&
      (curr.y - prev.y) * (next.y - curr.y) < 0
    if (horizBack || vertBack) return true
  }
  return false
}

export const stubsWouldOverlap = (
  sourcePoint: IPoint,
  targetPoint: IPoint,
  sourcePosition: Position,
  targetPosition: Position,
  stubLength: number
): boolean => {
  if (
    isStraightFacingShot(
      sourcePoint,
      targetPoint,
      sourcePosition,
      targetPosition
    )
  ) {
    return false
  }

  if (sourcePosition === Position.Right && targetPosition === Position.Left) {
    return (
      sourcePoint.x < targetPoint.x &&
      sourcePoint.x + stubLength > targetPoint.x - stubLength
    )
  }
  if (sourcePosition === Position.Left && targetPosition === Position.Right) {
    return (
      sourcePoint.x > targetPoint.x &&
      sourcePoint.x - stubLength < targetPoint.x + stubLength
    )
  }
  if (sourcePosition === Position.Bottom && targetPosition === Position.Top) {
    return (
      sourcePoint.y < targetPoint.y &&
      sourcePoint.y + stubLength > targetPoint.y - stubLength
    )
  }
  if (sourcePosition === Position.Top && targetPosition === Position.Bottom) {
    return (
      sourcePoint.y > targetPoint.y &&
      sourcePoint.y - stubLength < targetPoint.y + stubLength
    )
  }
  return false
}

const hasDiagonalSegment = (points: IPoint[]): boolean =>
  points.some((point, index) => {
    if (index === 0) return false
    const previous = points[index - 1]
    return previous.x !== point.x && previous.y !== point.y
  })

const getSourceStubLength = (
  points: IPoint[],
  sourcePoint: IPoint,
  sourcePosition: Position
): number => {
  const first = points[1]
  if (!first) return 0

  switch (sourcePosition) {
    case Position.Right:
      return first.y === sourcePoint.y ? first.x - sourcePoint.x : -Infinity
    case Position.Left:
      return first.y === sourcePoint.y ? sourcePoint.x - first.x : -Infinity
    case Position.Bottom:
      return first.x === sourcePoint.x ? first.y - sourcePoint.y : -Infinity
    case Position.Top:
    default:
      return first.x === sourcePoint.x ? sourcePoint.y - first.y : -Infinity
  }
}

const getTargetStubLength = (
  points: IPoint[],
  targetPoint: IPoint,
  targetPosition: Position
): number => {
  const penultimate = points[points.length - 2]
  if (!penultimate) return 0

  switch (targetPosition) {
    case Position.Left:
      return penultimate.y === targetPoint.y
        ? targetPoint.x - penultimate.x
        : -Infinity
    case Position.Right:
      return penultimate.y === targetPoint.y
        ? penultimate.x - targetPoint.x
        : -Infinity
    case Position.Top:
      return penultimate.x === targetPoint.x
        ? targetPoint.y - penultimate.y
        : -Infinity
    case Position.Bottom:
    default:
      return penultimate.x === targetPoint.x
        ? penultimate.y - targetPoint.y
        : -Infinity
  }
}

const getMinimumStubLength = (
  sourcePoint: IPoint,
  targetPoint: IPoint,
  sourcePosition: Position,
  targetPosition: Position
): number =>
  Math.min(
    EDGES.MIN_STUB_LENGTH,
    getEffectiveStubLength(
      sourcePoint,
      targetPoint,
      sourcePosition,
      targetPosition
    )
  )

const hasReducedTerminalStub = (
  points: IPoint[],
  sourcePoint: IPoint,
  targetPoint: IPoint,
  sourcePosition: Position,
  targetPosition: Position
): boolean => {
  const minStub = getMinimumStubLength(
    sourcePoint,
    targetPoint,
    sourcePosition,
    targetPosition
  )

  return (
    getSourceStubLength(points, sourcePoint, sourcePosition) < minStub ||
    getTargetStubLength(points, targetPoint, targetPosition) < minStub
  )
}

const collapseTinyOrthogonalDoglegs = (
  points: IPoint[],
  proximityPx: number
): IPoint[] => {
  if (points.length < 5) return points

  let collapsed = points.map((point) => ({ ...point }))
  let changed = true

  while (changed) {
    changed = false

    for (let i = 1; i <= collapsed.length - 4; i++) {
      const a = collapsed[i]
      const b = collapsed[i + 1]
      const c = collapsed[i + 2]
      const d = collapsed[i + 3]

      const firstVertical = a.x === b.x
      const firstHorizontal = a.y === b.y
      const secondVertical = c.x === d.x
      const secondHorizontal = c.y === d.y

      if (firstVertical && secondVertical && b.y === c.y) {
        const connectorLength = Math.abs(c.x - b.x)
        const sameDirection = (b.y - a.y) * (d.y - c.y) > 0
        if (
          connectorLength > 0 &&
          connectorLength <= proximityPx &&
          sameDirection
        ) {
          const lane = i + 3 === collapsed.length - 2 ? c.x : a.x
          collapsed[i] = { ...a, x: lane }
          collapsed[i + 1] = { ...b, x: lane }
          collapsed[i + 2] = { ...c, x: lane }
          collapsed[i + 3] = { ...d, x: lane }
          collapsed = removeDuplicatePoints(simplifyPoints(collapsed))
          changed = true
          break
        }
      }

      if (firstHorizontal && secondHorizontal && b.x === c.x) {
        const connectorLength = Math.abs(c.y - b.y)
        const sameDirection = (b.x - a.x) * (d.x - c.x) > 0
        if (
          connectorLength > 0 &&
          connectorLength <= proximityPx &&
          sameDirection
        ) {
          const lane = i + 3 === collapsed.length - 2 ? c.y : a.y
          collapsed[i] = { ...a, y: lane }
          collapsed[i + 1] = { ...b, y: lane }
          collapsed[i + 2] = { ...c, y: lane }
          collapsed[i + 3] = { ...d, y: lane }
          collapsed = removeDuplicatePoints(simplifyPoints(collapsed))
          changed = true
          break
        }
      }
    }
  }

  return collapsed
}

const sanitizeReleasedPoints = (
  points: IPoint[],
  sourcePoint: IPoint,
  targetPoint: IPoint
): IPoint[] => {
  if (points.length < 2) return []

  const rounded = points.map((point) => ({
    x: Math.round(point.x),
    y: Math.round(point.y),
  }))
  rounded[0] = { ...sourcePoint }
  rounded[rounded.length - 1] = { ...targetPoint }

  return removeDuplicatePoints(simplifyPoints(removeDuplicatePoints(rounded)))
}

export function isInvalidOrthogonalEdgeRelease(
  points: IPoint[],
  sourcePoint: IPoint,
  targetPoint: IPoint,
  sourcePosition: Position,
  targetPosition: Position
): boolean {
  const sanitized = sanitizeReleasedPoints(points, sourcePoint, targetPoint)

  return (
    sanitized.length < 2 ||
    hasDiagonalSegment(sanitized) ||
    hasReducedTerminalStub(
      sanitized,
      sourcePoint,
      targetPoint,
      sourcePosition,
      targetPosition
    )
  )
}

export type BendLaneBounds = { min: number; max: number }

export function getBendLaneBounds(
  points: IPoint[],
  segmentIndex: number,
  orientation: "H" | "V",
  sourcePoint: IPoint,
  targetPoint: IPoint,
  sourcePosition: Position,
  targetPosition: Position
): BendLaneBounds {
  const bounds: BendLaneBounds = {
    min: Number.NEGATIVE_INFINITY,
    max: Number.POSITIVE_INFINITY,
  }
  const lastSegmentIndex = points.length - 2
  if (lastSegmentIndex < 0) return bounds

  const minStub = getMinimumStubLength(
    sourcePoint,
    targetPoint,
    sourcePosition,
    targetPosition
  )
  const laneAxis = orientation === "V" ? "x" : "y"

  const constrainBy = (point: IPoint, position: Position): void => {
    switch (position) {
      case Position.Right:
        if (laneAxis === "x")
          bounds.min = Math.max(bounds.min, point.x + minStub)
        break
      case Position.Left:
        if (laneAxis === "x")
          bounds.max = Math.min(bounds.max, point.x - minStub)
        break
      case Position.Bottom:
        if (laneAxis === "y")
          bounds.min = Math.max(bounds.min, point.y + minStub)
        break
      case Position.Top:
        if (laneAxis === "y")
          bounds.max = Math.min(bounds.max, point.y - minStub)
        break
    }
  }

  if (segmentIndex === 1) constrainBy(sourcePoint, sourcePosition)
  if (segmentIndex === lastSegmentIndex - 1) {
    constrainBy(targetPoint, targetPosition)
  }

  const laneCoord = points[segmentIndex][laneAxis]
  const clampAgainstArm = (armIndex: number): void => {
    if (armIndex < 0 || armIndex > lastSegmentIndex) return
    const armCoord = points[armIndex][laneAxis]
    if (armCoord > laneCoord) bounds.max = Math.min(bounds.max, armCoord)
    else if (armCoord < laneCoord) bounds.min = Math.max(bounds.min, armCoord)
  }
  clampAgainstArm(segmentIndex - 2)
  clampAgainstArm(segmentIndex + 2)

  return bounds
}

const isDegenerateRoute = (sourcePoint: IPoint, targetPoint: IPoint): boolean =>
  sourcePoint.x === targetPoint.x && sourcePoint.y === targetPoint.y

const getDegenerateRoute = (
  sourcePoint: IPoint,
  targetPoint: IPoint
): IPoint[] => [{ ...sourcePoint }, { ...targetPoint }]

const hasAxisFold = (points: IPoint[]): boolean => {
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]
    const b = points[i]
    const c = points[i + 1]
    const collinear =
      (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)
    const reverses = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0
    if (collinear && reverses) return true
  }
  return false
}

export function normalizeOrthogonalEdgePoints(
  points: IPoint[],
  sourcePoint: IPoint,
  targetPoint: IPoint,
  sourcePosition: Position,
  targetPosition: Position,
  obstacles: readonly ObstacleRect[] = []
): IPoint[] {
  if (isDegenerateRoute(sourcePoint, targetPoint)) {
    return getDegenerateRoute(sourcePoint, targetPoint)
  }

  if (hasAxisFold(points)) {
    return sanitizeReleasedPoints(points, sourcePoint, targetPoint)
  }

  const hasStubCollision = stubsWouldOverlap(
    sourcePoint,
    targetPoint,
    sourcePosition,
    targetPosition,
    EDGES.MIN_STUB_LENGTH
  )
  const fallback = hasStubCollision
    ? getStubCollisionFallbackPoints(
        sourcePoint,
        targetPoint,
        sourcePosition,
        targetPosition
      )
    : routeOrthogonalPath(
        sourcePoint,
        targetPoint,
        sourcePosition,
        targetPosition,
        obstacles
      )

  const sanitized = sanitizeReleasedPoints(points, sourcePoint, targetPoint)
  if (
    sanitized.length < 2 ||
    hasDiagonalSegment(sanitized) ||
    hasReducedTerminalStub(
      sanitized,
      sourcePoint,
      targetPoint,
      sourcePosition,
      targetPosition
    ) ||
    hasStubCollision
  ) {
    return fallback
  }

  const normalized = preserveOrthogonalEdgePoints(
    sanitized,
    sourcePoint,
    targetPoint,
    sourcePosition,
    targetPosition,
    obstacles
  )

  const canonical = sanitizeReleasedPoints(normalized, sourcePoint, targetPoint)

  return canonical.length >= 2 && !hasDiagonalSegment(canonical)
    ? canonical
    : fallback
}

export function resolveOrthogonalEdgeReleasePoints(
  releasedPoints: IPoint[],
  lastValidPoints: IPoint[],
  sourcePoint: IPoint,
  targetPoint: IPoint,
  sourcePosition: Position,
  targetPosition: Position
): IPoint[] {
  const invalid = isInvalidOrthogonalEdgeRelease(
    releasedPoints,
    sourcePoint,
    targetPoint,
    sourcePosition,
    targetPosition
  )

  const sanitized = sanitizeReleasedPoints(
    releasedPoints,
    sourcePoint,
    targetPoint
  )
  const folded = hasAxisFold(sanitized)
  const pointsToNormalize =
    invalid && !folded ? lastValidPoints : releasedPoints

  return normalizeOrthogonalEdgePoints(
    pointsToNormalize,
    sourcePoint,
    targetPoint,
    sourcePosition,
    targetPosition
  )
}
export function preserveOrthogonalEdgePoints(
  points: IPoint[],
  sourcePoint: IPoint,
  targetPoint: IPoint,
  sourcePosition: Position,
  targetPosition: Position,
  obstacles: readonly ObstacleRect[] = []
): IPoint[] {
  if (isDegenerateRoute(sourcePoint, targetPoint)) {
    return getDegenerateRoute(sourcePoint, targetPoint)
  }

  const sourceAxis = getSegmentAxisForPosition(sourcePosition)
  const targetAxis = getSegmentAxisForPosition(targetPosition)
  const safePoints = routeOrthogonalPath(
    sourcePoint,
    targetPoint,
    sourcePosition,
    targetPosition,
    obstacles
  )
  const stubLength = getEffectiveStubLength(
    sourcePoint,
    targetPoint,
    sourcePosition,
    targetPosition
  )
  const minStubLength = getMinimumStubLength(
    sourcePoint,
    targetPoint,
    sourcePosition,
    targetPosition
  )
  const previousSafePoints =
    points.length >= 2
      ? routeOrthogonalPath(
          points[0],
          points[points.length - 1],
          sourcePosition,
          targetPosition,
          obstacles
        )
      : safePoints
  const previousSourceStub = getSourceStubLength(
    previousSafePoints,
    points[0] ?? sourcePoint,
    sourcePosition
  )
  const previousTargetStub = getTargetStubLength(
    previousSafePoints,
    points[points.length - 1] ?? targetPoint,
    targetPosition
  )
  const safeSourceStub = getSourceStubLength(
    safePoints,
    sourcePoint,
    sourcePosition
  )
  const safeTargetStub = getTargetStubLength(
    safePoints,
    targetPoint,
    targetPosition
  )

  const facingGap = getFacingGap(
    sourcePoint,
    targetPoint,
    sourcePosition,
    targetPosition
  )
  const maxStubLength =
    facingGap !== null && facingGap > 0
      ? Math.max(minStubLength, facingGap - minStubLength)
      : Number.POSITIVE_INFINITY

  const isRouterStub = (offset: number, previous: number): boolean =>
    Number.isFinite(previous) && Math.abs(offset - previous) <= 1

  const isNodeLockedStub = (offset: number): boolean =>
    offset >= minStubLength - 1 && offset <= EDGES.STUB_LENGTH + 1

  const userStubLength = (offset: number): number =>
    Math.max(Math.min(offset, maxStubLength), minStubLength)

  if (
    stubsWouldOverlap(
      sourcePoint,
      targetPoint,
      sourcePosition,
      targetPosition,
      EDGES.MIN_STUB_LENGTH
    )
  ) {
    return getStubCollisionFallbackPoints(
      sourcePoint,
      targetPoint,
      sourcePosition,
      targetPosition
    )
  }

  const originalSegmentCount = Math.max(points.length - 1, 1)
  const safeSegmentCount = Math.max(safePoints.length - 1, 1)
  const minimumSegmentCount = getMinimumOrthogonalSegmentCount(
    sourcePoint,
    targetPoint,
    sourceAxis,
    targetAxis
  )

  if (originalSegmentCount < minimumSegmentCount) {
    return safePoints
  }

  let segmentCount = Math.max(
    originalSegmentCount,
    safeSegmentCount,
    minimumSegmentCount
  )
  while (getAlternatingAxis(sourceAxis, segmentCount - 1) !== targetAxis) {
    segmentCount += 1
  }

  const laneValues: number[] = [Number.NaN]
  for (let i = 1; i < segmentCount; i++) {
    const axis = getAlternatingAxis(sourceAxis, i - 1)
    laneValues[i] = getLaneValue(points, i, axis, targetPoint)
  }

  const safeLaneValues: number[] = [Number.NaN]
  for (let i = 1; i < segmentCount; i++) {
    const axis = getAlternatingAxis(sourceAxis, i - 1)
    safeLaneValues[i] = getLaneValue(safePoints, i, axis, targetPoint)
  }

  const srcAxisCoord0 = sourceAxis === "horizontal" ? points[0].x : points[0].y
  const srcAxisCoord1 =
    points.length > 1
      ? sourceAxis === "horizontal"
        ? points[1].x
        : points[1].y
      : srcAxisCoord0
  const srcStubOffset = Math.abs(srcAxisCoord1 - srcAxisCoord0)

  const targetLaneIndex = (() => {
    for (let i = segmentCount - 1; i >= 1; i--) {
      if (getAlternatingAxis(sourceAxis, i - 1) === targetAxis) return i
    }
    return 1
  })()

  const lastIdx = points.length - 1
  const tgtAxisCoordLast =
    targetAxis === "horizontal" ? points[lastIdx].x : points[lastIdx].y
  const tgtAxisCoordAtLane =
    targetLaneIndex < points.length
      ? targetAxis === "horizontal"
        ? points[targetLaneIndex].x
        : points[targetLaneIndex].y
      : tgtAxisCoordLast
  const tgtStubOffset = Math.abs(tgtAxisCoordLast - tgtAxisCoordAtLane)

  const sourceStubIsLocked =
    isRouterStub(srcStubOffset, previousSourceStub) ||
    isNodeLockedStub(srcStubOffset)
  const targetStubIsLocked =
    isRouterStub(tgtStubOffset, previousTargetStub) ||
    isNodeLockedStub(tgtStubOffset)

  let sourceStub = isRouterStub(srcStubOffset, previousSourceStub)
    ? safeSourceStub
    : userStubLength(srcStubOffset)
  let targetStub = isRouterStub(tgtStubOffset, previousTargetStub)
    ? safeTargetStub
    : userStubLength(tgtStubOffset)

  if (
    facingGap !== null &&
    facingGap > 0 &&
    sourceStubIsLocked &&
    targetStubIsLocked &&
    sourceStub + targetStub > facingGap
  ) {
    sourceStub = stubLength
    targetStub = stubLength
  }

  if (sourceStubIsLocked) {
    laneValues[1] = getStubExitCoord(sourcePosition, sourcePoint, sourceStub)
  }

  if (!isSourceLaneCompatible(sourcePosition, sourcePoint, laneValues[1])) {
    laneValues[1] = safeLaneValues[1]
  }

  const targetOwnsItsOwnLane = targetLaneIndex !== 1 || !sourceStubIsLocked
  if (targetOwnsItsOwnLane && targetStubIsLocked) {
    laneValues[targetLaneIndex] = getStubExitCoord(
      targetPosition,
      targetPoint,
      targetStub
    )
  }

  if (sourceAxis === targetAxis && targetLaneIndex > 1) {
    const laneAxis = sourceAxis === "horizontal" ? "x" : "y"
    const sourceLane = laneValues[1]
    const targetLane = laneValues[targetLaneIndex]
    const spine = toCanvasGrid((sourceLane + targetLane) / 2)
    if (
      Math.abs(sourceLane - targetLane) <= CANVAS.SNAP_TO_GRID_PX &&
      laneClearsEndpoint(
        spine,
        laneAxis,
        sourcePoint,
        sourcePosition,
        minStubLength
      ) &&
      laneClearsEndpoint(
        spine,
        laneAxis,
        targetPoint,
        targetPosition,
        minStubLength
      )
    ) {
      laneValues[1] = spine
      laneValues[targetLaneIndex] = spine
    }
  }

  if (segmentCount >= 3 && points.length >= 3) {
    const perpCoord1 = sourceAxis === "horizontal" ? points[1].y : points[1].x
    const perpCoord2 = sourceAxis === "horizontal" ? points[2].y : points[2].x
    if (Math.abs(perpCoord1 - perpCoord2) <= 1) {
      laneValues[2] =
        sourceAxis === "horizontal" ? sourcePoint.y : sourcePoint.x
    }
  }

  let result = buildOrthogonalPathFromLanes(
    laneValues,
    segmentCount,
    sourcePoint,
    targetPoint,
    sourceAxis,
    targetAxis
  )

  if (result.length < 2) return safePoints

  if (
    !isTargetApproachCompatible(
      targetPosition,
      result[result.length - 2],
      targetPoint
    )
  ) {
    if (sourceAxis === targetAxis && points.length >= 6) {
      const stubExitCoord = getStubExitCoord(
        targetPosition,
        targetPoint,
        stubLength
      )
      const stubExitPoint =
        targetAxis === "horizontal"
          ? { x: stubExitCoord, y: targetPoint.y }
          : { x: targetPoint.x, y: stubExitCoord }
      const withStub = removeDuplicatePoints([
        ...result.slice(0, -1),
        stubExitPoint,
        targetPoint,
      ])
      if (
        isTargetApproachCompatible(
          targetPosition,
          withStub[withStub.length - 2],
          targetPoint
        )
      ) {
        result = withStub
      } else {
        laneValues[targetLaneIndex] = safeLaneValues[targetLaneIndex]
        result = buildOrthogonalPathFromLanes(
          laneValues,
          segmentCount,
          sourcePoint,
          targetPoint,
          sourceAxis,
          targetAxis
        )
      }
    } else {
      laneValues[targetLaneIndex] = safeLaneValues[targetLaneIndex]
      result = buildOrthogonalPathFromLanes(
        laneValues,
        segmentCount,
        sourcePoint,
        targetPoint,
        sourceAxis,
        targetAxis
      )
    }
  }

  result = collapseTinyOrthogonalDoglegs(
    result,
    EDGES.ORTHOGONAL_DOGLEG_TOLERANCE_PX
  )

  if (
    !isSourceLaneCompatible(
      sourcePosition,
      sourcePoint,
      getLaneValue(result, 1, getAlternatingAxis(sourceAxis, 0), targetPoint)
    ) ||
    !isTargetApproachCompatible(
      targetPosition,
      result[result.length - 2],
      targetPoint
    ) ||
    hasCollapsingSegments(result) ||
    hasReducedTerminalStub(
      result,
      sourcePoint,
      targetPoint,
      sourcePosition,
      targetPosition
    )
  ) {
    return safePoints
  }

  return removeRedundantLanes(
    pushLanesClearOfStubs(
      result,
      sourcePoint,
      targetPoint,
      sourcePosition,
      targetPosition,
      points
    ),
    getStubExitPoint(sourcePosition, sourcePoint, stubLength),
    getStubExitPoint(targetPosition, targetPoint, stubLength)
  )
}

export function getMarkerSegmentPath(
  points: IPoint[],
  offset: number,
  targetPosition: "top" | "bottom" | "left" | "right"
): string {
  if (points.length === 0) return ""

  const lastPoint = points[points.length - 1]
  const lastX = Math.round(lastPoint.x)
  const lastY = Math.round(lastPoint.y)
  let extendedX = lastX
  let extendedY = lastY
  switch (targetPosition) {
    case "top":
      extendedY = lastY + offset
      break
    case "bottom":
      extendedY = lastY - offset
      break
    case "left":
      extendedX = lastX + offset
      break
    case "right":
      extendedX = lastX - offset
      break
    default:
      break
  }

  return `M ${lastX} ${lastY} L ${extendedX} ${extendedY}`
}

export const getDefaultEdgeType = (
  _diagramType?: UMLDiagramType
): DiagramEdgeType => {
  return "ClassBidirectional"
}

export function getConnectionLineType(
  _diagramType?: UMLDiagramType
): ConnectionLineType {
  return ConnectionLineType.Step
}
