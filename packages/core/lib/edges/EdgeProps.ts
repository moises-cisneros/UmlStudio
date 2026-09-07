import { Edge, EdgeProps } from "@xyflow/react"
import { IPoint } from "./Connection"
import type { FreeformEdgeAnchor } from "@/utils/edgeUtils"

export type CustomEdgeProps = {
  sourceRole: string | null
  sourceMultiplicity: string | null
  targetRole: string | null
  targetMultiplicity: string | null
  points: IPoint[]
  sourceAnchor?: FreeformEdgeAnchor
  targetAnchor?: FreeformEdgeAnchor
  label?: string | null
  strokeColor?: string
  textColor?: string
}

export type ExtendedEdgeProps = EdgeProps<Edge<CustomEdgeProps>> & {
  markerEnd?: string
  markerPadding?: number
  strokeDashArray?: string
  type: string
}
