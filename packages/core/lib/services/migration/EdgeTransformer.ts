import type { UmlStudioEdge, UMLModel, OrthogonalEdgeData } from "@/typings"

export function hydrateEdgeData(edge: UmlStudioEdge): UmlStudioEdge {
  const sourceData = (edge.data ?? {}) as OrthogonalEdgeData & Record<string, unknown>
  const hasComputedSegments = Object.prototype.hasOwnProperty.call(sourceData, "computedSegments")

  if (edge.data != null && Array.isArray(sourceData.points) && !hasComputedSegments) {
    return edge
  }

  const data = { ...sourceData } as OrthogonalEdgeData & Record<string, unknown>
  delete data.computedSegments
  if (!Array.isArray(data.points)) data.points = []

  return { ...edge, data }
}

export function transformEdges(model: UMLModel): UMLModel {
  const hydratedEdges = model.edges.map(hydrateEdgeData)

  const anyChanged = hydratedEdges.some((edge, i) => edge !== model.edges[i])
  if (!anyChanged) return model

  return {
    ...model,
    edges: hydratedEdges,
  }
}
