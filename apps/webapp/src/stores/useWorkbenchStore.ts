import { create } from "zustand"

export type WorkbenchDockTab = "agent" | "inspector" | "room"

interface WorkbenchState {
  isAgentDockOpen: boolean
  activeDockTab: WorkbenchDockTab
  previousIndividualDockTab: WorkbenchDockTab | null
  isCommandPaletteOpen: boolean
  selectedElementId: string | null

  toggleAgentDock: () => void
  setAgentDockOpen: (open: boolean) => void
  setActiveDockTab: (tab: WorkbenchDockTab) => void
  setActiveDockTabWithoutOpening: (tab: WorkbenchDockTab) => void
  setPreviousIndividualDockTab: (tab: WorkbenchDockTab | null) => void
  toggleCommandPalette: () => void
  setCommandPaletteOpen: (open: boolean) => void
  setSelectedElementId: (id: string | null) => void
}

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  isAgentDockOpen: false,
  activeDockTab: "agent",
  previousIndividualDockTab: null,
  isCommandPaletteOpen: false,
  selectedElementId: null,

  toggleAgentDock: () => set((state) => ({ isAgentDockOpen: !state.isAgentDockOpen })),
  setAgentDockOpen: (open) => set({ isAgentDockOpen: open }),
  setActiveDockTab: (tab) => set({ activeDockTab: tab, isAgentDockOpen: true }),
  setActiveDockTabWithoutOpening: (tab) => set({ activeDockTab: tab }),
  setPreviousIndividualDockTab: (tab) => set({ previousIndividualDockTab: tab }),
  toggleCommandPalette: () =>
    set((state) => ({ isCommandPaletteOpen: !state.isCommandPaletteOpen })),
  setCommandPaletteOpen: (open) => set({ isCommandPaletteOpen: open }),
  setSelectedElementId: (id) => set({ selectedElementId: id }),
}))
