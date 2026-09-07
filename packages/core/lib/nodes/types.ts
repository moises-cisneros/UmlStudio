import type { NodeTypes } from "@xyflow/react"
import {
  DiagramNodeTypeRecord,
  type DiagramNodeType,
} from "../modelElementTypes"
import { Class, ColorDescription } from "./classDiagram"
import { TitleAndDesctiption } from "./TitleAndDescriptionNode"
import Package from "./classDiagram/Package"

export const diagramNodeTypes = {
  package: Package,
  class: Class,
  colorDescription: ColorDescription,
  titleAndDesctiption: TitleAndDesctiption,
} satisfies Record<DiagramNodeType, NodeTypes[string]>

export { DiagramNodeTypeRecord, type DiagramNodeType }
