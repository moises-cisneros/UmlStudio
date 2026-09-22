import { edgeConfig, DiagramEdgeType } from "@/edges/types"

export const getEdgeConfig = (edgeType: DiagramEdgeType) => {
  return edgeConfig[edgeType]
}
