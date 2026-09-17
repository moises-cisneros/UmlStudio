import { useEffect } from "react";
import {
  isInsideOverlay,
  isTypingTarget,
  matchesShortcutCombo,
  type UmlStudioShortcutCombo,
} from "@umlstudio/core";
import { useVersionStore } from "@/stores/useVersionStore";

export type EditorShortcutId = "save-version" | "toggle-version-history";

interface EditorShortcut {
  id: EditorShortcutId;
  combo: UmlStudioShortcutCombo;
  anywhere?: true;
}

export const EDITOR_SHORTCUTS: readonly EditorShortcut[] = [
  { id: "save-version", combo: { key: "s", mod: true }, anywhere: true },
  {
    id: "toggle-version-history",
    combo: { code: "KeyH", alt: true, shift: true },
  },
];

export const createEditorShortcutHandler =
  (actions: Record<EditorShortcutId, () => void>) => (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return;
    for (const shortcut of EDITOR_SHORTCUTS) {
      if (!matchesShortcutCombo(event, shortcut.combo)) continue;
      if (
        !shortcut.anywhere &&
        (isTypingTarget(event) || isInsideOverlay(event))
      )
        return;
      event.preventDefault();
      if (event.repeat) return;
      actions[shortcut.id]();
      return;
    }
  };

export function useEditorShortcuts(diagramId: string | undefined) {
  const openDrawer = useVersionStore((s) => s.openDrawer);
  const closeDrawer = useVersionStore((s) => s.closeDrawer);
  const requestSave = useVersionStore((s) => s.requestSave);

  useEffect(() => {
    if (!diagramId) return;
    const onKeyDown = createEditorShortcutHandler({
      "save-version": () => requestSave(diagramId),
      "toggle-version-history": () => {
        const open = useVersionStore.getState().drawerOpenByDiagram[diagramId];
        if (open) closeDrawer(diagramId);
        else openDrawer(diagramId);
      },
    });
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [diagramId, openDrawer, closeDrawer, requestSave]);
}
