export * from "./typings"
export { UmlStudioEditor } from "./umlstudio-editor"
export type {
  OverlayRegion,
  OverlaySide,
  InsetContribution,
  OverlayControlOptions,
  OverlayControlInput,
  OverlayControlSnapshot,
} from "./overlay/types"
export {
  paletteControl,
  zoomControl,
  miniMapControl,
  defaultControls,
  PALETTE_ID,
  ZOOM_ID,
  MINIMAP_ID,
  type PaletteControlOptions,
  type ZoomControlOptions,
  type MiniMapControlOptions,
} from "./chrome/builtins/controls"
export {
  getAssessmentNameForArtemis,
  getEdgeAssessmentDataById,
  getNodeAssessmentDataByNodeElementId,
  type AssessmentViewData,
} from "./utils/helpers"
export { importDiagram } from "./utils/versionConverter"
export { importXmiDiagram, type XmiImportOptions, type XmiImportResult } from "./import/xmiImport"
export { collabColorFromName, randomCollabName } from "./utils/collaboration"
export { FONT_FAMILY } from "./fontStack"
export { log, setLogLevel, setLogger } from "./logger"
export type { LogLevel } from "./logger"
export {
  DEFAULT_LABELS,
  SPANISH_LABELS,
  type UmlStudioLabels,
  type ResolvedUmlStudioLabels,
} from "./i18n/labels"
export { useLabels } from "./i18n/useLabels"
export {
  UMLSTUDIO_SHORTCUTS,
  matchesShortcutCombo,
  shortcutKeyName,
  isTypingTarget,
  isInsideOverlay,
  type UmlStudioShortcut,
  type UmlStudioShortcutCombo,
  type UmlStudioShortcutId,
} from "./keyboard"
export { createUmlStudioTheme, type UmlStudioTheme } from "@umlstudio/ui/theme"

export {
  UmlStudio,
  UmlStudioDefaultControls,
  type UmlStudioProps,
} from "./components/react/UmlStudio"
export {
  UmlStudioProvider,
  useUmlStudioEditor,
  useUmlStudioEditorOrThrow,
} from "./components/react/context"
export { useUmlStudioSubscription } from "./components/react/useUmlStudioSubscription"
export { UmlStudioControl, type UmlStudioControlProps } from "./components/react/UmlStudioControl"
export {
  useControl,
  UmlStudioPalette,
  UmlStudioZoom,
  UmlStudioMiniMap,
} from "./components/react/builtins"
export {
  UmlStudioSelectionToolbar,
  type UmlStudioSelectionToolbarProps,
} from "./components/react/UmlStudioSelectionToolbar"

export { validateDiff, applyDiff, findTargetNode, findTargetEdge } from "./ai/diffEngine"
export { MockAIAdapter } from "./ai/adapters/mockAdapter"
export type {
  AIAdapter,
  ModelDiff,
  ModelDiffValidationResult,
  DiffElementAdd,
  DiffElementModify,
  DiffRelationshipAdd,
  DiffRelationshipModify,
  DiffAttribute,
  DiffMethod,
} from "./ai/types"
