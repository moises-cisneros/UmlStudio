import type { CollaborationViewport } from "@/typings"

type Point = { x: number; y: number }

export const flowToCanvasPosition = (
  point: Point,
  viewport: CollaborationViewport
): Point => ({
  x: point.x * viewport.zoom + viewport.x,
  y: point.y * viewport.zoom + viewport.y,
})
