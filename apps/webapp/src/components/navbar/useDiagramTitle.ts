import { useEffect, useRef, useState } from "react"
import { useEditorContext } from "@/contexts"

export function useDiagramTitle() {
  const { editor } = useEditorContext()
  const [title, setTitle] = useState(editor?.getDiagramMetadata().diagramTitle || "")
  const subIdRef = useRef<number | undefined>(undefined)

  const [prevEditor, setPrevEditor] = useState(editor)
  if (editor !== prevEditor) {
    setPrevEditor(editor)
    setTitle(editor?.getDiagramMetadata().diagramTitle || "")
  }

  useEffect(() => {
    if (!editor) return
    subIdRef.current = editor.subscribeToDiagramNameChange((t) => setTitle(t))
    return () => {
      if (subIdRef.current !== undefined) editor.unsubscribe(subIdRef.current)
    }
  }, [editor])

  const onValueChange = (next: string) => {
    editor?.updateDiagramTitle(next)
    setTitle(next)
  }

  return { value: title, onValueChange }
}
