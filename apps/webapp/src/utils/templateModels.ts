import { importDiagram, type UMLModel } from "@umlstudio/core/model";

export type TemplateRoutingState = "automatic" | "pinned" | "authored";

export const getTemplateEdgeRoutingState = (
  edge: UMLModel["edges"][number],
): TemplateRoutingState => {
  if (Array.isArray(edge.data?.points) && edge.data.points.length > 0) {
    return "authored";
  }

  if (edge.data?.sourceAnchor != null || edge.data?.targetAnchor != null) {
    return "pinned";
  }

  return "automatic";
};

export const prepareTemplateModel = (
  source: UMLModel,
  overrides: Partial<Pick<UMLModel, "id" | "title">> = {},
): UMLModel => {
  const clone =
    typeof structuredClone === "function"
      ? structuredClone(source)
      : (JSON.parse(JSON.stringify(source)) as UMLModel);
  const model = importDiagram(clone);

  return {
    ...model,
    ...overrides,
  };
};
