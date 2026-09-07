import { useCallback, useEffect, useRef, useSyncExternalStore } from "react"
import type { UmlStudioEditor } from "@/umlstudio-editor"
import { useUmlStudioEditor } from "./context"

export function useUmlStudioSubscription<T>(
  subscribe: (editor: UmlStudioEditor, cb: (value: T) => void) => number,
  getSnapshot: (editor: UmlStudioEditor) => T
): T | undefined {
  const editor = useUmlStudioEditor()

  const subscribeRef = useRef(subscribe)
  const getSnapshotRef = useRef(getSnapshot)
  useEffect(() => {
    subscribeRef.current = subscribe
    getSnapshotRef.current = getSnapshot
  })

  const sub = useCallback(
    (notify: () => void) => {
      if (!editor) return () => {}
      const id = subscribeRef.current(editor, notify as (v: T) => void)
      return () => {
        editor.unsubscribe(id)
      }
    },
    [editor]
  )

  const read = useCallback(
    () => (editor ? getSnapshotRef.current(editor) : undefined),
    [editor]
  )

  return useSyncExternalStore(sub, read, read)
}
