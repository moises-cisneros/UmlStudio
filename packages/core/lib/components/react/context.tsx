import { createContext, use, type ReactNode } from "react"
import type { UmlStudioEditor } from "@/umlstudio-editor"

export const UmlStudioInstanceContext = createContext<UmlStudioEditor | null>(null)

export function useUmlStudioEditor(): UmlStudioEditor | null {
  return use(UmlStudioInstanceContext)
}

export function useUmlStudioEditorOrThrow(): UmlStudioEditor {
  const editor = useUmlStudioEditor()
  if (!editor) {
    throw new Error(
      "useUmlStudioEditorOrThrow: no <UmlStudio> (or <UmlStudioProvider>) in the tree, or the editor has not finished mounting."
    )
  }
  return editor
}

export function UmlStudioProvider({
  editor,
  children,
}: {
  editor: UmlStudioEditor
  children: ReactNode
}) {
  return <UmlStudioInstanceContext value={editor}>{children}</UmlStudioInstanceContext>
}
