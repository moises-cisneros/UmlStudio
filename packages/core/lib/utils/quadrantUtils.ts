import { Quadrant } from "@/enums"
import { XYPosition } from "@xyflow/react"

export const getQuadrant = (
  target: XYPosition,
  reference: XYPosition
): Quadrant => {
  const right = target.x >= reference.x
  const bottom = target.y >= reference.y
  if (right && bottom) return Quadrant.BottomRight
  if (!right && bottom) return Quadrant.BottomLeft
  if (right && !bottom) return Quadrant.TopRight
  return Quadrant.TopLeft
}
