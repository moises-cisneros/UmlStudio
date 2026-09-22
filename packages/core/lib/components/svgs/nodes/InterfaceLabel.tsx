import { FC } from "react"
import { LAYOUT } from "@/constants"
import { MultilineText } from "./MultilineText"
import type { InterfaceLabelSide } from "@/utils/geometry/interfaceLabelLayout"

interface Props {
  name?: string | null
  width: number
  height: number
  fill?: string
  side?: InterfaceLabelSide
}

const NO_WRAP_WIDTH = 100_000

type Placement = {
  x: number
  y: number
  textAnchor: "start" | "middle" | "end"
  verticalAnchor: "top" | "middle" | "bottom"
}

export const InterfaceLabel: FC<Props> = ({ name, width, height, fill, side = "bottom" }) => {
  if (!name) return null

  const gap = LAYOUT.DEFAULT_PADDING / 2
  const halfLine = LAYOUT.NAME_LINE_HEIGHT / 2
  const cx = width / 2
  const cy = height / 2
  const r = width / 2
  const outX = r + gap
  const outY = r + gap

  const placements: Record<InterfaceLabelSide, Placement> = {
    bottom: {
      x: cx,
      y: cy + outY + halfLine,
      textAnchor: "middle",
      verticalAnchor: "top",
    },
    top: {
      x: cx,
      y: cy - outY - halfLine,
      textAnchor: "middle",
      verticalAnchor: "bottom",
    },
    left: { x: cx - outX, y: cy, textAnchor: "end", verticalAnchor: "middle" },
    right: {
      x: cx + outX,
      y: cy,
      textAnchor: "start",
      verticalAnchor: "middle",
    },
    "bottom-right": {
      x: cx + outX,
      y: cy + outY + halfLine,
      textAnchor: "start",
      verticalAnchor: "top",
    },
    "bottom-left": {
      x: cx - outX,
      y: cy + outY + halfLine,
      textAnchor: "end",
      verticalAnchor: "top",
    },
    "top-right": {
      x: cx + outX,
      y: cy - outY - halfLine,
      textAnchor: "start",
      verticalAnchor: "bottom",
    },
    "top-left": {
      x: cx - outX,
      y: cy - outY - halfLine,
      textAnchor: "end",
      verticalAnchor: "bottom",
    },
  }
  const placement = placements[side]

  return (
    <MultilineText
      text={name}
      x={placement.x}
      y={placement.y}
      verticalAnchor={placement.verticalAnchor}
      textAnchor={placement.textAnchor}
      maxWidth={NO_WRAP_WIDTH}
      fontSize={LAYOUT.NAME_FONT_SIZE}
      lineHeight={LAYOUT.NAME_LINE_HEIGHT}
      fontWeight="bold"
      fill={fill}
    />
  )
}
