export interface UmlStudioLabels {
  zoomToolbar: string
  zoomIn: string
  zoomOut: string
  fitView: string
  resetZoom: string
  zoomReadout: (percent: number) => string
  undo: string
  undoHint: string
  redo: string
  redoHint: string
  multiSelection: string
  multiSelectionHint: string
  scrollLockHint?: (modifier: string) => string
  scrollLockHintTouch?: string
  moveEdgeWaypoint?: string

  miniMap: string
  showMinimap: string
  showMinimapHint: string
  hideMinimap: string

  selectionActions: string
  elementPalette: string
  addElement: string
  paletteModelView: string
  paletteSelectElementsView: string
  paletteHighlightHint: string

  edge: string
  label: string
  type: string
  connection: string
  stereotype: string
  object: string
  source: string
  target: string
  style: string
  selectPlaceholder: string

  addComment: string
  points: string
  negativePointsAllowed: string
  feedback: string
  deleteAssessment: string
  deleteAssessmentFor: (name: string) => string
  assessmentFor: (type: string) => string
  previousAssessment?: string
  nextAssessment: string
  noComment: string
  notGraded: string
  node: string
  attribute: string
  method: string
  nodeTypeLabel: (nodeType?: string) => string

  class: string
  classType: string
  abstractClass: string
  interface: string
  enumeration: string
  reorderAttribute: string
  newAttribute: string
  addAttribute: string
  deleteAttribute: string
  attributes: string
  reorderMethod: string
  newMethod: string
  addMethod: string
  deleteMethod: string
  methods: string

  editTagsFor: (subject: string) => string
  newTag: string
  addTag: string
  noTags: string
  removeTag: (tag: string) => string

  edgeType: string
  swapSourceTarget: string
  multiplicityLabel: (name: string) => string
  roleLabel: (name: string) => string
  deleteElement: string
  editElement: string
  deleteEdge: string
  editEdge: string
  resetEdgeRouting: string

  biAssociation: string
  uniAssociation: string
  aggregation: string
  composition: string
  inheritance: string
  dependency: string
  realization: string

  namePlaceholder: string
  stereotypeToggleLabel: (name: string) => string
  stereotypeToggleTooltip: (shown: boolean, name: string) => string

  attributeWord: string
  methodWord: string
  classWord: string
  nodeWord: string
}

function defaultNodeTypeLabel(nodeType?: string): string {
  if (!nodeType) return "Element"

  return nodeType
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
}

export type ResolvedUmlStudioLabels = Required<UmlStudioLabels>

const RESOLVED_DEFAULT_LABELS: ResolvedUmlStudioLabels = Object.freeze({
  zoomToolbar: "Zoom toolbar",
  zoomIn: "Zoom In",
  zoomOut: "Zoom Out",
  fitView: "Fit view",
  resetZoom: "Reset zoom to 100%",
  zoomReadout: (percent) => `${percent}%`,
  undo: "Undo",
  undoHint: "Undo the last action",
  redo: "Redo",
  redoHint: "Redo the last undone action",
  multiSelection: "Multiple selection",
  multiSelectionHint: "Select multiple elements to move them together",
  scrollLockHint: (modifier) =>
    `Canvas panning is locked. Hold ${modifier} or drag with two fingers to scroll.`,
  scrollLockHintTouch:
    "Canvas panning is locked. Drag with two fingers to scroll.",
  moveEdgeWaypoint:
    "Waypoint: drag to move, double-click or press Delete to remove",
  miniMap: "Minimap",
  showMinimap: "Show Minimap",
  showMinimapHint: "Show the minimap to navigate the diagram",
  hideMinimap: "Hide Minimap",
  selectionActions: "Selection actions",
  elementPalette: "Element palette",
  addElement: "Add element",
  paletteModelView: "Model elements",
  paletteSelectElementsView: "Select element to add",
  paletteHighlightHint: "Click an element to add it to the diagram",
  edge: "Edge",
  label: "Label",
  type: "Type",
  connection: "Connection",
  stereotype: "Stereotype",
  object: "Object",
  source: "Source",
  target: "Target",
  style: "Style",
  selectPlaceholder: "Select…",
  addComment: "Add a comment…",
  points: "Points",
  negativePointsAllowed: "Negative points are allowed.",
  feedback: "Feedback",
  deleteAssessment: "Delete assessment",
  deleteAssessmentFor: (name) => `Delete assessment for ${name}`,
  assessmentFor: (type) => `Assessment for ${type}`,
  previousAssessment: "Previous Assessment",
  nextAssessment: "Next Assessment",
  noComment: "No comment",
  notGraded: "Not graded",
  node: "Node",
  attribute: "Attribute",
  method: "Method",
  nodeTypeLabel: defaultNodeTypeLabel,
  class: "Class",
  classType: "Class type",
  abstractClass: "Abstract Class",
  interface: "Interface",
  enumeration: "Enumeration",
  reorderAttribute: "Reorder attribute",
  newAttribute: "New attribute",
  addAttribute: "Add attribute",
  deleteAttribute: "Delete attribute",
  attributes: "Attributes",
  reorderMethod: "Reorder method",
  newMethod: "New method",
  addMethod: "Add method",
  deleteMethod: "Delete method",
  methods: "Methods",
  editTagsFor: (subject) => `Tags for ${subject}`,
  newTag: "New tag",
  addTag: "Add tag",
  noTags: "No tags",
  removeTag: (tag) => `Remove tag ${tag}`,
  edgeType: "Edge Type",
  swapSourceTarget: "Swap source and target",
  multiplicityLabel: (name) => `${name} Multiplicity`,
  roleLabel: (name) => `${name} Role`,
  deleteElement: "Delete element",
  editElement: "Edit element",
  deleteEdge: "Delete edge",
  editEdge: "Edit edge",
  resetEdgeRouting: "Reset routing",
  biAssociation: "Bi-Association",
  uniAssociation: "Uni-Association",
  aggregation: "Aggregation",
  composition: "Composition",
  inheritance: "Inheritance",
  dependency: "Dependency",
  realization: "Realization",
  namePlaceholder: "Name",
  stereotypeToggleLabel: (name) => `${name} stereotype`,
  stereotypeToggleTooltip: (shown, name) =>
    `${shown ? "Hide" : "Show"} ${name} stereotype`,
  attributeWord: "attribute",
  methodWord: "method",
  classWord: "class",
  nodeWord: "node",
})

export const DEFAULT_LABELS: UmlStudioLabels = RESOLVED_DEFAULT_LABELS

export function mergeLabels(
  overrides?: Partial<UmlStudioLabels>
): ResolvedUmlStudioLabels {
  return overrides
    ? { ...RESOLVED_DEFAULT_LABELS, ...overrides }
    : RESOLVED_DEFAULT_LABELS
}
