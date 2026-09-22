import { createFileRoute, redirect } from "@tanstack/react-router"
import { UmlStudioLocal } from "@/pages/UmlStudioLocal"
import { VersionRepositoryProvider } from "@/contexts/VersionRepositoryContext"
import { useAuthStore } from "@/stores/useAuthStore"

type LocalSearch = { version?: string }

export const Route = createFileRoute("/local/$id")({
  validateSearch: (search: Record<string, unknown>): LocalSearch => ({
    version: typeof search.version === "string" ? search.version : undefined,
  }),
  beforeLoad: async ({ location }) => {
    try {
      await useAuthStore.getState().loadSession()
    } catch {
      // Ignored; check status below
    }
    if (useAuthStore.getState().status !== "authenticated") {
      throw redirect({
        to: "/login",
        search: { redirect: location.pathname },
        replace: true,
      })
    }
  },
  component: () => (
    <VersionRepositoryProvider kind="local">
      <UmlStudioLocal />
    </VersionRepositoryProvider>
  ),
})
