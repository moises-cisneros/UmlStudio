import { useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useUmlStudioEditor } from "./context"
import { RegionMount } from "../../overlay/RegionMount"
import { type OverlayControlOptions } from "../../overlay/types"

export type UmlStudioControlProps = OverlayControlOptions & {
  children: ReactNode
}

function serializeOptions(o: OverlayControlOptions): string {
  return JSON.stringify({
    region: o.region,
    order: o.order ?? null,
    lane: o.lane ?? null,
    interactive: o.interactive ?? null,
    groupLabel: o.groupLabel ?? null,
    inset: o.inset ?? null,
    visible: o.visible ?? null,
    className: o.className ?? null,
    style: o.style ?? null,
  })
}

export function UmlStudioControl({ children, ...options }: UmlStudioControlProps): ReactNode {
  const editor = useUmlStudioEditor()
  const [host] = useState<HTMLDivElement | null>(() =>
    typeof document !== "undefined" ? document.createElement("div") : null
  )

  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  const sig = serializeOptions(options)
  const appliedSigRef = useRef<string | null>(null)

  useEffect(() => {
    if (!editor || !host) return
    appliedSigRef.current = sig
    return editor.addControl({
      ...optionsRef.current,
      render: () => <RegionMount el={host} />,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, host, options.id])

  useEffect(() => {
    if (!editor || !host || appliedSigRef.current === sig) return
    appliedSigRef.current = sig
    editor.updateControl(options.id, {
      ...optionsRef.current,
      render: () => <RegionMount el={host} />,
    })
  }, [editor, host, options.id, sig])

  return host ? createPortal(children, host) : null
}
