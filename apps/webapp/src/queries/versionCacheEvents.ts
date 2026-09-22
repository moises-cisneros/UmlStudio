import type { QueryClient } from "@tanstack/react-query"
import type { ControlEvent } from "@/types"
import { log } from "@/logger"
import { versionKeys } from "./keys"
import type { VersionListData } from "./versionQueries"
import { listContainsVersion, patchVersionInList, removeVersionFromList } from "./versionListCache"

export function applyControlEventToCache(
  queryClient: QueryClient,
  diagramId: string,
  event: ControlEvent
): void {
  const listKey = versionKeys.list("remote", diagramId)
  switch (event.type) {
    case "VERSION_CREATED": {
      const data = queryClient.getQueryData<VersionListData>(listKey)
      if (listContainsVersion(data, event.versionId)) return
      void queryClient.invalidateQueries({ queryKey: listKey })
      return
    }
    case "VERSION_DELETED": {
      queryClient.setQueryData<VersionListData>(listKey, (data) =>
        removeVersionFromList(data, event.versionId)
      )
      queryClient.removeQueries({
        queryKey: versionKeys.body("remote", diagramId, event.versionId),
      })
      return
    }
    case "VERSION_RENAMED":
      queryClient.setQueryData<VersionListData>(listKey, (data) =>
        patchVersionInList(data, event.versionId, {
          name: event.name,
          description: event.description,
        })
      )
      return
    case "VERSION_RESTORED":
      void queryClient.invalidateQueries({ queryKey: listKey })
      return
    case "DIAGRAM_DELETED":
      return
    default:
      log.warn("Unknown control event type", (event as { type: string }).type)
      return
  }
}
