import type { UmlStudioNode, Assessment } from "@/typings"

export function isGraded(assessment: Assessment | undefined): boolean {
  return (
    assessment !== undefined &&
    (assessment.score !== undefined || !!assessment.feedback)
  )
}

export function assessedIdsFor(
  elementId: string,
  nodes: readonly Pick<UmlStudioNode, "id" | "data">[]
): string[] {
  const node = nodes.find((candidate) => candidate.id === elementId)
  if (!node) return [elementId]

  const ids = [elementId]
  const data = (node.data ?? {}) as Record<string, unknown>
  for (const [key, value] of Object.entries(data)) {
    if (key === "tags" || !Array.isArray(value)) continue
    for (const item of value) {
      if (item && typeof item === "object" && typeof item.id === "string") {
        ids.push(item.id)
      }
    }
  }
  return ids
}

export function hasAssessmentToShow(
  elementId: string,
  nodes: readonly Pick<UmlStudioNode, "id" | "data">[],
  getAssessment: (id: string) => Assessment | undefined
): boolean {
  return assessedIdsFor(elementId, nodes).some((id) =>
    isGraded(getAssessment(id))
  )
}
