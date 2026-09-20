import { useEffect, type FC } from "react"
import { createPortal } from "react-dom"
import { useEditorContext } from "@/contexts"
import { useRegionHost } from "@/hooks/useRegionHost"
import { useWorkbenchStore } from "@/stores/useWorkbenchStore"
import { RightDockWorkspace } from "./RightDockWorkspace"
import { AgentCanvasFloatingButton } from "./AgentCanvasFloatingButton"

export const EditorChromeRightDock: FC = () => {
  const { editor } = useEditorContext()
  const isAgentDockOpen = useWorkbenchStore((s) => s.isAgentDockOpen)
  const rightRailHost = useRegionHost(editor, "right-rail", isAgentDockOpen)

  useEffect(() => {
    if (!rightRailHost) return
    const canvas = rightRailHost.closest(".umlstudio-canvas")
    if (!canvas) return
    canvas.setAttribute("data-agent-dock-open", "true")
    return () => {
      canvas.removeAttribute("data-agent-dock-open")
    }
  }, [rightRailHost])

  return (
    <>
      <AgentCanvasFloatingButton />
      {rightRailHost && isAgentDockOpen && createPortal(<RightDockWorkspace />, rightRailHost)}
    </>
  )
}
