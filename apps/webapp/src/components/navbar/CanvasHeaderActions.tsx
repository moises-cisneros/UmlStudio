import React, { useEffect, useState } from "react"
import { RotateCcw, RotateCw } from "lucide-react"
import { Button } from "@umlstudio/ui/components/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@umlstudio/ui/components/tooltip"
import { useEditorContext } from "@/contexts"
import { navbarButtonStyle } from "./styleConstants"
import { useTranslation } from "@/i18n"

export const CanvasHeaderActions: React.FC = () => {
  const { editor } = useEditorContext()
  const { t } = useTranslation()
  const [history, setHistory] = useState(() => ({
    canUndo: editor?.canUndo?.() ?? false,
    canRedo: editor?.canRedo?.() ?? false,
  }))

  useEffect(() => {
    if (!editor) return

    const unsubHistory = editor.subscribeToUndoRedo?.((state) => {
      setHistory(state)
    })

    return () => {
      unsubHistory?.()
    }
  }, [editor])

  const handleUndo = () => {
    editor?.undo?.()
  }

  const handleRedo = () => {
    editor?.redo?.()
  }

  return (
    <div className="flex items-center gap-0.5" role="toolbar" aria-label="Canvas history tools">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={navbarButtonStyle("h-8 w-8 p-0 inline-flex items-center justify-center")}
              disabled={!history.canUndo}
              onClick={handleUndo}
              aria-label={t.menu.undo}
            >
              <RotateCcw className="size-4" strokeWidth={2} aria-hidden="true" />
            </Button>
          }
        />
        <TooltipContent>{t.menu.undo} (Ctrl+Z)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={navbarButtonStyle("h-8 w-8 p-0 inline-flex items-center justify-center")}
              disabled={!history.canRedo}
              onClick={handleRedo}
              aria-label={t.menu.redo}
            >
              <RotateCw className="size-4" strokeWidth={2} aria-hidden="true" />
            </Button>
          }
        />
        <TooltipContent>{t.menu.redo} (Ctrl+Y)</TooltipContent>
      </Tooltip>
    </div>
  )
}
