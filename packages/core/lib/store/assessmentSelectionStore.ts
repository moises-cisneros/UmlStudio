import { create, StoreApi, UseBoundStore } from "zustand"
import { devtools, subscribeWithSelector } from "zustand/middleware"

export type AssessmentSelectionStore = {
  selectedElementIds: string[]
  highlightedElementId: string | null
  isAssessmentSelectionMode: boolean
  highlightedElements: Record<string, string>

  setAssessmentSelectionMode: (isActive: boolean) => void
  selectElement: (elementId: string) => void
  selectMultipleElements: (elementIds: string[]) => void
  clearSelection: () => void
  setHighlightedElement: (elementId: string | null) => void
  setElementHighlights: (highlights: Record<string, string>) => void
  isElementSelected: (elementId: string) => boolean
  isElementHighlighted: (elementId: string) => boolean
  reset: () => void
}

type InitialAssessmentSelectionState = {
  selectedElementIds: string[]
  highlightedElementId: string | null
  isAssessmentSelectionMode: boolean
  highlightedElements: Record<string, string>
}

const initialAssessmentSelectionState: InitialAssessmentSelectionState = {
  selectedElementIds: [],
  highlightedElementId: null,
  isAssessmentSelectionMode: false,
  highlightedElements: {},
}

export const createAssessmentSelectionStore = (): UseBoundStore<
  StoreApi<AssessmentSelectionStore>
> =>
  create<AssessmentSelectionStore>()(
    devtools(
      subscribeWithSelector((set, get) => ({
        ...initialAssessmentSelectionState,

        setAssessmentSelectionMode: (isActive: boolean) => {
          set(
            { isAssessmentSelectionMode: isActive },
            undefined,
            "setAssessmentSelectionMode"
          )
          if (!isActive) {
            set(
              { selectedElementIds: [], highlightedElementId: null },
              undefined,
              "clearSelectionOnDisable"
            )
          }
        },

        selectElement: (elementId: string) => {
          set({ selectedElementIds: [elementId] }, undefined, "selectElement")
        },

        selectMultipleElements: (elementIds: string[]) => {
          set(
            { selectedElementIds: elementIds },
            undefined,
            "selectMultipleElements"
          )
        },

        clearSelection: () => {
          set({ selectedElementIds: [] }, undefined, "clearSelection")
        },

        setHighlightedElement: (elementId: string | null) => {
          set(
            { highlightedElementId: elementId },
            undefined,
            "setHighlightedElement"
          )
        },

        setElementHighlights: (highlights: Record<string, string>) => {
          set(
            { highlightedElements: highlights },
            undefined,
            "setElementHighlights"
          )
        },

        isElementSelected: (elementId: string) => {
          return get().selectedElementIds.includes(elementId)
        },

        isElementHighlighted: (elementId: string) => {
          return get().highlightedElementId === elementId
        },

        reset: () => {
          set(initialAssessmentSelectionState, undefined, "reset")
        },
      })),
      { name: "AssessmentSelectionStore", enabled: true }
    )
  )
