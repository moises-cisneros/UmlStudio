import { create, StoreApi, UseBoundStore } from "zustand"
import { devtools, subscribeWithSelector } from "zustand/middleware"
import { IPoint } from "@/edges/Connection"
import type { EdgeGeometryNodeSnapshot } from "@/utils/geometry/edgeGeometryPreview"

export type EdgeGeometryStore = {
  geometryById: Record<string, IPoint[]>
  previewById: Record<string, IPoint[]>
  settledNodeGeometry: EdgeGeometryNodeSnapshot
  isSolving: boolean
  acceptedGeneration: number
  routingEpoch: number
  routingReady: boolean
  setAllGeometry: (
    routeById: Record<string, IPoint[]>,
    routingEpoch: number,
    nodeGeometry?: EdgeGeometryNodeSnapshot,
    settlementPreview?: Record<string, IPoint[]>
  ) => boolean
  beginRoutingBootstrap: () => void
  setPreviewGeometry: (routeById: Record<string, IPoint[]>) => void
  clearPreviewGeometry: () => void
  setSolving: (solving: boolean) => void
  waitForSettled: (afterGeneration?: number) => Promise<void>
}

const samePoints = (a: IPoint[], b: IPoint[]): boolean =>
  a === b ||
  (a.length === b.length &&
    a.every((point, index) => point.x === b[index].x && point.y === b[index].y))

const sameNodeGeometry = (
  a: EdgeGeometryNodeSnapshot,
  b: EdgeGeometryNodeSnapshot
): boolean => {
  if (a === b) return true
  if (a.size !== b.size) return false
  for (const [id, rect] of a) {
    const other = b.get(id)
    if (
      !other ||
      rect.x !== other.x ||
      rect.y !== other.y ||
      rect.width !== other.width ||
      rect.height !== other.height ||
      rect.type !== other.type ||
      rect.parentId !== other.parentId
    )
      return false
  }
  return true
}

export const createEdgeGeometryStore = (): UseBoundStore<
  StoreApi<EdgeGeometryStore>
> => {
  const settledWaiters = new Set<{
    afterGeneration: number | undefined
    resolve: () => void
  }>()
  return create<EdgeGeometryStore>()(
    devtools(
      subscribeWithSelector((set, get) => {
        const resolveReadyWaiters = () => {
          const state = get()
          if (state.isSolving) return
          for (const waiter of settledWaiters) {
            if (
              waiter.afterGeneration !== undefined &&
              state.acceptedGeneration <= waiter.afterGeneration
            )
              continue
            settledWaiters.delete(waiter)
            waiter.resolve()
          }
        }

        return {
          geometryById: {},
          previewById: {},
          settledNodeGeometry: new Map(),
          isSolving: false,
          acceptedGeneration: 0,
          routingEpoch: 0,
          routingReady: false,

          setAllGeometry: (
            routeById,
            routingEpoch,
            nodeGeometry,
            settlementPreview
          ) => {
            const state = get()
            if (routingEpoch !== state.routingEpoch) return false
            const previous = state.geometryById
            const prevIds = Object.keys(previous)
            const nextIds = Object.keys(routeById)
            let geometryChanged = prevIds.length !== nextIds.length
            const next: Record<string, IPoint[]> = {}
            for (const id of nextIds) {
              const prior = previous[id]
              const preview = state.previewById[id]
              if (prior && samePoints(prior, routeById[id])) {
                next[id] = prior
              } else if (preview && samePoints(preview, routeById[id])) {
                next[id] = preview
                geometryChanged = true
              } else {
                next[id] = routeById[id]
                geometryChanged = true
              }
            }
            const nextPreview: Record<string, IPoint[]> = {}
            for (const [id, candidate] of Object.entries(
              settlementPreview ?? {}
            )) {
              if (!routeById[id]) continue
              const prior = state.previewById[id]
              nextPreview[id] =
                prior && samePoints(prior, candidate) ? prior : candidate
            }
            const previousPreviewIds = Object.keys(state.previewById)
            const nextPreviewIds = Object.keys(nextPreview)
            const previewChanged =
              previousPreviewIds.length !== nextPreviewIds.length ||
              nextPreviewIds.some(
                (id) => state.previewById[id] !== nextPreview[id]
              )
            const nodeGeometryChanged =
              nodeGeometry !== undefined &&
              !sameNodeGeometry(state.settledNodeGeometry, nodeGeometry)
            set(
              {
                geometryById: geometryChanged ? next : previous,
                previewById: previewChanged ? nextPreview : state.previewById,
                settledNodeGeometry: nodeGeometryChanged
                  ? nodeGeometry
                  : state.settledNodeGeometry,
                acceptedGeneration: state.acceptedGeneration + 1,
                routingReady: true,
              },
              undefined,
              "setAllGeometry"
            )
            resolveReadyWaiters()
            return true
          },

          beginRoutingBootstrap: () => {
            const state = get()
            set(
              {
                geometryById: {},
                previewById: {},
                settledNodeGeometry: new Map(),
                isSolving: true,
                routingEpoch: state.routingEpoch + 1,
                routingReady: false,
              },
              undefined,
              "beginRoutingBootstrap"
            )
          },

          setPreviewGeometry: (routeById) => {
            const state = get()
            const previous = state.previewById
            const nextIds = Object.keys(routeById)
            const previousIds = Object.keys(previous)
            let changed = nextIds.length !== previousIds.length
            const next: Record<string, IPoint[]> = {}
            for (const id of nextIds) {
              const candidate = routeById[id]
              const exact = state.geometryById[id]
              const prior = previous[id]
              if (exact && samePoints(exact, candidate)) {
                next[id] = exact
              } else if (prior && samePoints(prior, candidate)) {
                next[id] = prior
              } else {
                next[id] = candidate
              }
              if (next[id] !== prior) changed = true
            }
            if (!changed) return
            set({ previewById: next }, undefined, "setPreviewGeometry")
          },

          clearPreviewGeometry: () => {
            if (Object.keys(get().previewById).length === 0) return
            set({ previewById: {} }, undefined, "clearPreviewGeometry")
          },

          setSolving: (solving) => {
            if (get().isSolving === solving) return
            set({ isSolving: solving }, undefined, "setSolving")
            if (!solving) resolveReadyWaiters()
          },

          waitForSettled: (afterGeneration) => {
            const state = get()
            if (
              !state.isSolving &&
              (afterGeneration === undefined ||
                state.acceptedGeneration > afterGeneration)
            )
              return Promise.resolve()
            return new Promise<void>((resolve) =>
              settledWaiters.add({ afterGeneration, resolve })
            )
          },
        }
      }),
      { name: "EdgeGeometryStore" }
    )
  )
}
