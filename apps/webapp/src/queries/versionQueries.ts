import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query"
import {
  getVersionRepository,
  type ListVersionsResponse,
  type RepositoryKind,
} from "@/services/versionRepository"
import type { Diagram, PendingVersion } from "@/types"
import { versionKeys } from "./keys"

const VERSIONS_PAGE_SIZE = 25

export type VersionListData = InfiniteData<ListVersionsResponse, string | undefined>

export function versionListQueryOptions(kind: RepositoryKind, diagramId: string) {
  return infiniteQueryOptions({
    queryKey: versionKeys.list(kind, diagramId),
    queryFn: ({ pageParam, signal }) =>
      getVersionRepository(kind).list(diagramId, {
        limit: VERSIONS_PAGE_SIZE,
        before: pageParam,
        signal,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}

interface FlatVersionList {
  versions: PendingVersion[]
  total: number
}

const selectFlatVersionList = (data: VersionListData): FlatVersionList => ({
  versions: data.pages.flatMap((page) => page.versions),
  total: data.pages[data.pages.length - 1]?.total ?? 0,
})

export function useVersionsQuery(
  kind: RepositoryKind,
  diagramId: string,
  opts: { refetchOnFocus?: boolean } = {}
) {
  return useInfiniteQuery({
    ...versionListQueryOptions(kind, diagramId),
    refetchOnWindowFocus: opts.refetchOnFocus ?? false,
    select: selectFlatVersionList,
  })
}

export function versionBodyQueryOptions(
  kind: RepositoryKind,
  diagramId: string,
  versionId: string
) {
  return queryOptions({
    queryKey: versionKeys.body(kind, diagramId, versionId),
    queryFn: ({ signal }): Promise<Diagram> =>
      getVersionRepository(kind).getBody(diagramId, versionId, { signal }),
    staleTime: Infinity,
  })
}

export function useVersionBodyQuery(
  kind: RepositoryKind,
  diagramId: string,
  versionId: string,
  opts: { enabled?: boolean } = {}
) {
  return useQuery({
    ...versionBodyQueryOptions(kind, diagramId, versionId),
    enabled: opts.enabled ?? true,
  })
}

export function fetchVersionBody(
  queryClient: QueryClient,
  kind: RepositoryKind,
  diagramId: string,
  versionId: string
): Promise<Diagram> {
  return queryClient.fetchQuery(versionBodyQueryOptions(kind, diagramId, versionId))
}

export function prefetchVersions(
  queryClient: QueryClient,
  kind: RepositoryKind,
  diagramId: string
): Promise<void> {
  return queryClient.prefetchInfiniteQuery(versionListQueryOptions(kind, diagramId))
}

export function getCachedVersions(
  queryClient: QueryClient,
  kind: RepositoryKind,
  diagramId: string
): PendingVersion[] | undefined {
  const data = queryClient.getQueryData<VersionListData>(versionKeys.list(kind, diagramId))
  return data?.pages.flatMap((page) => page.versions)
}
