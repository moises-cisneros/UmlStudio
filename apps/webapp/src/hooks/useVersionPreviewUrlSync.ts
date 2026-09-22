import { useCallback, useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "react-toastify"
import { selectScopedPreview, useVersionStore } from "@/stores/useVersionStore"
import { fetchVersionBody } from "@/queries/versionQueries"
import type { RepositoryKind } from "@/services/versionRepository"
import { versioningStrings as t } from "@/components/versioning/strings"
import { log } from "@/logger"

export const PREVIEW_VERSION_PARAM = "version"

export function useClosePreview() {
  const navigate = useNavigate()
  return useCallback(() => {
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, [PREVIEW_VERSION_PARAM]: undefined }),
      replace: true,
    })
  }, [navigate])
}

export function useVersionPreviewUrlSync(
  kind: RepositoryKind,
  diagramId: string | undefined,
  previewFromUrl: string | undefined,
  ready: boolean
) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const enterPreview = useVersionStore((s) => s.enterPreview)
  const exitPreview = useVersionStore((s) => s.exitPreview)
  const previewVersionId = useVersionStore((s) =>
    diagramId ? (selectScopedPreview(s, diagramId)?.versionId ?? null) : null
  )

  useEffect(() => {
    if (!diagramId) return
    if (previewFromUrl) {
      if (ready && previewVersionId !== previewFromUrl) {
        void fetchVersionBody(queryClient, kind, diagramId, previewFromUrl)
          .then((body) => enterPreview(diagramId, previewFromUrl, body))
          .catch((err) => {
            log.warn(
              "Previewed version unavailable",
              err instanceof Error ? err.message : String(err)
            )
            toast.error(t.previewUnavailable)
            void navigate({
              to: ".",
              search: (prev) => ({
                ...prev,
                [PREVIEW_VERSION_PARAM]: undefined,
              }),
              replace: true,
            })
          })
      }
    } else if (previewVersionId !== null) {
      exitPreview()
    }
  }, [
    previewFromUrl,
    previewVersionId,
    diagramId,
    ready,
    enterPreview,
    exitPreview,
    navigate,
    queryClient,
    kind,
  ])

  const openPreview = useCallback(
    (versionId: string) => {
      const replace = previewFromUrl !== undefined
      void navigate({
        to: ".",
        search: (prev) => ({ ...prev, [PREVIEW_VERSION_PARAM]: versionId }),
        replace,
      })
    },
    [navigate, previewFromUrl]
  )

  const closePreview = useClosePreview()

  return { openPreview, closePreview }
}
