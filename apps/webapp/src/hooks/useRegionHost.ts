import { useEffect, useState } from "react"
import { useEditorContext } from "@/contexts"

type Editor = ReturnType<typeof useEditorContext>["editor"]
type Region = Parameters<NonNullable<Editor>["getRegionElement"]>[0]

export function useRegionHost(editor: Editor, region: Region, active: boolean): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!editor || !active) {
      return
    }
    let cancelled = false
    const element = editor.getRegionElement(region)
    queueMicrotask(() => {
      if (!cancelled) {
        setHost(element)
      }
    })
    return () => {
      cancelled = true
      editor.releaseRegionElement(region)
      setHost(null)
    }
  }, [editor, region, active])
  return !editor || !active ? null : host
}
