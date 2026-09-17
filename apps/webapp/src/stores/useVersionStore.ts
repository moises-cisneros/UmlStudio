import { create } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import type { UMLModel } from "@umlstudio/core";

type DiagramId = string;
type VersionId = string;

interface PreviewState {
  diagramId: DiagramId;
  versionId: VersionId;
  body: UMLModel;
}

interface UndoRestoreState {
  diagramId: DiagramId;
  autoSnapshotVersionId: VersionId;
  restoredFromVersionId: VersionId;
  restoredVersionName: string;
  expiresAt: number;
}

interface State {
  drawerOpenByDiagram: Record<DiagramId, boolean>;
  saveRequestByDiagram: Record<DiagramId, number>;
  preview: PreviewState | null;
  undoRestore: UndoRestoreState | null;
  pendingRestoreFromId: VersionId | null;
}

interface Actions {
  openDrawer: (diagramId: DiagramId) => void;
  closeDrawer: (diagramId: DiagramId) => void;
  requestSave: (diagramId: DiagramId) => void;
  clearSaveRequest: (diagramId: DiagramId) => void;

  enterPreview: (
    diagramId: DiagramId,
    versionId: VersionId,
    body: UMLModel,
  ) => void;
  exitPreview: () => void;

  beginRestore: (versionId: VersionId) => void;
  completeRestore: (undo: Omit<UndoRestoreState, "expiresAt">) => void;
  cancelRestore: () => void;
  dismissUndoRestore: () => void;
}

export type VersionStore = State & Actions;

export const UNDO_WINDOW_MS = 10_000;

export function selectScopedPreview(
  state: State,
  diagramId: string,
): PreviewState | null {
  return state.preview?.diagramId === diagramId ? state.preview : null;
}

export const useVersionStore = create<VersionStore>()(
  devtools(
    persist(
      (set) => ({
        drawerOpenByDiagram: {},
        saveRequestByDiagram: {},
        preview: null,
        undoRestore: null,
        pendingRestoreFromId: null,

        openDrawer: (diagramId) =>
          set((s) => ({
            drawerOpenByDiagram: {
              ...s.drawerOpenByDiagram,
              [diagramId]: true,
            },
          })),
        closeDrawer: (diagramId) =>
          set((s) => ({
            drawerOpenByDiagram: {
              ...s.drawerOpenByDiagram,
              [diagramId]: false,
            },
          })),
        requestSave: (diagramId) =>
          set((s) => ({
            drawerOpenByDiagram: {
              ...s.drawerOpenByDiagram,
              [diagramId]: true,
            },
            saveRequestByDiagram: {
              ...s.saveRequestByDiagram,
              [diagramId]: (s.saveRequestByDiagram[diagramId] ?? 0) + 1,
            },
          })),
        clearSaveRequest: (diagramId) =>
          set((s) => ({
            saveRequestByDiagram: {
              ...s.saveRequestByDiagram,
              [diagramId]: 0,
            },
          })),

        enterPreview: (diagramId, versionId, body) =>
          set({ preview: { diagramId, versionId, body } }),
        exitPreview: () => set({ preview: null }),

        beginRestore: (versionId) => set({ pendingRestoreFromId: versionId }),
        completeRestore: (undo) =>
          set({
            preview: null,
            pendingRestoreFromId: null,
            undoRestore: { ...undo, expiresAt: Date.now() + UNDO_WINDOW_MS },
          }),
        cancelRestore: () => set({ pendingRestoreFromId: null }),
        dismissUndoRestore: () => set({ undoRestore: null }),
      }),
      {
        name: "umlstudio-version-store",
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          drawerOpenByDiagram: state.drawerOpenByDiagram,
        }),
      },
    ),
    { name: "umlstudio-version-store" },
  ),
);
