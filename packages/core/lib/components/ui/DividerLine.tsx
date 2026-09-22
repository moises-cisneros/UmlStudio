import React from "react"

interface DividerLineProps {
  width?: string | number
  height?: string | number
  margin?: string | number
  color?: string
}

export const DividerLine: React.FC<DividerLineProps> = ({ width, height, margin, color }) => (
  <div
    data-slot="divider-line"
    style={
      {
        "--divider-width": width,
        "--divider-height": height,
        "--divider-margin": margin,
        "--divider-color": color,
      } as React.CSSProperties
    }
  />
)
