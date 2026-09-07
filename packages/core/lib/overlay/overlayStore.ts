import { create, StoreApi, UseBoundStore } from "zustand"
import { devtools } from "zustand/middleware"
import {
  type Insets,
  type OverlayControl,
  type OverlayRegion,
  type OverlaySide,
  REGION_EDGE,
  ZERO_INSETS,
} from "./types"

const BANDS = new Set<OverlayRegion>([
  "header",
  "footer",
  "left-rail",
  "right-rail",
])

function controlContribution(
  control: OverlayControl,
  measured: Partial<Record<OverlaySide, number>> | undefined
): Partial<Record<OverlaySide, number>> {
  const { inset, region } = control
  const edge = REGION_EDGE[region]

  if (inset === undefined) {
    return BANDS.has(region) && edge ? { [edge]: measured?.[edge] ?? 0 } : {}
  }
  if (inset === "auto") {
    return edge ? { [edge]: measured?.[edge] ?? 0 } : {}
  }
  const out: Partial<Record<OverlaySide, number>> = {}
  for (const side of Object.keys(inset) as OverlaySide[]) {
    const v = inset[side]
    out[side] = v === "auto" ? (measured?.[side] ?? 0) : (v ?? 0)
  }
  return out
}

export function computeInsets(
  controls: OverlayControl[],
  measured: Record<string, Partial<Record<OverlaySide, number>>>
): Insets {
  const result: Insets = { ...ZERO_INSETS }
  const laneMax: Partial<Record<OverlaySide, Map<number, number>>> = {}
  for (const control of controls) {
    if (control.visible === false) continue
    const contribution = controlContribution(control, measured[control.id])
    if (BANDS.has(control.region)) {
      const edge = REGION_EDGE[control.region]
      if (!edge) continue
      const lane = control.lane ?? 0
      const perLane = (laneMax[edge] ??= new Map())
      perLane.set(
        lane,
        Math.max(perLane.get(lane) ?? 0, contribution[edge] ?? 0)
      )
      continue
    }
    for (const side of Object.keys(contribution) as OverlaySide[]) {
      result[side] = Math.max(result[side], contribution[side] ?? 0)
    }
  }
  for (const side of Object.keys(laneMax) as OverlaySide[]) {
    let summed = 0
    for (const v of laneMax[side]!.values()) summed += v
    result[side] = Math.max(result[side], summed)
  }
  return result
}

const insetsEqual = (a: Insets, b: Insets): boolean =>
  a.top === b.top &&
  a.right === b.right &&
  a.bottom === b.bottom &&
  a.left === b.left

const measuredEqual = (
  a: Partial<Record<OverlaySide, number>> | undefined,
  b: Partial<Record<OverlaySide, number>>
): boolean =>
  (a?.top ?? 0) === (b.top ?? 0) &&
  (a?.right ?? 0) === (b.right ?? 0) &&
  (a?.bottom ?? 0) === (b.bottom ?? 0) &&
  (a?.left ?? 0) === (b.left ?? 0)

const recompute = (
  prev: Insets,
  controls: Record<string, OverlayControl>,
  measured: Record<string, Partial<Record<OverlaySide, number>>>
): Insets => {
  const next = computeInsets(Object.values(controls), measured)
  return insetsEqual(prev, next) ? prev : next
}

export type OverlayStore = {
  controls: Record<string, OverlayControl>
  measured: Record<string, Partial<Record<OverlaySide, number>>>
  insets: Insets
  safeArea: Insets

  register: (control: OverlayControl) => void
  unregister: (id: string) => void
  setMeasured: (id: string, rect: Partial<Record<OverlaySide, number>>) => void
  setSafeArea: (safeArea: Insets) => void
}

const initialState = {
  controls: {} as Record<string, OverlayControl>,
  measured: {} as Record<string, Partial<Record<OverlaySide, number>>>,
  insets: ZERO_INSETS,
  safeArea: ZERO_INSETS,
}

export const createOverlayStore = (): UseBoundStore<StoreApi<OverlayStore>> =>
  create<OverlayStore>()(
    devtools(
      (set) => ({
        ...initialState,

        register: (control) =>
          set(
            (s) => {
              const controls = { ...s.controls, [control.id]: control }
              return {
                controls,
                insets: recompute(s.insets, controls, s.measured),
              }
            },
            undefined,
            "register"
          ),

        unregister: (id) =>
          set(
            (s) => {
              if (!(id in s.controls)) return s
              const controls = { ...s.controls }
              const measured = { ...s.measured }
              delete controls[id]
              delete measured[id]
              return {
                controls,
                measured,
                insets: recompute(s.insets, controls, measured),
              }
            },
            undefined,
            "unregister"
          ),

        setMeasured: (id, rect) =>
          set(
            (s) => {
              if (!(id in s.controls)) return s
              if (measuredEqual(s.measured[id], rect)) return s
              const measured = { ...s.measured, [id]: rect }
              return {
                measured,
                insets: recompute(s.insets, s.controls, measured),
              }
            },
            undefined,
            "setMeasured"
          ),

        setSafeArea: (safeArea) =>
          set(
            (s) => (insetsEqual(s.safeArea, safeArea) ? s : { safeArea }),
            undefined,
            "setSafeArea"
          ),
      }),
      { name: "OverlayStore", enabled: import.meta.env?.DEV ?? false }
    )
  )
