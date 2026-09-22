import React, { useCallback, useEffect, useRef, useState } from "react"
import { useMetadataStore } from "@/store/context"
import { useShallow } from "zustand/shallow"
import { useLabels } from "@/i18n/useLabels"

const zoomModifierCap = (): string =>
  typeof navigator !== "undefined" && /mac|iphone|ipod|ipad/i.test(navigator.userAgent)
    ? "⌘"
    : "Ctrl"

const HINT_LINGER_MS = 1200

export const ScrollOverlay: React.FC = () => {
  const { scrollLock, scrollEnabled, setScrollEnabled } = useMetadataStore(
    useShallow((state) => ({
      scrollLock: state.scrollLock,
      scrollEnabled: state.scrollEnabled,
      setScrollEnabled: state.setScrollEnabled,
    }))
  )
  const t = useLabels()

  const [showHint, setShowHint] = useState(false)
  const [coarsePointer, setCoarsePointer] = useState(false)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const clearHide = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    if (typeof matchMedia === "undefined") return
    const query = matchMedia("(pointer: coarse)")
    const sync = () => setCoarsePointer(query.matches)
    sync()
    query.addEventListener("change", sync)
    return () => query.removeEventListener("change", sync)
  }, [])

  useEffect(() => {
    if (!scrollLock) return
    const root = rootRef.current?.closest(".umlstudio-editor")
    if (!root) return

    const isZoomModifier = (key: string) => key === "Control" || key === "Meta" || key === "OS"

    const unlock = () => {
      setScrollEnabled(true)
      setShowHint(false)
      clearHide()
    }
    const relock = () => setScrollEnabled(false)

    const onKeyDown = (event: Event) => {
      const { key, repeat } = event as KeyboardEvent
      if (!repeat && isZoomModifier(key)) unlock()
    }
    const onKeyUp = (event: Event) => {
      if (isZoomModifier((event as KeyboardEvent).key)) relock()
    }
    const onWheel = (event: Event) => {
      const { ctrlKey, metaKey } = event as WheelEvent
      if (ctrlKey || metaKey) return
      setShowHint(true)
      clearHide()
      hideTimeoutRef.current = setTimeout(() => {
        setShowHint(false)
        hideTimeoutRef.current = null
      }, HINT_LINGER_MS)
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    window.addEventListener("blur", relock)
    root.addEventListener("wheel", onWheel, { passive: true })

    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", relock)
      root.removeEventListener("wheel", onWheel)
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
        hideTimeoutRef.current = null
      }
      relock()
    }
  }, [scrollLock, setScrollEnabled, clearHide])

  const visible = scrollLock && showHint && !scrollEnabled

  return (
    <div
      ref={rootRef}
      className={`scroll-overlay${visible ? " scroll-overlay--visible" : ""}`}
      role="status"
      aria-live="polite"
    >
      {visible && (
        <p className="scroll-overlay__hint">
          {coarsePointer ? t.scrollLockHintTouch : t.scrollLockHint(zoomModifierCap())}
        </p>
      )}
    </div>
  )
}
