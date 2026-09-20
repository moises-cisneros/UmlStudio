import { FC, useCallback, useEffect, useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@umlstudio/ui/components/dropdown-menu"
import { Button } from "@umlstudio/ui/components/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@umlstudio/ui/components/tooltip"
import { ChevronDownIcon, Edit3 } from "lucide-react"
import { useEditorContext } from "@/contexts"
import { useMediaQuery } from "@/hooks"
import { navbarButtonStyle } from "./styleConstants"
import { MOBILE_MENU_CONTENT_CLASS } from "./islandPrimitives"
import { useTranslation } from "@/i18n"

interface EditMenuProps {
  color?: string
  onClose?: () => void
}

export function EditMenuItems({ onSelect }: { onSelect: () => void }) {
  const { editor } = useEditorContext()
  const { t } = useTranslation()
  const [history, setHistory] = useState(() => ({
    canUndo: editor?.canUndo?.() ?? false,
    canRedo: editor?.canRedo?.() ?? false,
  }))

  useEffect(() => {
    if (!editor) return
    const unsub = editor.subscribeToUndoRedo?.((state) => {
      setHistory(state)
    })
    return () => unsub?.()
  }, [editor])

  const handleAction = useCallback(
    (action: () => void) => {
      action()
      onSelect()
    },
    [onSelect]
  )

  const dispatchKey = useCallback(
    (key: string, modifiers?: { ctrl?: boolean; shift?: boolean }) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          code: key === "Delete" ? "Delete" : undefined,
          ctrlKey: Boolean(modifiers?.ctrl),
          metaKey: Boolean(modifiers?.ctrl),
          shiftKey: Boolean(modifiers?.shift),
          bubbles: true,
        })
      )
    },
    []
  )

  return (
    <>
      <DropdownMenuItem
        disabled={!history.canUndo}
        onClick={() => handleAction(() => editor?.undo?.())}
      >
        <span>{t.menu.undo}</span>
        <DropdownMenuShortcut>Ctrl+Z</DropdownMenuShortcut>
      </DropdownMenuItem>

      <DropdownMenuItem
        disabled={!history.canRedo}
        onClick={() => handleAction(() => editor?.redo?.())}
      >
        <span>{t.menu.redo}</span>
        <DropdownMenuShortcut>Ctrl+Y</DropdownMenuShortcut>
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem onClick={() => handleAction(() => dispatchKey("x", { ctrl: true }))}>
        <span>{t.menu.cut}</span>
        <DropdownMenuShortcut>Ctrl+X</DropdownMenuShortcut>
      </DropdownMenuItem>

      <DropdownMenuItem onClick={() => handleAction(() => dispatchKey("c", { ctrl: true }))}>
        <span>{t.menu.copy}</span>
        <DropdownMenuShortcut>Ctrl+C</DropdownMenuShortcut>
      </DropdownMenuItem>

      <DropdownMenuItem onClick={() => handleAction(() => dispatchKey("v", { ctrl: true }))}>
        <span>{t.menu.paste}</span>
        <DropdownMenuShortcut>Ctrl+V</DropdownMenuShortcut>
      </DropdownMenuItem>

      <DropdownMenuItem onClick={() => handleAction(() => dispatchKey("d", { ctrl: true }))}>
        <span>{t.menu.duplicate}</span>
        <DropdownMenuShortcut>Ctrl+D</DropdownMenuShortcut>
      </DropdownMenuItem>

      <DropdownMenuItem
        variant="destructive"
        onClick={() => handleAction(() => dispatchKey("Delete"))}
      >
        <span>{t.menu.delete}</span>
        <DropdownMenuShortcut>Del</DropdownMenuShortcut>
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem onClick={() => handleAction(() => editor?.fitView?.())}>
        <span>{t.menu.fitView}</span>
        <DropdownMenuShortcut>Ctrl+Shift+1</DropdownMenuShortcut>
      </DropdownMenuItem>
    </>
  )
}

export const EditMenu: FC<EditMenuProps> = ({ color, onClose }) => {
  const [open, setOpen] = useState(false)
  const isLg = useMediaQuery("(min-width: 1024px)")
  const { t } = useTranslation()

  const close = useCallback(() => {
    setOpen(false)
    onClose?.()
  }, [onClose])

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip disabled={isLg}>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              id="edit-menu-button"
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className={navbarButtonStyle()}
                  style={color ? { color } : undefined}
                  aria-label={t.menu.edit}
                />
              }
            >
              <Edit3 className="size-4" aria-hidden />
              <span className="hidden lg:inline">{t.menu.edit}</span>
              <ChevronDownIcon className="size-4" aria-hidden />
            </DropdownMenuTrigger>
          }
        />
        <TooltipContent>{t.menu.edit}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent aria-labelledby="edit-menu-button" className={MOBILE_MENU_CONTENT_CLASS}>
        <EditMenuItems onSelect={close} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
