import { useTranslation } from "@/i18n";
import { useMemo } from "react";

export const MAX_DESCRIPTION_LENGTH = 240;

export const MAX_NAME_LENGTH = 80;

export const versioningStringsEn = {
  drawerTitle: "Version history",
  navMenuItem: "Version history",
  fabTooltip: `Version history (${/mac/i.test(navigator.userAgent) ? "⌥⇧H" : "Alt+Shift+H"})`,
  loadOlder: "Load older versions",
  previewFailed: "Failed to load preview.",
  previewUnavailable: "This version is no longer available.",
  restoreFailed: "Restore failed.",
  emptyBody:
    "Save a version before risky changes. You can always come back to this exact state.",
  emptyBodyLocal:
    "No versions yet. Save one before risky changes — they're stored on this device.",
  emptyCtaLocal: "Save first version",
  composerHint: /mac/i.test(navigator.userAgent)
    ? "⌘+Enter to save"
    : "Ctrl+Enter to save",
  emptyDiagramTooltip: "Add a node before saving a version.",
  createPlaceholder: "Describe this version (optional)",
  createButton: "Save version",
  saving: "Saving…",
  lastVersion: (ago: string) => `Last saved ${ago}`,
  noVersionYet: "No version saved yet",
  copyLink: "Copy link to this version",
  noDescription: "No description",
  autoSaved: "Checkpoint",
  editDescription: "Edit description",
  addDescription: "Add description",
  copied: "Link copied. Anyone with access can open this version.",
  copyFailed: "Failed to copy link.",
  delete: "Delete",
  cancel: "Cancel",
  deleteFailed: "Failed to delete version.",
  deleteFallbackBody: "This version will be permanently removed.",
  exitPreview: "Exit preview",
  restoreThis: "Restore this version",
  restoredSnack: (name: string) =>
    `Restored '${name}'. Your previous canvas was saved.`,
  undoRestore: "Undo restore",
  collaboratorRestoredTitle: (actor: string) =>
    `${actor} restored an earlier version. Your view was updated.`,
  noChangesToSave: "No changes to save since the last version.",
  failureToCreate: "Couldn't save version. Try again.",
  failureToEdit: "Couldn't update description. Try again.",
  failureRedis:
    "Version history is temporarily unavailable. Your edits are still being saved.",
  failureToLoad: "Couldn't load version history. Reopen the panel to retry.",
  failureSchemaUnsupported:
    "This snapshot was created by an older version of the editor and can't be restored automatically.",
  unnamed: "Untitled snapshot",
  confirmRestoreTitle: "Restore this version?",
  confirmRestoreBody: (label: string) =>
    `Restore ${label}? This replaces your current canvas. We'll save an auto-snapshot first so you can come back.`,
  confirmRestoreButton: "Restore",
  saveLocalCopyButton: "Save a local copy",
  saveLocalCopySuccess:
    "Saved as a local copy on this device. You can keep editing here.",
  saveLocalCopyFailed: "Couldn't save a local copy. Try again.",
  justNow: "just now",
  minutesAgo: (n: number) => `${n}m ago`,
  hoursAgo: (n: number) => `${n}h ago`,
  daysAgo: (n: number) => `${n}d ago`,
  liveCanvas: "Live canvas",
  previewModeActive: "Preview mode active",
  previewReadonlyNotice:
    "Exploring a historical checkpoint. The canvas is in read-only mode.",
  returnToCurrent: "Return to current",
  noVersionsYet: "No checkpoints yet",
  noVersionsYetDesc: "No checkpoints have been created for this diagram yet.",
  upToDateTitle: "Up to date",
  upToDateSubtitle: (ago: string) => `Synced with last saved version ${ago}.`,
  unsavedChangesTitle: "Unsaved edits",
  unsavedChangesSubtitle: (ago: string) =>
    `Canvas edits since last save ${ago}.`,
  autoGroupTitle: (count: number) => `${count} automatic versions`,
  previewButton: "Preview",
  previewingButton: "Active",
  restoreButton: "Restore",
  closePanel: "Close panel (Esc)",
  hideAutosaves: "Hide auto-saves",
  showAutosaves: "Show auto-saves",
  ctrlEnterHint: "Ctrl+Enter to save",
  newCheckpointStereotype: "«new-checkpoint»",
  liveCanvasStereotype: "«live-canvas»",
  previewStereotype: "«preview-mode»",
  checkpointStereotype: "«checkpoint»",
  autoGroupStereotype: "«auto-group»",
};

export const versioningStrings = versioningStringsEn;

const versioningStringsEs: typeof versioningStringsEn = {
  drawerTitle: "Historial de versiones",
  navMenuItem: "Historial de versiones",
  fabTooltip: `Historial de versiones (${/mac/i.test(navigator.userAgent) ? "⌥⇧H" : "Alt+Shift+H"})`,
  loadOlder: "Cargar versiones anteriores",
  previewFailed: "No se pudo cargar la vista previa.",
  previewUnavailable: "Esta versión ya no está disponible.",
  restoreFailed: "Error al restaurar.",
  emptyBody:
    "Guarda una versión antes de realizar cambios arriesgados. Siempre puedes volver a este estado exacto.",
  emptyBodyLocal:
    "Aún no hay versiones. Guarda una antes de cambios arriesgados — se guardan en este dispositivo.",
  emptyCtaLocal: "Guardar primera versión",
  composerHint: /mac/i.test(navigator.userAgent)
    ? "⌘+Enter para guardar"
    : "Ctrl+Enter para guardar",
  emptyDiagramTooltip: "Añade un nodo antes de guardar una versión.",
  createPlaceholder: "Describe esta versión (opcional)",
  createButton: "Guardar versión",
  saving: "Guardando…",
  lastVersion: (ago: string) => `Último guardado hace ${ago}`,
  noVersionYet: "Aún no se ha guardado ninguna versión",
  copyLink: "Copiar enlace a esta versión",
  noDescription: "Sin descripción",
  autoSaved: "Punto de control",
  editDescription: "Editar descripción",
  addDescription: "Añadir descripción",
  copied: "Enlace copiado. Cualquiera con acceso puede abrir esta versión.",
  copyFailed: "Error al copiar el enlace.",
  delete: "Eliminar",
  cancel: "Cancelar",
  deleteFailed: "Error al eliminar la versión.",
  deleteFallbackBody: "Esta versión se eliminará permanentemente.",
  exitPreview: "Salir de la vista previa",
  restoreThis: "Restaurar esta versión",
  restoredSnack: (name: string) =>
    `Se restauró '${name}'. Tu lienzo anterior ha sido guardado.`,
  undoRestore: "Deshacer restauración",
  collaboratorRestoredTitle: (actor: string) =>
    `${actor} restauró una versión anterior. Tu vista ha sido actualizada.`,
  noChangesToSave: "No hay cambios para guardar desde la última versión.",
  failureToCreate: "No se pudo guardar la versión. Inténtalo de nuevo.",
  failureToEdit: "No se pudo actualizar la descripción. Inténtalo de nuevo.",
  failureRedis:
    "El historial de versiones no está disponible temporalmente. Tus cambios se siguen guardando.",
  failureToLoad:
    "No se pudo cargar el historial de versiones. Vuelve a abrir el panel.",
  failureSchemaUnsupported:
    "Esta instantánea fue creada por una versión antigua del editor y no se puede restaurar automáticamente.",
  unnamed: "Instantánea sin título",
  confirmRestoreTitle: "¿Restaurar esta versión?",
  confirmRestoreBody: (label: string) =>
    `¿Restaurar ${label}? Esto reemplazará tu lienzo actual. Guardaremos una instantánea automática antes para que puedas volver.`,
  confirmRestoreButton: "Restaurar",
  saveLocalCopyButton: "Guardar una copia",
  saveLocalCopySuccess:
    "Guardado como copia local en este dispositivo. Puedes seguir editando aquí.",
  saveLocalCopyFailed:
    "No se pudo guardar una copia. Inténtalo de nuevo.",
  justNow: "justo ahora",
  minutesAgo: (n: number) => `hace ${n}m`,
  hoursAgo: (n: number) => `hace ${n}h`,
  daysAgo: (n: number) => `hace ${n}d`,
  liveCanvas: "Lienzo en vivo",
  previewModeActive: "Modo vista previa activo",
  previewReadonlyNotice:
    "Explorando un punto de control histórico. El lienzo está en modo solo lectura.",
  returnToCurrent: "Volver al actual",
  noVersionsYet: "Sin puntos de control",
  noVersionsYetDesc:
    "Aún no se ha creado ningún punto de control para este diagrama.",
  upToDateTitle: "Al día",
  upToDateSubtitle: (ago: string) =>
    `Sincronizado con la última versión guardada (${ago}).`,
  unsavedChangesTitle: "Cambios pendientes",
  unsavedChangesSubtitle: (ago: string) =>
    `Ediciones realizadas desde el último guardado (${ago}).`,
  autoGroupTitle: (count: number) => `${count} versiones automáticas`,
  previewButton: "Vista previa",
  previewingButton: "Activa",
  restoreButton: "Restaurar",
  closePanel: "Cerrar panel (Esc)",
  hideAutosaves: "Ocultar autoguardados",
  showAutosaves: "Mostrar autoguardados",
  ctrlEnterHint: "Ctrl+Enter para guardar",
  newCheckpointStereotype: "«nuevo-punto-de-control»",
  liveCanvasStereotype: "«lienzo-en-vivo»",
  previewStereotype: "«modo-previa»",
  checkpointStereotype: "«punto-control»",
  autoGroupStereotype: "«grupo-auto»",
};

export function useVersioningTranslation() {
  const { locale } = useTranslation();
  return useMemo(() => {
    return locale === "es" ? versioningStringsEs : versioningStringsEn;
  }, [locale]);
}
