export type NavFrom = string;

export const ALL_DIAGRAMS_LABEL = "All diagrams";
export const BACK_TO_DIAGRAM_LABEL = "Back to diagram";

export const isRestorableEditorPath = (
  from: string | undefined | null,
): from is string => typeof from === "string" && /^\/local\/[^/]+/.test(from);

export const readNavFrom = (state: unknown): NavFrom | undefined => {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === "string" ? from : undefined;
};

export const readHighlightSharedDiagramId = (
  state: unknown,
): string | undefined => {
  const id = (state as { highlightSharedDiagramId?: unknown } | null)
    ?.highlightSharedDiagramId;
  return typeof id === "string" ? id : undefined;
};
