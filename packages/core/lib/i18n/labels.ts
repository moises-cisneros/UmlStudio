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
  associationClass?: string
  selectFromClass?: string
  selectToClass?: string
  requiresTwoClassesForAssociationClass?: string
  cancelSelection?: string
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
  copyElement?: string
  deleteEdge: string
  editEdge: string
  resetEdgeRouting: string

  association?: string
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
  scrollLockHintTouch: "Canvas panning is locked. Drag with two fingers to scroll.",
  moveEdgeWaypoint: "Waypoint: drag to move, double-click or press Delete to remove",
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
  associationClass: "Association Class",
  selectFromClass: "Step 1: Click the source class (From)",
  selectToClass: "Step 2: Click the target class (To)",
  requiresTwoClassesForAssociationClass:
    "You must have at least 2 classes on the canvas to create an association class",
  cancelSelection: "Cancel",
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
  copyElement: "Copy node",
  deleteEdge: "Delete edge",
  editEdge: "Edit edge",
  resetEdgeRouting: "Reset routing",
  association: "Association",
  biAssociation: "Association",
  uniAssociation: "Uni-Association",
  aggregation: "Aggregation",
  composition: "Composition",
  inheritance: "Inheritance",
  dependency: "Dependency",
  realization: "Realization",
  namePlaceholder: "Name",
  stereotypeToggleLabel: (name) => `${name} stereotype`,
  stereotypeToggleTooltip: (shown, name) => `${shown ? "Hide" : "Show"} ${name} stereotype`,
  attributeWord: "attribute",
  methodWord: "method",
  classWord: "class",
  nodeWord: "node",
})

export const SPANISH_LABELS: ResolvedUmlStudioLabels = Object.freeze({
  zoomToolbar: "Barra de zoom",
  zoomIn: "Acercar",
  zoomOut: "Alejar",
  fitView: "Ajustar a la vista",
  resetZoom: "Restablecer zoom al 100%",
  zoomReadout: (percent) => `${percent}%`,
  undo: "Deshacer",
  undoHint: "Deshacer la última acción",
  redo: "Rehacer",
  redoHint: "Rehacer la última acción deshecha",
  multiSelection: "Selección múltiple",
  multiSelectionHint: "Selecciona múltiples elementos para moverlos juntos",
  scrollLockHint: (modifier) =>
    `El desplazamiento del lienzo está bloqueado. Mantén presionado ${modifier} o arrastra con dos dedos para desplazarte.`,
  scrollLockHintTouch:
    "El desplazamiento del lienzo está bloqueado. Arrastra con dos dedos para desplazarte.",
  moveEdgeWaypoint: "Punto de ruta: arrastra para mover, doble clic o presiona Supr para eliminar",
  miniMap: "Minimapa",
  showMinimap: "Mostrar minimapa",
  showMinimapHint: "Muestra el minimapa para navegar por el diagrama",
  hideMinimap: "Ocultar minimapa",
  selectionActions: "Acciones de selección",
  elementPalette: "Paleta de elementos",
  addElement: "Agregar elemento",
  paletteModelView: "Elementos del modelo",
  paletteSelectElementsView: "Selecciona elemento a agregar",
  paletteHighlightHint: "Haz clic en un elemento para agregarlo al diagrama",
  edge: "Relación",
  label: "Etiqueta",
  type: "Tipo",
  connection: "Conexión",
  stereotype: "Estereotipo",
  object: "Objeto",
  source: "Origen",
  target: "Destino",
  style: "Estilo",
  selectPlaceholder: "Seleccionar…",
  addComment: "Agregar un comentario…",
  points: "Puntos",
  negativePointsAllowed: "Se permiten puntos negativos.",
  feedback: "Comentarios",
  deleteAssessment: "Eliminar evaluación",
  deleteAssessmentFor: (name) => `Eliminar evaluación para ${name}`,
  assessmentFor: (type) => `Evaluación para ${type}`,
  previousAssessment: "Evaluación anterior",
  nextAssessment: "Siguiente evaluación",
  noComment: "Sin comentarios",
  notGraded: "No calificado",
  node: "Nodo",
  attribute: "Atributo",
  method: "Método",
  nodeTypeLabel: (nodeType?: string) => {
    if (!nodeType) return "Elemento"
    const map: Record<string, string> = {
      class: "Clase",
      interface: "Interfaz",
      enumeration: "Enumeración",
      package: "Paquete",
    }
    return map[nodeType] ?? defaultNodeTypeLabel(nodeType)
  },
  class: "Clase",
  classType: "Tipo de clase",
  abstractClass: "Clase Abstracta",
  interface: "Interfaz",
  enumeration: "Enumeración",
  associationClass: "Clase Intermedia",
  selectFromClass: "Paso 1: Selecciona la clase de origen (From)",
  selectToClass: "Paso 2: Selecciona la clase de destino (To)",
  requiresTwoClassesForAssociationClass:
    "Debes tener al menos 2 clases en el lienzo para crear una clase intermedia",
  cancelSelection: "Cancelar",
  reorderAttribute: "Reordenar atributo",
  newAttribute: "Nuevo atributo",
  addAttribute: "Agregar atributo",
  deleteAttribute: "Eliminar atributo",
  attributes: "Atributos",
  reorderMethod: "Reordenar método",
  newMethod: "Nuevo método",
  addMethod: "Agregar método",
  deleteMethod: "Eliminar método",
  methods: "Métodos",
  editTagsFor: (subject) => `Etiquetas para ${subject}`,
  newTag: "Nueva etiqueta",
  addTag: "Agregar etiqueta",
  noTags: "Sin etiquetas",
  removeTag: (tag) => `Eliminar etiqueta ${tag}`,
  edgeType: "Tipo de relación",
  swapSourceTarget: "Intercambiar origen y destino",
  multiplicityLabel: (name) => `Multiplicidad de ${name}`,
  roleLabel: (name) => `Rol de ${name}`,
  deleteElement: "Eliminar elemento",
  editElement: "Editar elemento",
  copyElement: "Copiar nodo",
  deleteEdge: "Eliminar relación",
  editEdge: "Editar relación",
  resetEdgeRouting: "Restablecer enrutamiento",
  association: "Asociación",
  biAssociation: "Asociación",
  uniAssociation: "Asociación Unidireccional",
  aggregation: "Agregación",
  composition: "Composición",
  inheritance: "Herencia",
  dependency: "Dependencia",
  realization: "Realización",
  namePlaceholder: "Nombre",
  stereotypeToggleLabel: (name) => `Estereotipo de ${name}`,
  stereotypeToggleTooltip: (shown, name) =>
    `${shown ? "Ocultar" : "Mostrar"} estereotipo de ${name}`,
  attributeWord: "atributo",
  methodWord: "método",
  classWord: "clase",
  nodeWord: "nodo",
})

export const DEFAULT_LABELS: UmlStudioLabels = RESOLVED_DEFAULT_LABELS

export function mergeLabels(overrides?: Partial<UmlStudioLabels>): ResolvedUmlStudioLabels {
  return overrides ? { ...RESOLVED_DEFAULT_LABELS, ...overrides } : RESOLVED_DEFAULT_LABELS
}
