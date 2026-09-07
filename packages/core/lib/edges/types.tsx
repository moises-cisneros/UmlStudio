import type { EdgeTypes } from "@xyflow/react"
import type { DiagramEdgeType } from "../modelElementTypes"
import { ClassDiagramEdge } from "./edgeTypes/ClassDiagramEdge"

export const diagramEdgeTypes = {
  ClassAggregation: ClassDiagramEdge,
  ClassInheritance: ClassDiagramEdge,
  ClassRealization: ClassDiagramEdge,
  ClassComposition: ClassDiagramEdge,
  ClassBidirectional: ClassDiagramEdge,
  ClassUnidirectional: ClassDiagramEdge,
  ClassDependency: ClassDiagramEdge,
} satisfies Record<DiagramEdgeType, EdgeTypes[string]>

export const edgeConfig = {
  ClassAggregation: { allowMidpointDragging: true },
  ClassInheritance: { allowMidpointDragging: true },
  ClassRealization: { allowMidpointDragging: true },
  ClassComposition: { allowMidpointDragging: true },
  ClassBidirectional: { allowMidpointDragging: true },
  ClassUnidirectional: { allowMidpointDragging: true },
  ClassDependency: { allowMidpointDragging: true },
} as const

export type { DiagramEdgeType } from "../modelElementTypes"

export type { IPoint } from "./Connection"
