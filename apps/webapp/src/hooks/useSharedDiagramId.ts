import { useLocation } from "@tanstack/react-router";
import { useDiagramIdFromPath } from "./useDiagramIdFromPath";

export function useSharedDiagramId(): string | undefined {
  const id = useDiagramIdFromPath();
  const { pathname } = useLocation();
  const isLocal = pathname.split("/").filter(Boolean)[0] === "local";
  return isLocal ? undefined : id;
}
