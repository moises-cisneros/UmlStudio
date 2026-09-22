import { ViewportPortal } from "@xyflow/react"
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react"
import { useOverlayStore } from "../store/context"
import { readSafeArea } from "./fitView"
import { CORNER_REGIONS, REGION_EDGE, type OverlayControl, type OverlayRegion } from "./types"

const BAND_REGIONS: OverlayRegion[] = ["header", "footer", "left-rail", "right-rail"]

type Placement = Pick<
  CSSProperties,
  "gridArea" | "gridColumn" | "gridRow" | "justifySelf" | "alignSelf"
>
const REGION_PLACEMENT: Partial<Record<OverlayRegion, Placement>> = {
  header: { gridArea: "header" },
  footer: { gridArea: "footer" },
  "left-rail": { gridColumn: 1, gridRow: "2 / 5", justifySelf: "start" },
  "right-rail": { gridColumn: 3, gridRow: "2 / 5", justifySelf: "end" },
  "top-left": { gridArea: "topleft", justifySelf: "start", alignSelf: "start" },
  "top-center": {
    gridArea: "topcenter",
    justifySelf: "center",
    alignSelf: "start",
  },
  "top-right": { gridArea: "topright", justifySelf: "end", alignSelf: "start" },
  "bottom-left": {
    gridArea: "botleft",
    justifySelf: "start",
    alignSelf: "end",
  },
  "bottom-center": {
    gridArea: "botcenter",
    justifySelf: "stretch",
    alignSelf: "end",
  },
  "bottom-right": {
    gridArea: "botright",
    justifySelf: "end",
    alignSelf: "end",
  },
}

const CORNER_ALIGN_ITEMS: Partial<Record<OverlayRegion, CSSProperties["alignItems"]>> = {
  "top-left": "flex-start",
  "top-center": "flex-start",
  "top-right": "flex-start",
  "bottom-left": "flex-end",
  "bottom-center": "flex-end",
  "bottom-right": "flex-end",
}

const LANE_STACK_DIRECTION: Record<string, CSSProperties["flexDirection"]> = {
  header: "column",
  footer: "column-reverse",
  "left-rail": "row",
  "right-rail": "row-reverse",
}

const LANE_MAIN_DIRECTION: Record<string, CSSProperties["flexDirection"]> = {
  header: "row",
  footer: "row",
  "left-rail": "column",
  "right-rail": "column",
}

function groupByLane(controls: OverlayControl[]): [number, OverlayControl[]][] {
  const byLane = new Map<number, OverlayControl[]>()
  for (const control of controls) {
    const lane = control.lane ?? 0
    const list = byLane.get(lane) ?? []
    list.push(control)
    byLane.set(lane, list)
  }
  return [...byLane.entries()].sort((a, b) => a[0] - b[0])
}

function useKeyboardInset(gridRef: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let host: HTMLElement | null = null
    const update = () => {
      const grid = gridRef.current
      host = (grid?.closest(".umlstudio-canvas") as HTMLElement | null) ?? grid
      if (!host) return
      const keyboardTop = vv.offsetTop + vv.height
      const visibleBottom = Math.min(host.getBoundingClientRect().bottom, window.innerHeight)
      const overlap = Math.max(0, visibleBottom - keyboardTop)
      host.style.setProperty("--umlstudio-keyboard-inset", `${overlap}px`)
    }
    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)
    window.addEventListener("resize", update)
    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
      host?.style.removeProperty("--umlstudio-keyboard-inset")
    }
  }, [gridRef])
}

interface ControlSlotProps {
  control: OverlayControl
  registerMeasure: (id: string, el: HTMLElement | null) => void
}

function ControlSlot({ control, registerMeasure }: ControlSlotProps) {
  const interactive = control.interactive !== false
  const setRef = useCallback(
    (el: HTMLDivElement | null) => registerMeasure(control.id, el),
    [control.id, registerMeasure]
  )
  const stop = useCallback((e: { stopPropagation: () => void }) => {
    e.stopPropagation()
  }, [])

  const content: ReactNode = control.groupLabel ? (
    <div role="group" aria-label={control.groupLabel}>
      {control.render()}
    </div>
  ) : (
    control.render()
  )

  const fillRow = control.region === "header" || control.region === "footer"
  const sideRail = control.region === "left-rail" || control.region === "right-rail"

  return (
    <div
      ref={setRef}
      data-umlstudio-control={control.id}
      className={
        interactive ? `nopan nodrag nowheel ${control.className ?? ""}` : control.className
      }
      style={{
        pointerEvents: interactive ? "auto" : "none",
        ...(fillRow ? { flex: "1 1 auto", minWidth: 0 } : null),
        ...(sideRail
          ? {
              minWidth: 0,
              maxWidth: "100%",
              overflow: control.id === "umlstudio:palette" ? "auto" : "visible",
            }
          : null),
        ...control.style,
      }}
      onPointerDown={interactive ? stop : undefined}
      onMouseDown={interactive ? stop : undefined}
      onTouchStart={interactive ? stop : undefined}
    >
      {content}
    </div>
  )
}

export function OverlayLayer() {
  const controls = useOverlayStore((s) => s.controls)
  const setMeasured = useOverlayStore((s) => s.setMeasured)
  const setSafeArea = useOverlayStore((s) => s.setSafeArea)
  const gridRef = useRef<HTMLDivElement>(null)
  useKeyboardInset(gridRef)

  const visibleControls = useMemo(
    () =>
      Object.values(controls)
        .filter((c) => c.visible !== false)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [controls]
  )

  const elByIdRef = useRef(new Map<string, HTMLElement>())
  const elByRegionRef = useRef(new Map<OverlayRegion, HTMLElement>())
  const rafRef = useRef<number | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const controlsRef = useRef(controls)
  const setMeasuredRef = useRef(setMeasured)
  const setSafeAreaRef = useRef(setSafeArea)
  useLayoutEffect(() => {
    controlsRef.current = controls
    setMeasuredRef.current = setMeasured
    setSafeAreaRef.current = setSafeArea
  }, [controls, setMeasured, setSafeArea])

  const flushMeasure = useCallback(() => {
    rafRef.current = null
    for (const [id, el] of elByIdRef.current) {
      const control = controlsRef.current[id]
      if (!control) continue
      const side = REGION_EDGE[control.region]
      if (!side) continue
      const axis = side === "left" || side === "right" ? "width" : "height"
      const raw = axis === "width" ? el.offsetWidth : el.offsetHeight
      const edge = BAND_REGIONS.includes(control.region)
        ? 0
        : parseFloat(getComputedStyle(el).getPropertyValue("--umlstudio-chrome-edge")) || 0
      setMeasuredRef.current(id, { [side]: raw + edge })
    }

    const grid = gridRef.current
    if (grid) {
      setSafeAreaRef.current(readSafeArea(grid))
      const clear = (region: OverlayRegion) => {
        const el = elByRegionRef.current.get(region)
        if (!el) return 0
        const height = el.offsetHeight
        if (height === 0) return 0
        const styles = getComputedStyle(el)
        const edge = parseFloat(styles.getPropertyValue("--umlstudio-chrome-edge")) || 0
        return Math.ceil(height + edge)
      }
      grid.style.setProperty("--umlstudio-left-rail-top-clearance", `${clear("top-left")}px`)
      grid.style.setProperty("--umlstudio-left-rail-bottom-clearance", `${clear("bottom-left")}px`)
      grid.style.setProperty("--umlstudio-right-rail-top-clearance", `${clear("top-right")}px`)
      grid.style.setProperty(
        "--umlstudio-right-rail-bottom-clearance",
        `${clear("bottom-right")}px`
      )
    }
  }, [])

  const scheduleMeasure = useCallback(() => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(flushMeasure)
  }, [flushMeasure])

  useEffect(() => {
    const observer = new ResizeObserver(() => scheduleMeasure())
    observerRef.current = observer
    for (const el of elByIdRef.current.values()) observer.observe(el)
    for (const el of elByRegionRef.current.values()) observer.observe(el)
    if (gridRef.current) observer.observe(gridRef.current)
    scheduleMeasure()
    return () => {
      observer.disconnect()
      observerRef.current = null
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [scheduleMeasure])

  useLayoutEffect(() => {
    flushMeasure()
  }, [controls, flushMeasure])

  const registerMeasure = useCallback(
    (id: string, el: HTMLElement | null) => {
      const observer = observerRef.current
      const prev = elByIdRef.current.get(id)
      if (prev && prev !== el) {
        observer?.unobserve(prev)
        elByIdRef.current.delete(id)
      }
      if (el) {
        elByIdRef.current.set(id, el)
        observer?.observe(el)
        scheduleMeasure()
      }
    },
    [scheduleMeasure]
  )

  const registerRegion = useCallback(
    (region: OverlayRegion, el: HTMLElement | null) => {
      const observer = observerRef.current
      const prev = elByRegionRef.current.get(region)
      if (prev && prev !== el) {
        observer?.unobserve(prev)
        elByRegionRef.current.delete(region)
      }
      if (el) {
        elByRegionRef.current.set(region, el)
        observer?.observe(el)
      }
      scheduleMeasure()
    },
    [scheduleMeasure]
  )

  const selfPositioned = useMemo(
    () => visibleControls.filter((c) => c.selfPositioned),
    [visibleControls]
  )

  const byRegion = useMemo(() => {
    const map = new Map<OverlayRegion, OverlayControl[]>()
    for (const c of visibleControls) {
      if (c.selfPositioned) continue
      const list = map.get(c.region) ?? []
      list.push(c)
      map.set(c.region, list)
    }
    return map
  }, [visibleControls])

  const onCanvas = byRegion.get("on-canvas") ?? []

  return (
    <>
      <div ref={gridRef} className="umlstudio-overlay-grid">
        {BAND_REGIONS.filter((r) => byRegion.has(r)).map((region) => {
          const horizontal = region === "header" || region === "footer"
          return (
            <div
              ref={(el) => registerRegion(region, el)}
              key={region}
              data-umlstudio-region={region}
              className="umlstudio-overlay-band"
              style={{
                boxSizing: "border-box",
                display: "flex",
                maxHeight: "100%",
                pointerEvents: "none",
                ...REGION_PLACEMENT[region],
                flexDirection: LANE_STACK_DIRECTION[region],
                ...(region === "left-rail"
                  ? {
                      paddingTop: "var(--umlstudio-left-rail-top-clearance, 0px)",
                      paddingBottom: "var(--umlstudio-left-rail-bottom-clearance, 0px)",
                    }
                  : null),
                ...(region === "right-rail"
                  ? {
                      paddingTop: "var(--umlstudio-right-rail-top-clearance, 0px)",
                      paddingBottom: "var(--umlstudio-right-rail-bottom-clearance, 0px)",
                    }
                  : null),
              }}
            >
              {groupByLane(byRegion.get(region)!).map(([lane, laneControls]) => (
                <div
                  key={lane}
                  data-umlstudio-lane={lane}
                  className="umlstudio-overlay-lane"
                  style={{
                    display: "flex",
                    flexDirection: LANE_MAIN_DIRECTION[region],
                    gap: "var(--umlstudio-chrome-gap)",
                    ...(horizontal
                      ? { width: "100%" }
                      : {
                          height: "100%",
                          maxWidth: "100%",
                          alignItems: "flex-start",
                          justifyContent: lane === 0 ? "stretch" : "flex-end",
                        }),
                  }}
                >
                  {laneControls.map((c) => (
                    <ControlSlot key={c.id} control={c} registerMeasure={registerMeasure} />
                  ))}
                </div>
              ))}
            </div>
          )
        })}

        {CORNER_REGIONS.filter((r) => byRegion.has(r)).map((region) => (
          <div
            ref={(el) => registerRegion(region, el)}
            key={region}
            data-umlstudio-region={region}
            className="umlstudio-overlay-corner"
            style={{
              display: "flex",
              gap: "var(--umlstudio-chrome-gap)",
              alignItems: CORNER_ALIGN_ITEMS[region],
              justifyContent: region === "bottom-center" ? "center" : undefined,
              pointerEvents: "none",
              ...REGION_PLACEMENT[region],
            }}
          >
            {byRegion.get(region)!.map((c) => (
              <ControlSlot key={c.id} control={c} registerMeasure={registerMeasure} />
            ))}
          </div>
        ))}
      </div>

      {selfPositioned.map((c) => (
        <Fragment key={c.id}>{c.render()}</Fragment>
      ))}

      {onCanvas.length > 0 && (
        <ViewportPortal>
          {onCanvas.map((c) => (
            <ControlSlot key={c.id} control={c} registerMeasure={registerMeasure} />
          ))}
        </ViewportPortal>
      )}
    </>
  )
}
