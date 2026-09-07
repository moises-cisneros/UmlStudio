import { CANVAS } from "./routingConstants"

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v))

export const lexLess = (
  a: readonly number[],
  b: readonly number[]
): boolean => {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i]
  }
  return false
}

export const getHandleScreenScale = (zoom: number): number => {
  const safeZoom = Math.max(
    Number.isFinite(zoom) && zoom > 0 ? zoom : 1,
    CANVAS.MIN_SCALE_TO_ZOOM_OUT
  )
  return 1 / Math.min(safeZoom, 1)
}
