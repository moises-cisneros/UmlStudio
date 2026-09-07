import React from "react"
import { TextField, Typography } from "@/components/ui"
import { StyleEditorPanel } from "./StyleEditorPanel"
import { DefaultNodeProps } from "@/types"
import { useLabels } from "@/i18n/useLabels"

type EditableKey = "name"

interface NodeStyleEditorProps {
  nodeData: DefaultNodeProps
  handleDataFieldUpdate: (key: EditableKey, value: string) => void
  preElements?: React.ReactNode[]
  sideElements?: React.ReactNode[]
  inputPlaceholder?: string
  showNameInputChange?: boolean
  isMultilineName?: boolean
}

export const NodeStyleEditor: React.FC<NodeStyleEditorProps> = ({
  nodeData,
  handleDataFieldUpdate,
  sideElements = [],
  inputPlaceholder,
  showNameInputChange = true,
  isMultilineName = false,
  preElements = [],
}) => {
  const t = useLabels()

  return (
    <StyleEditorPanel sideElements={sideElements} headerVariant="node">
      {preElements}
      {showNameInputChange ? (
        <TextField
          onChange={(event) =>
            handleDataFieldUpdate("name", event.target.value)
          }
          style={{ flex: 1, minWidth: 90 }}
          value={nodeData.name ?? ""}
          placeholder={inputPlaceholder ?? t.namePlaceholder}
          multiline={isMultilineName}
          minRows={isMultilineName ? 1 : undefined}
        />
      ) : (
        <Typography variant="subtitle2" style={{ fontWeight: 600 }}>
          {t.style}
        </Typography>
      )}
    </StyleEditorPanel>
  )
}
