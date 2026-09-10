import { createFileRoute } from "@tanstack/react-router";
import { UmlStudioShared } from "@/pages/UmlStudioShared";
import { VersionRepositoryProvider } from "@/contexts/VersionRepositoryContext";
import type { DiagramView } from "@/types/ModalTypes";
import { isDiagramView } from "@/utils/sharedDiagramLinks";

type SharedSearch = { view?: DiagramView; version?: string };

export const Route = createFileRoute("/shared/$diagramId")({
  validateSearch: (search: Record<string, unknown>): SharedSearch => ({
    view: isDiagramView(search.view) ? search.view : undefined,
    version: typeof search.version === "string" ? search.version : undefined,
  }),
  component: () => (
    <VersionRepositoryProvider kind="remote">
      <UmlStudioShared />
    </VersionRepositoryProvider>
  ),
});
