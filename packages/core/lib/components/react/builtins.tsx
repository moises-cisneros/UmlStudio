import { useEffect } from "react"
import { useUmlStudioEditor } from "./context"
import type { OverlayControlInput } from "@/overlay/types"
import {
  miniMapControl,
  paletteControl,
  zoomControl,
  type PaletteControlOptions,
  type MiniMapControlOptions,
  type ZoomControlOptions,
} from "@/chrome/builtins/controls"

export function useControl(make: () => OverlayControlInput, deps: readonly unknown[]): void {
  const editor = useUmlStudioEditor()
  useEffect(() => {
    if (!editor) return
    return editor.addControl(make())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, ...deps])
}

const key = (o: object): string => JSON.stringify(o)

export function UmlStudioPalette(props: PaletteControlOptions = {}): null {
  useControl(() => paletteControl(props), [key(props)])
  return null
}

export function UmlStudioZoom({ history, ...placement }: ZoomControlOptions = {}): null {
  useControl(() => zoomControl({ history, ...placement }), [history, key(placement)])
  return null
}

export function UmlStudioMiniMap({
  pannable,
  zoomable,
  ...placement
}: MiniMapControlOptions = {}): null {
  useControl(
    () => miniMapControl({ pannable, zoomable, ...placement }),
    [pannable, zoomable, key(placement)]
  )
  return null
}
