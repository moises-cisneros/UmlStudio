import { create, StoreApi, UseBoundStore } from "zustand"
import { devtools, subscribeWithSelector } from "zustand/middleware"
import { parseDiagramType } from "@/utils"
import * as Y from "yjs"
import { getDiagramMetadata, STORE_ORIGIN } from "@/sync/ydoc"
import { UMLDiagramType } from "@/types"
import { UmlStudioMode, UmlStudioView } from "@/typings"
import { IPoint } from "@/edges/Connection"
import { mergeLabels, type ResolvedUmlStudioLabels } from "@/i18n/labels"
import type { Edge } from "@xyflow/react"
import { DISABLED_TAG_CONFIG, type TagConfig } from "@/utils/tagUtils"

export type LiveEdgeOverride = {
  edgeId: string
  points: IPoint[]
  edge?: Edge
  strategy?: "authoritative" | "predicted"
}

export type MetadataStore = {
  diagramTitle: string
  diagramType: UMLDiagramType
  mode: UmlStudioMode
  view: UmlStudioView
  availableViews: UmlStudioView[]
  readonly: boolean
  debug: boolean
  scrollLock: boolean
  multiSelectionMode: boolean
  keyboardShortcuts: boolean
  labels: ResolvedUmlStudioLabels
  tagConfig: TagConfig
  scrollEnabled: boolean
  connectionGuidanceActive: boolean
  connectionGuidanceSourceNodeId: string | null
  connectionGuidanceSourceHandleId: string | null
  liveEdgeOverride: LiveEdgeOverride | null
  pendingConnectionEdge: Edge | null
  pendingConnectionId: string | null
  setMode: (mode: UmlStudioMode) => void
  setView: (view: UmlStudioView) => void
  setAvailableViews: (availableViews: UmlStudioView[]) => void
  setPendingConnectionEdge: (edge: Edge | null) => void
  setPendingConnectionId: (id: string | null) => void
  setReadonly: (readonly: boolean) => void
  setScrollLock: (scrollLock: boolean) => void
  setMultiSelectionMode: (multiSelectionMode: boolean) => void
  setKeyboardShortcuts: (keyboardShortcuts: boolean) => void
  setLabels: (labels: ResolvedUmlStudioLabels) => void
  setTagConfig: (tagConfig: TagConfig) => void
  setScrollEnabled: (scrollEnabled: boolean) => void
  startConnectionGuidance: (
    sourceNodeId: string | null,
    sourceHandleId: string | null
  ) => void
  stopConnectionGuidance: () => void
  setLiveEdgeOverride: (override: LiveEdgeOverride | null) => void
  updateDiagramTitle: (diagramTitle: string) => void
  updateDiagramType: (diagramType: UMLDiagramType) => void
  updateMetaData: (diagramTitle: string, diagramType: UMLDiagramType) => void
  updateMetaDataFromYjs: () => void
  reset: () => void
  setDebug: (debug: boolean) => void
}

type InitialMetadataState = {
  diagramTitle: string
  diagramType: UMLDiagramType
  mode: UmlStudioMode
  view: UmlStudioView
  availableViews: UmlStudioView[]
  readonly: boolean
  debug: boolean
  scrollLock: boolean
  multiSelectionMode: boolean
  keyboardShortcuts: boolean
  labels: ResolvedUmlStudioLabels
  tagConfig: TagConfig
  scrollEnabled: boolean
  connectionGuidanceActive: boolean
  connectionGuidanceSourceNodeId: string | null
  connectionGuidanceSourceHandleId: string | null
  liveEdgeOverride: LiveEdgeOverride | null
  pendingConnectionEdge: Edge | null
  pendingConnectionId: string | null
}
const initialMetadataState: InitialMetadataState = {
  diagramTitle: "",
  diagramType: UMLDiagramType.ClassDiagram,
  mode: UmlStudioMode.Modelling,
  view: UmlStudioView.Modelling,
  availableViews: [UmlStudioView.Modelling],
  readonly: false,
  debug: false,
  scrollLock: false,
  multiSelectionMode: false,
  keyboardShortcuts: true,
  labels: mergeLabels(),
  tagConfig: DISABLED_TAG_CONFIG,
  scrollEnabled: false,
  connectionGuidanceActive: false,
  connectionGuidanceSourceNodeId: null,
  connectionGuidanceSourceHandleId: null,
  liveEdgeOverride: null,
  pendingConnectionEdge: null,
  pendingConnectionId: null,
}

export const createMetadataStore = (
  ydoc: Y.Doc,
  isPreviewMode: () => boolean = () => false
): UseBoundStore<StoreApi<MetadataStore>> => {
  const transactStore = (fn: () => void) => {
    if (isPreviewMode()) return
    ydoc.transact(fn, STORE_ORIGIN)
  }
  return create<MetadataStore>()(
    devtools(
      subscribeWithSelector((set) => ({
        ...initialMetadataState,

        updateDiagramTitle: (diagramTitle) => {
          transactStore(() => {
            getDiagramMetadata(ydoc).set("diagramTitle", diagramTitle)
          })
          set({ diagramTitle }, undefined, "updateDiagramTitle")
        },

        updateDiagramType: (type) => {
          transactStore(() => {
            getDiagramMetadata(ydoc).set("diagramType", type)
          })
          set({ diagramType: type }, undefined, "updateDiagramType")
        },

        updateMetaData: (diagramTitle, diagramType) => {
          transactStore(() => {
            getDiagramMetadata(ydoc).set("diagramTitle", diagramTitle)
            getDiagramMetadata(ydoc).set("diagramType", diagramType)
          })
          set(
            {
              diagramTitle,
              diagramType,
            },
            undefined,
            "updateMetaData"
          )
        },

        updateMetaDataFromYjs: () =>
          set(
            {
              diagramTitle: getDiagramMetadata(ydoc).get("diagramTitle") || "",
              diagramType: parseDiagramType(
                getDiagramMetadata(ydoc).get("diagramType")
              ),
            },
            undefined,
            "updateMetaDataFromYjs"
          ),

        setMode: (mode) => {
          set({ mode }, undefined, "setMode")
        },

        setView: (view) => {
          set({ view }, undefined, "setView")
        },

        setAvailableViews: (availableViews) => {
          set({ availableViews }, undefined, "setAvailableViews")
        },

        setReadonly: (readonly) => {
          set({ readonly }, undefined, "setReadonly")
        },

        setScrollLock: (scrollLock: boolean) => {
          set({ scrollLock }, undefined, "setScrollLock")
        },

        setMultiSelectionMode: (multiSelectionMode: boolean) => {
          set({ multiSelectionMode }, undefined, "setMultiSelectionMode")
        },
        setKeyboardShortcuts: (keyboardShortcuts: boolean) => {
          set({ keyboardShortcuts }, undefined, "setKeyboardShortcuts")
        },

        setLabels: (labels) => {
          set(
            (s) => {
              const next = labels as unknown as Record<string, unknown>
              const cur = s.labels as unknown as Record<string, unknown>
              for (const key in next) {
                if (next[key] !== cur[key]) return { labels }
              }
              return s
            },
            undefined,
            "setLabels"
          )
        },

        setTagConfig: (tagConfig) => {
          set(
            (s) => {
              const cur = s.tagConfig
              const same =
                cur.enabled === tagConfig.enabled &&
                cur.allowCreate === tagConfig.allowCreate &&
                cur.available.length === tagConfig.available.length &&
                cur.available.every((v, i) => v === tagConfig.available[i])
              return same ? s : { tagConfig }
            },
            undefined,
            "setTagConfig"
          )
        },

        setScrollEnabled: (scrollEnabled: boolean) => {
          set({ scrollEnabled }, undefined, "setScrollEnabled")
        },

        startConnectionGuidance: (sourceNodeId, sourceHandleId) => {
          set(
            {
              connectionGuidanceActive: true,
              connectionGuidanceSourceNodeId: sourceNodeId,
              connectionGuidanceSourceHandleId: sourceHandleId,
            },
            undefined,
            "startConnectionGuidance"
          )
        },

        stopConnectionGuidance: () => {
          set(
            {
              connectionGuidanceActive: false,
              connectionGuidanceSourceNodeId: null,
              connectionGuidanceSourceHandleId: null,
            },
            undefined,
            "stopConnectionGuidance"
          )
        },

        setLiveEdgeOverride: (override) => {
          set({ liveEdgeOverride: override }, undefined, "setLiveEdgeOverride")
        },

        setPendingConnectionEdge: (edge) => {
          set(
            { pendingConnectionEdge: edge },
            undefined,
            "setPendingConnectionEdge"
          )
        },

        setPendingConnectionId: (id) => {
          set({ pendingConnectionId: id }, undefined, "setPendingConnectionId")
        },

        setDebug: (debug) => {
          set({ debug }, undefined, "setDebug")
        },

        reset: () => {
          set(initialMetadataState, undefined, "reset")
        },
      })),
      { name: "MetadataStore", enabled: true }
    )
  )
}
