import type { NodeTypes } from "@xyflow/react"
import { DiagramNodeTypeRecord, type DiagramNodeType } from "../modelElementTypes"
import { Class } from "./classDiagram"
import Package from "./classDiagram/Package"

export const diagramNodeTypes = {
  package: Package,
  class: Class,
} satisfies Record<DiagramNodeType, NodeTypes[string]>

export { DiagramNodeTypeRecord, type DiagramNodeType }
