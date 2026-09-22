import { Position, type Rect } from "@xyflow/system"
import { CANVAS } from "@/utils/geometry/routingConstants"
import type { IPoint } from "@/edges/Connection"

export const OUTWARD_NORMAL: Record<Position, IPoint> = {
  [Position.Top]: { x: 0, y: -1 },
  [Position.Bottom]: { x: 0, y: 1 },
  [Position.Left]: { x: -1, y: 0 },
  [Position.Right]: { x: 1, y: 0 },
}

export const OPPOSITE_SIDE: Record<Position, Position> = {
  [Position.Top]: Position.Bottom,
  [Position.Bottom]: Position.Top,
  [Position.Left]: Position.Right,
  [Position.Right]: Position.Left,
}

export const SIDE_ORDER: Record<Position, number> = {
  [Position.Top]: 0,
  [Position.Right]: 1,
  [Position.Bottom]: 2,
  [Position.Left]: 3,
}

export const ALL_SIDES: readonly Position[] = [
  Position.Top,
  Position.Right,
  Position.Bottom,
  Position.Left,
]

export const isVerticalSide = (side: Position): boolean =>
  side === Position.Left || side === Position.Right

export const centerOf = (r: Rect): IPoint => ({
  x: r.x + r.width / 2,
  y: r.y + r.height / 2,
})

export const sideAxisLength = (side: Position, rect: Rect): number =>
  isVerticalSide(side) ? rect.height : rect.width

export const facingSide = (rect: Rect, toward: IPoint): Position => {
  const c = centerOf(rect)
  const dx = toward.x - c.x
  const dy = toward.y - c.y
  const halfW = rect.width / 2 || 1
  const halfH = rect.height / 2 || 1
  return Math.abs(dx) * halfH >= Math.abs(dy) * halfW
    ? dx >= 0
      ? Position.Right
      : Position.Left
    : dy >= 0
      ? Position.Bottom
      : Position.Top
}

export const rangeOverlapLen = (aLo: number, aHi: number, bLo: number, bHi: number): number =>
  Math.max(0, Math.min(aHi, bHi) - Math.max(aLo, bLo))

export const cornerMargin = (axisA: number, axisB: number): number =>
  Math.min(2 * CANVAS.SNAP_TO_GRID_PX, Math.min(axisA, axisB) * 0.3)

export const canRunStraight = (alongVerticalSides: boolean, a: Rect, b: Rect): boolean => {
  const overlap = alongVerticalSides
    ? rangeOverlapLen(a.y, a.y + a.height, b.y, b.y + b.height)
    : rangeOverlapLen(a.x, a.x + a.width, b.x, b.x + b.width)
  const axisA = alongVerticalSides ? a.height : a.width
  const axisB = alongVerticalSides ? b.height : b.width
  return overlap >= 2 * cornerMargin(axisA, axisB)
}
