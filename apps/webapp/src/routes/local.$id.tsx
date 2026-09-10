import { createFileRoute } from "@tanstack/react-router";
import { UmlStudioLocal } from "@/pages/UmlStudioLocal";
import { VersionRepositoryProvider } from "@/contexts/VersionRepositoryContext";

type LocalSearch = { version?: string };

export const Route = createFileRoute("/local/$id")({
  validateSearch: (search: Record<string, unknown>): LocalSearch => ({
    version: typeof search.version === "string" ? search.version : undefined,
  }),
  component: () => (
    <VersionRepositoryProvider kind="local">
      <UmlStudioLocal />
    </VersionRepositoryProvider>
  ),
});
