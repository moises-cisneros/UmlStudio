import { create } from "zustand"

export type WorkbenchDockTab = "agent" | "inspector"

interface WorkbenchState {
  isAgentDockOpen: boolean
  activeDockTab: WorkbenchDockTab
  isCommandPaletteOpen: boolean
  selectedElementId: string | null

  toggleAgentDock: () => void
  setAgentDockOpen: (open: boolean) => void
  setActiveDockTab: (tab: WorkbenchDockTab) => void
  toggleCommandPalette: () => void
  setCommandPaletteOpen: (open: boolean) => void
  setSelectedElementId: (id: string | null) => void
}

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  isAgentDockOpen: false,
  activeDockTab: "agent",
  isCommandPaletteOpen: false,
  selectedElementId: null,

  toggleAgentDock: () => set((state) => ({ isAgentDockOpen: !state.isAgentDockOpen })),
  setAgentDockOpen: (open) => set({ isAgentDockOpen: open }),
  setActiveDockTab: (tab) => set({ activeDockTab: tab, isAgentDockOpen: true }),
  toggleCommandPalette: () =>
    set((state) => ({ isCommandPaletteOpen: !state.isCommandPaletteOpen })),
  setCommandPaletteOpen: (open) => set({ isCommandPaletteOpen: open }),
  setSelectedElementId: (id) => set({ selectedElementId: id }),
}))
