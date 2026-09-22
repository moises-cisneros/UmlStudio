import type { IPoint } from "./edges/types"
import type { DiagramEdgeType, DiagramNodeType } from "./modelElementTypes"
import { UMLDiagramType } from "./types/DiagramType"
import type { OverlayControlInput } from "./overlay/types"
import type { UmlStudioLabels } from "./i18n/labels"
export type { UmlStudioLabels } from "./i18n/labels"
import type { TagOptions } from "./utils/tagUtils"
export type { TagOptions, TagConfig } from "./utils/tagUtils"

export { UMLDiagramType, type DiagramNodeType, type DiagramEdgeType }

export type Unsubscriber = () => void

export type Subscribers = {
  [key: number]: Unsubscriber
}

export type UMLModelElementType = DiagramNodeType | DiagramEdgeType

export type CollaborationUser = {
  name: string
  color: string
  id?: string
  imageUrl?: string
}

export type CollaborationCursor = {
  x: number
  y: number
}

export type CollaborationViewport = {
  x: number
  y: number
  zoom: number
}

export type DraggingNode = {
  id: string
  position: { x: number; y: number }
  width?: number | null
  height?: number | null
}

export type CollaborationState = {
  user?: CollaborationUser
  cursor?: CollaborationCursor | null
  viewport?: CollaborationViewport | null
  followingClientId?: number | null
  selectedElementId?: string | null
  draggingNodes?: DraggingNode[] | null
}

export type CollaboratorInfo = {
  id: string
  name: string
  color: string
  imageUrl?: string
  clientIds: number[]
  isLocal: boolean
}

export type UmlStudioCollaborationOptions = {
  enabled?: boolean
  user?: CollaborationUser
  showPresence?: boolean
  showCursors?: boolean
  showSelectionHighlights?: boolean
  showFollow?: boolean
}

export enum Locale {
  en = "en",
  de = "de",
}

export enum UmlStudioMode {
  Modelling = "Modelling",
  Exporting = "Exporting",
  Assessment = "Assessment",
}

export type UmlStudioNode = {
  id: string
  width: number
  height: number
  type: DiagramNodeType
  position: {
    x: number
    y: number
  }
  data: {
    [key: string]: unknown
  }
  parentId?: string
  measured: { width: number; height: number }
}

export interface OrthogonalEdgeData {
  [key: string]: unknown
  points: IPoint[]
}

export type UmlStudioEdge = {
  id: string
  source: string
  target: string
  type: DiagramEdgeType
  sourceHandle: string
  targetHandle: string
  data: OrthogonalEdgeData
}

export type InteractiveElements = {
  elements: { [id: string]: boolean }
  relationships: { [id: string]: boolean }
}

export type UMLModel = {
  version: `4.${number}.${number}`
  id: string
  title: string
  type: UMLDiagramType
  nodes: UmlStudioNode[]
  edges: UmlStudioEdge[]
  assessments: { [id: string]: Assessment }
  interactive?: InteractiveElements
}

export enum UmlStudioView {
  Modelling = "Modelling",
  Exporting = "Exporting",
  Highlight = "Highlight",
}

export type SvgExportMode = "web" | "compat"

export type UmlStudioOptions = {
  type?: UMLDiagramType
  mode?: UmlStudioMode
  view?: UmlStudioView
  availableViews?: UmlStudioView[]
  readonly?: boolean
  enablePopups?: boolean
  keyboardShortcuts?: boolean
  model?: UMLModel
  locale?: Locale
  debug?: boolean
  collaborationEnabled?: boolean
  collaboration?: UmlStudioCollaborationOptions
  scrollLock?: boolean
  controls?: OverlayControlInput[]
  labels?: Partial<UmlStudioLabels>
  tags?: boolean | TagOptions
  theme?: Partial<Record<`--umlstudio-${string}`, string>>
  dataTheme?: "light" | "dark"
}

export type FeedbackCorrectionStatus = {
  description?: string
  status: "CORRECT" | "INCORRECT" | "NOT_VALIDATED"
}

export type Assessment = {
  modelElementId: string
  elementType: string
  score: number
  feedback?: string
  dropInfo?: unknown
  label?: string
  labelColor?: string
  correctionStatus?: FeedbackCorrectionStatus
}

export type ExportOptions = {
  margin?: number | { top?: number; right?: number; bottom?: number; left?: number }
  keepOriginalSize?: boolean
  include?: string[]
  exclude?: string[]
  svgMode?: SvgExportMode
}

export type SVG = {
  svg: string
  clip: {
    x: number
    y: number
    width: number
    height: number
  }
}
