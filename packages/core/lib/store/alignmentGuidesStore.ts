import { create, StoreApi, UseBoundStore } from "zustand"
import { devtools, subscribeWithSelector } from "zustand/middleware"

export type AlignmentGuide = {
  id: string
  type: "vertical" | "horizontal"
  position: number
  offset?: number
}

type InitialAlignmentGuidesState = {
  guides: AlignmentGuide[]
}

const initialAlignmentGuidesState: InitialAlignmentGuidesState = {
  guides: [],
}

export type AlignmentGuidesStore = {
  guides: AlignmentGuide[]
  setGuides: (guides: AlignmentGuide[]) => void
  clearGuides: () => void
}

export const createAlignmentGuidesStore = (): UseBoundStore<StoreApi<AlignmentGuidesStore>> =>
  create<AlignmentGuidesStore>()(
    devtools(
      subscribeWithSelector((set) => ({
        ...initialAlignmentGuidesState,

        setGuides: (guides: AlignmentGuide[]) => {
          set((state) => {
            if (state.guides.length === 0 && guides.length === 0) return state
            return { guides }
          })
        },

        clearGuides: () => {
          set((state) => {
            if (state.guides.length === 0) return state
            return { guides: [] }
          })
        },
      })),
      {
        name: "AlignmentGuidesStore",
      }
    )
  )
