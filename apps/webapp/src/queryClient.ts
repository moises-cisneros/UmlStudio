import { QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/services/DiagramApiClient";
import { log } from "@/logger";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) =>
      log.warn(
        "Query failed",
        JSON.stringify(query.queryKey),
        error instanceof Error ? error.message : String(error),
      ),
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        if (
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500
        ) {
          return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
