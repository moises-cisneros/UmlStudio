import { IPoint } from "../Connection"
import { computeMiddleLabelLayout, type Rect } from "@/utils/geometry/edgeLabelLayout"
import { measureTextWidth } from "@/utils/textUtils"
import { FONT_FAMILY } from "@/fontStack"

interface EdgeMiddleLabelsProps {
  label?: string | null
  activePoints?: IPoint[]
  nodeRects?: Rect[]
  neighborGeometry?: IPoint[][]
  showRelationshipLabels?: boolean
  textColor: string
}

const LABEL_FONT_SIZE = 12

export const EdgeMiddleLabels = ({
  label,
  activePoints,
  nodeRects,
  neighborGeometry,
  showRelationshipLabels = false,
  textColor,
}: EdgeMiddleLabelsProps) => {
  if (!label || !showRelationshipLabels) return null

  if (!activePoints || activePoints.length < 2) return null
  const placed = computeMiddleLabelLayout({
    renderPoints: activePoints,
    labelText: label,
    fontSize: LABEL_FONT_SIZE,
    measuredWidth: measureTextWidth(label, `700 ${LABEL_FONT_SIZE}px ${FONT_FAMILY}`),
    nodeRects,
    neighborGeometry,
  })

  return (
    <text
      x={placed.x}
      y={placed.y}
      textAnchor={placed.textAnchor}
      dominantBaseline={placed.dominantBaseline}
      style={{
        fontSize: "12px",
        fontWeight: 700,
        fill: textColor,
        userSelect: "none",
        pointerEvents: "none",
      }}
      className="nodrag nopan"
    >
      {label}
    </text>
  )
}
