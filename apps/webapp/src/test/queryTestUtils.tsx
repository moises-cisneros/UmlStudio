import type { ReactElement, ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render } from "@testing-library/react"
import { VersionRepositoryProvider } from "@/contexts/VersionRepositoryContext"
import type { RepositoryKind } from "@/services/versionRepository"

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  })
}

export function wrapWithQueryClient(ui: ReactNode, kind: RepositoryKind = "remote"): ReactElement {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      <VersionRepositoryProvider kind={kind}>{ui}</VersionRepositoryProvider>
    </QueryClientProvider>
  )
}

export function renderWithQuery(ui: ReactElement, kind?: RepositoryKind) {
  return render(wrapWithQueryClient(ui, kind))
}
