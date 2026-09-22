import { FC, useCallback, useEffect, useState } from "react"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@umlstudio/ui/components/dropdown-menu"
import { Button } from "@umlstudio/ui/components/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@umlstudio/ui/components/tooltip"
import { BoxSelect, ChevronDownIcon } from "lucide-react"
import { useEditorContext } from "@/contexts"
import { useMediaQuery } from "@/hooks"
import { navbarButtonStyle } from "./styleConstants"
import { MOBILE_MENU_CONTENT_CLASS } from "./islandPrimitives"
import { useTranslation } from "@/i18n"

interface SelectionMenuProps {
  color?: string
  onClose?: () => void
}

export function SelectionMenuItems({ onSelect }: { onSelect: () => void }) {
  const { editor } = useEditorContext()
  const { t } = useTranslation()
  const [isMultiSelect, setIsMultiSelect] = useState(() => editor?.isMultiSelection?.() ?? false)

  useEffect(() => {
    if (!editor) return
    const unsub = editor.subscribeToMultiSelection?.((enabled) => {
      setIsMultiSelect(enabled)
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
    (key: string, modifiers?: { ctrl?: boolean; shift?: boolean; code?: string }) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          code: modifiers?.code,
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
      <DropdownMenuCheckboxItem
        checked={isMultiSelect}
        onCheckedChange={() => {
          editor?.toggleMultiSelection?.()
          onSelect()
        }}
      >
        <span>{t.menu.multiSelect}</span>
        <DropdownMenuShortcut>Shift+M</DropdownMenuShortcut>
      </DropdownMenuCheckboxItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem onClick={() => handleAction(() => dispatchKey("a", { ctrl: true }))}>
        <span>{t.menu.selectAll}</span>
        <DropdownMenuShortcut>Ctrl+A</DropdownMenuShortcut>
      </DropdownMenuItem>

      <DropdownMenuItem onClick={() => handleAction(() => dispatchKey("Escape"))}>
        <span>{t.menu.clearSelection}</span>
        <DropdownMenuShortcut>Esc</DropdownMenuShortcut>
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem onClick={() => handleAction(() => editor?.fitView?.())}>
        <span>{t.menu.fitView}</span>
        <DropdownMenuShortcut>Ctrl+Shift+1</DropdownMenuShortcut>
      </DropdownMenuItem>

      <DropdownMenuItem
        onClick={() =>
          handleAction(() => dispatchKey("2", { ctrl: true, shift: true, code: "Digit2" }))
        }
      >
        <span>{t.menu.zoomToSelection}</span>
        <DropdownMenuShortcut>Ctrl+Shift+2</DropdownMenuShortcut>
      </DropdownMenuItem>
    </>
  )
}

export const SelectionMenu: FC<SelectionMenuProps> = ({ color, onClose }) => {
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
              id="selection-menu-button"
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className={navbarButtonStyle()}
                  style={color ? { color } : undefined}
                  aria-label={t.menu.selection}
                />
              }
            >
              <BoxSelect className="size-4" aria-hidden />
              <span className="hidden lg:inline">{t.menu.selection}</span>
              <ChevronDownIcon className="size-4" aria-hidden />
            </DropdownMenuTrigger>
          }
        />
        <TooltipContent>{t.menu.selection}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        aria-labelledby="selection-menu-button"
        className={MOBILE_MENU_CONTENT_CLASS}
      >
        <SelectionMenuItems onSelect={close} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
