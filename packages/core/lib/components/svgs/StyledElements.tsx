import { LAYOUT } from "@/constants"
import React from "react"

export const StyledRect: React.FC<React.SVGProps<SVGRectElement>> = ({
  stroke = "var(--umlstudio-foreground, #000000)",
  fill = "var(--umlstudio-background, white)",
  ...props
}) => {
  return (
    <rect
      stroke={stroke}
      fill={fill}
      strokeWidth={LAYOUT.LINE_WIDTH}
      {...props}
    />
  )
}
