export const DiagramNodeTypeRecord = {
  package: "package",
  class: "class",
} as const;

export type DiagramNodeType =
  (typeof DiagramNodeTypeRecord)[keyof typeof DiagramNodeTypeRecord];

export const DiagramEdgeTypeRecord = {
  ClassAggregation: "ClassAggregation",
  ClassInheritance: "ClassInheritance",
  ClassRealization: "ClassRealization",
  ClassComposition: "ClassComposition",
  ClassBidirectional: "ClassBidirectional",
  ClassUnidirectional: "ClassUnidirectional",
  ClassDependency: "ClassDependency",
} as const;

export type DiagramEdgeType =
  (typeof DiagramEdgeTypeRecord)[keyof typeof DiagramEdgeTypeRecord];
