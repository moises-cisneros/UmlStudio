import { useCallback, useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { NodeToolbar, Position, useStore } from "@xyflow/react"
import { useUmlStudioEditor } from "./context"
import { RegionMount } from "@/overlay/RegionMount"
import { useLabels } from "@/i18n/useLabels"
import type { OverlayControl } from "@/overlay/types"

const POSITION: Record<string, Position> = {
  top: Position.Top,
  bottom: Position.Bottom,
  left: Position.Left,
  right: Position.Right,
}

export type UmlStudioSelectionToolbarProps = {
  children: ReactNode
  position?: "top" | "bottom" | "left" | "right"
  offset?: number
  id?: string
  ariaLabel?: string
  role?: "toolbar" | "group"
}

function SelectionToolbarMount({
  el,
  position,
  offset,
  ariaLabel,
  role,
}: {
  el: HTMLElement
  position: Position
  offset: number
  ariaLabel?: string
  role?: "toolbar" | "group"
}) {
  const t = useLabels()
  const selected = useStore((s) => {
    const ids: string[] = []
    for (const node of s.nodeLookup.values())
      if (node.selected) ids.push(node.id)
    return ids.join("\n")
  })
  const ids = selected ? selected.split("\n") : []
  const stop = useCallback((event: { stopPropagation: () => void }) => {
    event.stopPropagation()
  }, [])

  return (
    <NodeToolbar
      nodeId={ids}
      isVisible={ids.length > 0}
      position={position}
      offset={offset}
    >
      <div
        className="nodrag nopan nowheel"
        role={role}
        aria-label={ariaLabel ?? t.selectionActions}
        onPointerDown={stop}
        onMouseDown={stop}
        onTouchStart={stop}
        onWheel={stop}
        onKeyDown={stop}
      >
        <RegionMount el={el} />
      </div>
    </NodeToolbar>
  )
}

export function UmlStudioSelectionToolbar({
  children,
  position = "top",
  offset = 8,
  id = "umlstudio:selection-toolbar",
  ariaLabel,
  role = "group",
}: UmlStudioSelectionToolbarProps): ReactNode {
  const editor = useUmlStudioEditor()
  const [host] = useState<HTMLDivElement | null>(() =>
    typeof document !== "undefined" ? document.createElement("div") : null
  )
  const rfPosition = POSITION[position]

  useEffect(() => {
    if (!editor || !host) return
    const control: OverlayControl = {
      id,
      region: "on-canvas",
      selfPositioned: true,
      render: () => (
        <SelectionToolbarMount
          el={host}
          position={rfPosition}
          offset={offset}
          ariaLabel={ariaLabel}
          role={role}
        />
      ),
    }
    return editor.addControl(control)
  }, [editor, host, id, rfPosition, offset, ariaLabel, role])

  return host ? createPortal(children, host) : null
}
