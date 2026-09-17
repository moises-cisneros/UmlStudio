import type { QueryClient } from "@tanstack/react-query";
import { useVersionStore } from "./useVersionStore";
import { usePersistenceModelStore } from "./usePersistenceModelStore";
import {
  getVersionRepository,
  subscribeToLocalVersionEvents,
} from "@/services/versionRepository";
import { queryClient as appQueryClient } from "@/queryClient";
import { versionKeys } from "@/queries/keys";
import { getCachedVersions } from "@/queries/versionQueries";
import { log } from "@/logger";

let dispose: (() => void) | null = null;

export function ensureVersionStoreBootstrapped(
  queryClient: QueryClient = appQueryClient,
): void {
  if (dispose) return;

  let prevModelIds = new Set(
    Object.keys(usePersistenceModelStore.getState().models),
  );
  const unsubscribeModels = usePersistenceModelStore.subscribe(
    (state, prev) => {
      if (state.models === prev.models) return;
      const next = new Set(Object.keys(state.models));
      for (const id of prevModelIds) {
        if (!next.has(id)) {
          getVersionRepository("local")
            .purgeDiagram?.(id)
            .catch((err: unknown) =>
              log.warn(
                "purgeDiagram failed",
                err instanceof Error ? err.message : String(err),
              ),
            );
        }
      }
      prevModelIds = next;
    },
  );

  const unsubscribeBroadcast = subscribeToLocalVersionEvents((msg) => {
    void queryClient
      .invalidateQueries({
        queryKey: versionKeys.list("local", msg.diagramId),
        refetchType: "all",
      })
      .then(() => {
        const previewing = useVersionStore.getState().preview;
        if (!previewing || previewing.diagramId !== msg.diagramId) return;
        const versions = getCachedVersions(queryClient, "local", msg.diagramId);
        if (versions && !versions.some((v) => v.id === previewing.versionId)) {
          queryClient.removeQueries({
            queryKey: versionKeys.body(
              "local",
              msg.diagramId,
              previewing.versionId,
            ),
          });
          useVersionStore.getState().exitPreview();
        }
      })
      .catch((err: unknown) =>
        log.warn(
          "Cross-tab refetch failed",
          err instanceof Error ? err.message : String(err),
        ),
      );
  });

  dispose = () => {
    unsubscribeModels();
    unsubscribeBroadcast();
  };
}

export function __teardownVersionStoreBootstrapForTests(): void {
  dispose?.();
  dispose = null;
}
