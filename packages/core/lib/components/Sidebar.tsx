import React, { useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  ColorDescriptionConfig,
  dropElementConfigs,
  LAYOUT,
  MOBILE_VIEW_QUERY,
} from "@/constants"
import { useMetadataStore, useOverlayStore } from "@/store/context"
import { useShallow } from "zustand/shallow"
import { DraggableGhost } from "./DraggableGhost"
import { UmlStudioMode, UmlStudioView } from "@/typings"
import {
  COMPACT_PALETTE,
  PALETTE,
  computePaletteLayout,
  previewScaleForCell,
} from "@/utils/paletteLayout"

const labelPreviewTypes = new Set([
  "sfcTransitionBranch",
  "petriNetPlace",
  "petriNetTransition",
])

const previewExtraHeight = (type: string) =>
  labelPreviewTypes.has(type) ? LAYOUT.DEFAULT_ATTRIBUTE_HEIGHT : 0

const VIEW_SWITCH_HEIGHT = 64
const PALETTE_LAYOUT_SLACK = 4

export const Sidebar = () => {
  const { diagramType, view, setView, availableViews, mode, readonly, labels } =
    useMetadataStore(
      useShallow((state) => ({
        diagramType: state.diagramType,
        view: state.view,
        setView: state.setView,
        availableViews: state.availableViews,
        mode: state.mode,
        readonly: state.readonly,
        labels: state.labels,
      }))
    )
  const showPalette = mode === UmlStudioMode.Modelling && !readonly
  const showInteractiveSelectionView =
    availableViews.includes(UmlStudioView.Highlight) ||
    view === UmlStudioView.Highlight

  const paletteItems = useMemo(
    () => dropElementConfigs[diagramType],
    [diagramType]
  )

  const isRightRail = useOverlayStore(
    (state) => state.controls["umlstudio:palette"]?.region === "right-rail"
  )
  const asideRef = useRef<HTMLElement>(null)
  const [canvas, setCanvas] = useState({ w: 0, h: 0, compact: false })

  useLayoutEffect(() => {
    const aside = asideRef.current
    const band = aside?.closest(".umlstudio-overlay-band") as HTMLElement | null
    const canvasEl = aside?.closest(".umlstudio-canvas") as HTMLElement | null
    if (!aside || !band || !canvasEl) return
    const mobileQuery = window.matchMedia(MOBILE_VIEW_QUERY)
    const measure = () => {
      const gap =
        parseFloat(
          getComputedStyle(aside).getPropertyValue("--umlstudio-chrome-gap")
        ) || 8
      const bandStyle = getComputedStyle(band)
      const verticalPadding =
        (parseFloat(bandStyle.paddingTop) || 0) +
        (parseFloat(bandStyle.paddingBottom) || 0)
      const h = Math.max(0, band.clientHeight - verticalPadding - 2 * gap)
      const w = canvasEl.getBoundingClientRect().width
      const compact = mobileQuery.matches
      setCanvas((prev) =>
        prev.w === w && prev.h === h && prev.compact === compact
          ? prev
          : { w, h, compact }
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(band)
    observer.observe(canvasEl)
    mobileQuery.addEventListener("change", measure)
    return () => {
      observer.disconnect()
      mobileQuery.removeEventListener("change", measure)
    }
  }, [])

  const cellCount = paletteItems.length + 1
  const chromeHeight = showInteractiveSelectionView ? VIEW_SWITCH_HEIGHT : 0
  const layout = useMemo(
    () =>
      computePaletteLayout(
        cellCount,
        canvas.w,
        Math.max(0, canvas.h - PALETTE_LAYOUT_SLACK),
        chromeHeight,
        canvas.compact
      ),
    [cellCount, canvas.w, canvas.h, canvas.compact, chromeHeight]
  )
  const paletteMetrics = canvas.compact ? COMPACT_PALETTE : PALETTE

  const previewScale = useMemo(() => {
    if (layout.cellW <= 0 || layout.cellH <= 0) return 0
    return Math.min(
      ...[...paletteItems, ColorDescriptionConfig].map((config) =>
        previewScaleForCell(
          config.width,
          config.height + previewExtraHeight(config.type),
          layout.cellW,
          layout.cellH,
          canvas.compact
        )
      )
    )
  }, [paletteItems, layout.cellW, layout.cellH, canvas.compact])

  if (!showPalette || paletteItems.length === 0) {
    return null
  }

  const cellStyle = { width: layout.cellW, height: layout.cellH }

  const renderCell = (
    config: (typeof paletteItems)[number],
    id: string,
    keyValue: string
  ) => {
    const extraPreviewHeight = previewExtraHeight(config.type)
    return (
      <DraggableGhost key={keyValue} dropElementConfig={config}>
        <div
          className="umlstudio-palette__entry prevent-select"
          style={cellStyle}
        >
          <div
            data-draggable-preview
            style={{
              width: config.width * previewScale,
              height: (config.height + extraPreviewHeight) * previewScale,
            }}
          >
            {React.createElement(config.svg, {
              width: config.width,
              height: config.height,
              ...config.defaultData,
              data: config.defaultData,
              SIDEBAR_PREVIEW_SCALE: previewScale,
              id,
            })}
          </div>
        </div>
      </DraggableGhost>
    )
  }

  const paletteStyle: React.CSSProperties = {
    ...(canvas.h ? { maxHeight: canvas.h } : null),
    ...(isRightRail
      ? { marginLeft: 0, marginRight: "var(--umlstudio-chrome-edge)" }
      : null),
  }

  return (
    <aside
      ref={asideRef}
      className="umlstudio-palette"
      data-testid="umlstudio-palette"
      aria-label={labels.elementPalette}
      style={paletteStyle}
    >
      {showInteractiveSelectionView && (
        <div className="umlstudio-palette__view-switch">
          <button
            type="button"
            onClick={() => setView(UmlStudioView.Modelling)}
            className={
              view === UmlStudioView.Modelling
                ? "umlstudio-palette__view-button umlstudio-palette__view-button--active"
                : "umlstudio-palette__view-button"
            }
          >
            {labels.paletteModelView}
          </button>
          <button
            type="button"
            onClick={() => setView(UmlStudioView.Highlight)}
            className={
              view === UmlStudioView.Highlight
                ? "umlstudio-palette__view-button umlstudio-palette__view-button--active"
                : "umlstudio-palette__view-button"
            }
          >
            {labels.paletteSelectElementsView}
          </button>
        </div>
      )}

      {view === UmlStudioView.Highlight && (
        <div className="umlstudio-palette__hint">
          {labels.paletteHighlightHint}
        </div>
      )}

      {view === UmlStudioView.Modelling && (
        <div
          className="umlstudio-palette__entries"
          style={{
            gridTemplateColumns: `repeat(${layout.cols}, ${layout.cellW}px)`,
            gap: paletteMetrics.GAP,
          }}
        >
          {paletteItems.map((config, index) =>
            renderCell(
              config,
              `sidebarElement_${index}`,
              `${config.type}_${config.defaultData?.name}`
            )
          )}
          {renderCell(
            ColorDescriptionConfig,
            "sidebarElement_ColorDescription",
            "colorDescription"
          )}
        </div>
      )}
    </aside>
  )
}
