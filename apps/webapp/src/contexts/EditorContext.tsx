import React, { createContext, use, useState, ReactNode, useMemo } from "react"
import { UmlStudioEditor } from "@umlstudio/core"

interface EditorContextType {
  editor?: UmlStudioEditor
  diagramName: string
  flushSharedReplica?: () => Promise<{ generation: string; revision: number }>

  setDiagramName: React.Dispatch<React.SetStateAction<string>>
  setEditor: React.Dispatch<React.SetStateAction<UmlStudioEditor | undefined>>
  setFlushSharedReplica?: React.Dispatch<
    React.SetStateAction<(() => Promise<{ generation: string; revision: number }>) | undefined>
  >
}

export const EditorContext = createContext<EditorContextType | undefined>(undefined)

export const useEditorContext = () => {
  const context = use(EditorContext)

  if (!context) {
    throw new Error("useEditorContext must be used within an EditorContext")
  }
  return context
}

interface Props {
  children: ReactNode
}

export const EditorProvider: React.FC<Props> = ({ children }) => {
  const [editor, setEditor] = useState<UmlStudioEditor>()
  const [diagramName, setDiagramName] = useState("Default Diagram")
  const [flushSharedReplica, setFlushSharedReplica] = useState<
    (() => Promise<{ generation: string; revision: number }>) | undefined
  >()

  const contextValue = useMemo(
    () => ({
      editor,
      setEditor,
      diagramName,
      setDiagramName,
      flushSharedReplica,
      setFlushSharedReplica,
    }),
    [editor, setEditor, diagramName, setDiagramName, flushSharedReplica, setFlushSharedReplica]
  )

  return <EditorContext value={contextValue}>{children}</EditorContext>
}
