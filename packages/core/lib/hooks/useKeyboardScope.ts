import { useRef, useState, type FocusEvent, type PointerEvent } from "react"
import { isTypingElement } from "@/keyboard"

export function useKeyboardScope(enabled: boolean) {
  const rootRef = useRef<HTMLDivElement>(null)
  const pointerOwnsFocusRef = useRef(false)
  const [active, setActive] = useState(false)

  const onPointerDownCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (!enabled || event.button !== 0) return

    pointerOwnsFocusRef.current = true
    setActive(true)

    event.currentTarget.focus({ preventScroll: true })
  }

  const onPointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    const focused = event.currentTarget.ownerDocument.activeElement
    if (!pointerOwnsFocusRef.current) {
      setActive(
        focused instanceof Node && event.currentTarget.contains(focused)
      )
      return
    }

    pointerOwnsFocusRef.current = false
    setActive(false)
    if (
      focused instanceof HTMLElement &&
      event.currentTarget.contains(focused) &&
      !isTypingElement(focused)
    ) {
      focused.blur()
    }
  }

  const activate = () => {
    if (enabled) setActive(true)
  }

  const onBlurCapture = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.contains(next)) return
    pointerOwnsFocusRef.current = false
    setActive(false)
  }

  return {
    rootRef,
    active: enabled && active,
    rootHandlers: {
      onPointerEnter: activate,
      onPointerDownCapture,
      onPointerLeave,
      onFocusCapture: activate,
      onBlurCapture,
    },
  }
}
