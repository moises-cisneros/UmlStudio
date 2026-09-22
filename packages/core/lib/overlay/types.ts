import { type ReactNode, type CSSProperties } from "react"

export type OverlayRegion =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"
  | "header"
  | "footer"
  | "left-rail"
  | "right-rail"
  | "on-canvas"

export const CORNER_REGIONS = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const

export const OVERLAY_REGIONS: readonly OverlayRegion[] = [
  ...CORNER_REGIONS,
  "header",
  "footer",
  "left-rail",
  "right-rail",
  "on-canvas",
]

export type OverlaySide = "top" | "right" | "bottom" | "left"

export const REGION_EDGE: Partial<Record<OverlayRegion, OverlaySide>> = {
  header: "top",
  footer: "bottom",
  "top-left": "top",
  "top-center": "top",
  "top-right": "top",
  "bottom-left": "bottom",
  "bottom-center": "bottom",
  "bottom-right": "bottom",
  "left-rail": "left",
  "right-rail": "right",
}
export type Insets = Record<OverlaySide, number>
export const ZERO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

export type InsetContribution = "auto" | Partial<Record<OverlaySide, number | "auto">>

export interface OverlayControlOptions {
  id: string
  region: OverlayRegion
  inset?: InsetContribution
  order?: number
  lane?: number
  interactive?: boolean
  groupLabel?: string
  visible?: boolean
  className?: string
  style?: CSSProperties
}

type InternalOverlayControlOptions = OverlayControlOptions & {
  selfPositioned?: boolean
}

export interface OverlayControl extends InternalOverlayControlOptions {
  render: () => ReactNode
}

export type OverlayControlInput = OverlayControlOptions & {
  render: () => ReactNode
}

export type OverlayControlSnapshot = Readonly<OverlayControlOptions>
