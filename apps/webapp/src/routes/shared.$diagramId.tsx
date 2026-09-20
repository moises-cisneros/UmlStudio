import { createFileRoute, redirect } from "@tanstack/react-router";
import { UmlStudioShared } from "@/pages/UmlStudioShared";
import { VersionRepositoryProvider } from "@/contexts/VersionRepositoryContext";
import type { DiagramView } from "@/types/ModalTypes";
import { isDiagramView } from "@/utils/sharedDiagramLinks";
import { useAuthStore } from "@/stores/useAuthStore";

type SharedSearch = { view?: DiagramView; version?: string };

export const Route = createFileRoute("/shared/$diagramId")({
  validateSearch: (search: Record<string, unknown>): SharedSearch => ({
    view: isDiagramView(search.view) ? search.view : undefined,
    version: typeof search.version === "string" ? search.version : undefined,
  }),
  beforeLoad: async ({ location }) => {
    try {
      await useAuthStore.getState().loadSession();
    } catch {
      // Ignored; check status below
    }
    if (useAuthStore.getState().status !== "authenticated") {
      throw redirect({
        to: "/login",
        search: { redirect: location.pathname },
        replace: true,
      });
    }
  },
  component: () => (
    <VersionRepositoryProvider kind="remote">
      <UmlStudioShared />
    </VersionRepositoryProvider>
  ),
});
