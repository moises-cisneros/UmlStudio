import React from "react"
import { Typography } from "@/components/ui"
import { StyleEditorPanel } from "./StyleEditorPanel"
import { CustomEdgeProps } from "@/edges"

interface EdgeStyleEditorProps {
  edgeData?: CustomEdgeProps
  sideElements?: React.ReactNode[]
  label: string
}

export const EdgeStyleEditor: React.FC<EdgeStyleEditorProps> = ({
  edgeData,
  sideElements = [],
  label,
}: EdgeStyleEditorProps) => {
  // edgeData is kept for potential future use / type consistency
  void edgeData
  return (
    <StyleEditorPanel sideElements={sideElements} headerVariant="edge">
      <Typography variant="subtitle2" style={{ fontWeight: 600 }}>
        {label}
      </Typography>
    </StyleEditorPanel>
  )
}
