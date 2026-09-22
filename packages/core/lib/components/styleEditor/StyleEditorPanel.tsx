import React from "react"

export interface StyleEditorPanelProps {
  children?: React.ReactNode
  sideElements?: React.ReactNode
  headerVariant?: "node" | "edge"
}

export function StyleEditorPanel({
  children,
  sideElements,
  headerVariant = "node",
}: StyleEditorPanelProps) {
  return (
    <div data-slot="style-editor" className="umlstudio-style-editor">
      <div
        data-slot="style-editor-header"
        data-variant={headerVariant}
        className="umlstudio-style-editor__header"
      >
        {children}
        {sideElements ? (
          <div
            data-slot="style-editor-header-actions"
            className="umlstudio-style-editor__header-actions"
          >
            {sideElements}
          </div>
        ) : null}
      </div>
    </div>
  )
}
