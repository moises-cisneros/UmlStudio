import { edgeConfig, DiagramEdgeType } from "@/edges/types"

export const useEdgeConfig = (edgeType: DiagramEdgeType) => {
  return edgeConfig[edgeType]
}
