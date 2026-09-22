import type { ReactFlowInstance } from "@xyflow/react"
import { ZERO_INSETS, type Insets, type OverlaySide } from "./types"

const GUTTER = 16

const anySide = (i: Insets): boolean => !!(i.top || i.right || i.bottom || i.left)

export function insetAwareFitView(
  rf: Pick<ReactFlowInstance, "fitView">,
  insets: Insets = ZERO_INSETS,
  safeArea: Insets = ZERO_INSETS,
  options?: {
    padding?: number | Partial<Record<OverlaySide, number>>
    duration?: number
    maxZoom?: number
    nodes?: Array<{ id: string }>
  }
): void {
  const maxZoom = options?.maxZoom ?? 1.0
  const duration = options?.duration
  const nodes = options?.nodes
  const padding = options?.padding
  const override = typeof padding === "object" ? padding : undefined
  const fraction = typeof padding === "number" ? padding : 0.15

  if (!anySide(insets) && !anySide(safeArea) && !override) {
    rf.fitView({ padding: fraction, duration, maxZoom, nodes })
    return
  }

  const pad = (side: OverlaySide): `${number}px` =>
    `${safeArea[side] + insets[side] + (override?.[side] ?? GUTTER)}px`

  rf.fitView({
    padding: {
      top: pad("top"),
      right: pad("right"),
      bottom: pad("bottom"),
      left: pad("left"),
    },
    duration,
    maxZoom,
    nodes,
  })
}

export function readSafeArea(grid: HTMLElement | null): Insets {
  if (!grid) return ZERO_INSETS
  const s = getComputedStyle(grid)
  return {
    top: parseFloat(s.paddingTop) || 0,
    right: parseFloat(s.paddingRight) || 0,
    bottom: parseFloat(s.paddingBottom) || 0,
    left: parseFloat(s.paddingLeft) || 0,
  }
}
