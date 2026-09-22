import React, { useEffect, useRef, useState } from "react"
import { DROPS, DropElementConfig, ZINDEX } from "@/constants"
import { createPortal } from "react-dom"
import { useReactFlow, type XYPosition } from "@xyflow/react"
import { useMetadataStore } from "@/store/context"
import { resolveUmlStudioThemeVars } from "@/components/ui/portalTheme"
import { useUmlStudioPortalContainer } from "@/components/ui/portalContainer"
import { useShallow } from "zustand/shallow"
import { usePalettePlacement } from "@/hooks/usePalettePlacement"

let savedBodyOverflow = ""
let savedBodyTouchAction = ""

const disableScroll = () => {
  savedBodyOverflow = document.body.style.overflow
  savedBodyTouchAction = document.body.style.touchAction
  document.body.style.overflow = "hidden"
  document.body.style.touchAction = "none"
}

const enableScroll = () => {
  document.body.style.overflow = savedBodyOverflow
  document.body.style.touchAction = savedBodyTouchAction
}

interface GhostTheme {
  vars: React.CSSProperties
  dataTheme?: string
}

interface DraggableGhostProps {
  children: React.ReactNode
  dropElementConfig: DropElementConfig
}

export const DraggableGhost: React.FC<DraggableGhostProps> = ({ children, dropElementConfig }) => {
  const { getViewport } = useReactFlow()
  const { dropAtPointer, placeAtViewportCenter } = usePalettePlacement(dropElementConfig)
  const { addElementLabel, nodeTypeLabel } = useMetadataStore(
    useShallow((state) => ({
      addElementLabel: state.labels.addElement,
      nodeTypeLabel: state.labels.nodeTypeLabel,
    }))
  )
  const portalContainer = useUmlStudioPortalContainer()

  const ghostDropWidth = dropElementConfig.dropWidth ?? dropElementConfig.width
  const ghostDropHeight = dropElementConfig.dropHeight ?? dropElementConfig.height

  const [isDragging, setIsDragging] = useState(false)
  const [ghostPosition, setGhostPosition] = useState({ x: 0, y: 0 })
  const [ghostOffset, setGhostOffset] = useState({ x: 0, y: 0 })
  const [ghostRender, setGhostRender] = useState({ scale: 1 })
  const [ghostTheme, setGhostTheme] = useState<GhostTheme>({ vars: {} })

  const startRef = useRef<XYPosition | null>(null)
  const maxTravelRef = useRef(0)
  const pointerTypeRef = useRef<string>("mouse")
  const grabOffsetRef = useRef<XYPosition>({ x: 0, y: 0 })
  const draggedRef = useRef(false)

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    disableScroll()

    startRef.current = { x: event.clientX, y: event.clientY }
    maxTravelRef.current = 0
    draggedRef.current = false
    pointerTypeRef.current = event.pointerType

    setGhostTheme({
      vars: resolveUmlStudioThemeVars(event.currentTarget),
      dataTheme:
        event.currentTarget.closest("[data-theme]")?.getAttribute("data-theme") ?? undefined,
    })

    const previewElement = event.currentTarget.querySelector<HTMLElement>(
      "[data-draggable-preview]"
    )
    const previewRect = (previewElement ?? event.currentTarget).getBoundingClientRect()
    const previewScale = previewRect.width / dropElementConfig.width || 1
    const grabOffset = {
      x:
        ((event.clientX - previewRect.left) / previewScale) *
        (ghostDropWidth / dropElementConfig.width),
      y:
        ((event.clientY - previewRect.top) / previewScale) *
        (ghostDropHeight / dropElementConfig.height),
    }
    grabOffsetRef.current = grabOffset

    const zoom = getViewport().zoom
    setGhostRender({ scale: zoom })

    setGhostOffset({
      x: grabOffset.x * zoom,
      y: grabOffset.y * zoom,
    })
    setGhostPosition({
      x: event.clientX - grabOffset.x * zoom,
      y: event.clientY - grabOffset.y * zoom,
    })

    setIsDragging(true)
  }

  const dropRef = useRef(dropAtPointer)
  useEffect(() => {
    dropRef.current = dropAtPointer
  }, [dropAtPointer])

  useEffect(() => {
    if (!isDragging) return
    let trailingClickTimer: number | null = null

    const resetDrag = () => {
      enableScroll()
      setIsDragging(false)
      setGhostPosition({ x: 0, y: 0 })
    }

    const suppressTrailingClick = () => {
      draggedRef.current = true
      trailingClickTimer = window.setTimeout(() => {
        draggedRef.current = false
        trailingClickTimer = null
      }, 0)
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (startRef.current) {
        const travelled = Math.hypot(
          event.clientX - startRef.current.x,
          event.clientY - startRef.current.y
        )
        if (travelled > maxTravelRef.current) maxTravelRef.current = travelled
      }
      setGhostPosition({
        x: event.clientX - ghostOffset.x,
        y: event.clientY - ghostOffset.y,
      })
    }

    const handlePointerUp = (event: PointerEvent) => {
      resetDrag()
      const slop =
        pointerTypeRef.current === "touch" ? DROPS.TAP_SLOP_TOUCH_PX : DROPS.TAP_SLOP_MOUSE_PX
      const placed = maxTravelRef.current >= slop && dropRef.current(event, grabOffsetRef.current)
      if (placed) suppressTrailingClick()
      else draggedRef.current = false
    }

    const handlePointerCancel = () => {
      suppressTrailingClick()
      resetDrag()
    }

    document.addEventListener("pointermove", handlePointerMove)
    document.addEventListener("pointerup", handlePointerUp)
    document.addEventListener("pointercancel", handlePointerCancel)
    return () => {
      if (trailingClickTimer !== null) {
        window.clearTimeout(trailingClickTimer)
      }
      document.removeEventListener("pointermove", handlePointerMove)
      document.removeEventListener("pointerup", handlePointerUp)
      document.removeEventListener("pointercancel", handlePointerCancel)
    }
  }, [isDragging, ghostOffset])

  const handleClick = () => {
    if (draggedRef.current) {
      draggedRef.current = false
      return
    }
    placeAtViewportCenter()
  }

  const ghostElement = (
    <div
      data-draggable-preview
      data-theme={ghostTheme.dataTheme}
      style={{
        ...ghostTheme.vars,
        position: "fixed",
        left: `${ghostPosition.x}px`,
        top: `${ghostPosition.y}px`,
        pointerEvents: "none",
        zIndex: ZINDEX.DRAGGABLE_ELEMENT,
        opacity: 0.8,
      }}
    >
      {React.createElement(dropElementConfig.svg, {
        width: ghostDropWidth,
        height: ghostDropHeight,
        ...dropElementConfig.defaultData,
        data: dropElementConfig.defaultData,
        SIDEBAR_PREVIEW_SCALE: ghostRender.scale,
      })}
    </div>
  )

  const elementName =
    typeof dropElementConfig.defaultData?.name === "string" && dropElementConfig.defaultData.name
      ? (dropElementConfig.defaultData.name as string)
      : nodeTypeLabel(dropElementConfig.type)

  return (
    <>
      <button
        type="button"
        className="umlstudio-palette__cell"
        aria-label={`${addElementLabel}: ${elementName}`}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        style={{ touchAction: "none" }}
      >
        {children}
      </button>
      {isDragging && createPortal(ghostElement, portalContainer)}
    </>
  )
}
