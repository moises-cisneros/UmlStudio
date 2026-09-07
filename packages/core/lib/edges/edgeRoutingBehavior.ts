export const STRAIGHT_HOOK_EDGE_TYPES: ReadonlySet<string> = new Set([
  "SyntaxTreeLink",
  "UseCaseAssociation",
  "UseCaseInclude",
  "UseCaseExtend",
  "UseCaseGeneralization",
  "PetriNetArc",
])

export const STRAIGHT_PATH_STEP_EDGE_TYPES: ReadonlySet<string> = new Set([
  "ClassAggregation",
  "ClassInheritance",
  "ClassRealization",
  "ClassComposition",
  "ClassBidirectional",
  "ClassUnidirectional",
  "ClassDependency",
])
