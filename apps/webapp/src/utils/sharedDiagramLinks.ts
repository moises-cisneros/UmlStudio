import { Capacitor } from "@capacitor/core";
import { DiagramView } from "@/types";
import { serverURL } from "@/constants";

export type SharedDiagramViewOption = {
  value: DiagramView;
  label: string;
  badge: string;
  description: string;
};

export const SHARED_DIAGRAM_VIEW_OPTIONS: readonly SharedDiagramViewOption[] = [
  {
    value: DiagramView.EDITOR,
    label: "Editor",
    badge: "Editor",
    description: "Open as a live collaborative editing session.",
  },
  {
    value: DiagramView.LECTOR,
    label: "Lector",
    badge: "Lector",
    description: "Open in read-only live viewing mode.",
  },
];

export const DEFAULT_SHARED_DIAGRAM_VIEW = DiagramView.EDITOR;

export const isDiagramView = (value: unknown): value is DiagramView =>
  typeof value === "string" &&
  (Object.values(DiagramView) as string[]).includes(value);

export const normalizeSharedDiagramView = (value: unknown): DiagramView => {
  if (isDiagramView(value)) return value;
  if (typeof value === "string") {
    const upper = value.toUpperCase();
    if (upper === "COLLABORATE" || upper === "EDIT") {
      return DiagramView.EDITOR;
    }
    if (
      upper === "SEE_FEEDBACK" ||
      upper === "GIVE_FEEDBACK" ||
      upper === "VIEWER" ||
      upper === "READONLY"
    ) {
      return DiagramView.LECTOR;
    }
  }
  return DEFAULT_SHARED_DIAGRAM_VIEW;
};

export const getSharedDiagramViewOption = (
  view: unknown,
): SharedDiagramViewOption => {
  const normalizedView = normalizeSharedDiagramView(view);
  return (
    SHARED_DIAGRAM_VIEW_OPTIONS.find(
      (option) => option.value === normalizedView,
    ) ?? SHARED_DIAGRAM_VIEW_OPTIONS[0]
  );
};

export const getSharedDiagramViewBadge = (view: unknown): string =>
  getSharedDiagramViewOption(view).badge;

export const sharedDiagramRoute = (
  diagramId: string,
  view: DiagramView = DEFAULT_SHARED_DIAGRAM_VIEW,
) =>
  ({
    to: "/shared/$diagramId",
    params: { diagramId },
    search: { view },
  }) as const;

export const resolveShareOrigin = (): string => {
  if (Capacitor.isNativePlatform() && serverURL) {
    return serverURL;
  }
  return typeof window !== "undefined" ? window.location.origin : "";
};

export const resolveServerOrigin = (): string => {
  if (serverURL) return serverURL;
  if (Capacitor.isNativePlatform()) return "";
  return typeof window !== "undefined" ? window.location.origin : "";
};

export const buildSharedDiagramUrl = (
  diagramId: string,
  view: DiagramView = DEFAULT_SHARED_DIAGRAM_VIEW,
  origin = resolveShareOrigin(),
): string =>
  `${origin}/shared/${encodeURIComponent(diagramId)}?view=${encodeURIComponent(view)}`;
