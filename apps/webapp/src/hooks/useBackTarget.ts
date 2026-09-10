import { useLocation } from "@tanstack/react-router";
import {
  ALL_DIAGRAMS_LABEL,
  BACK_TO_DIAGRAM_LABEL,
  isRestorableEditorPath,
  readNavFrom,
} from "@/lib/navProvenance";

export type BackTarget = { label: string } & (
  | { to: "/local/$id"; params: { id: string }; search: { version?: string } }
  | { to: "/" }
);

export const useBackTarget = (): BackTarget => {
  const from = readNavFrom(useLocation().state);
  if (isRestorableEditorPath(from)) {
    const [pathname, query = ""] = from.split("?");
    const [, head, id] = pathname.split("/");
    if (head === "local" && id) {
      const version = new URLSearchParams(query).get("version") ?? undefined;
      return {
        to: "/local/$id",
        params: { id: decodeURIComponent(id) },
        search: { version },
        label: BACK_TO_DIAGRAM_LABEL,
      };
    }
  }
  return { to: "/", label: ALL_DIAGRAMS_LABEL };
};
