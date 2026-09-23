import { useCallback, useEffect, useMemo, useRef, useState, type FC } from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "react-toastify"
import {
  UmlStudioEditor,
  importDiagram,
  type UMLModel,
  DEFAULT_LABELS,
  SPANISH_LABELS,
} from "@umlstudio/core"
import { usePersistenceModelStore } from "@/stores/usePersistenceModelStore"
import { useEditorContext, useModalContext } from "@/contexts"
import { useElementWidth } from "@/hooks/useElementWidth"
import { useEditorShortcuts } from "@/hooks/useEditorShortcuts"
import { useVersionPreviewUrlSync } from "@/hooks/useVersionPreviewUrlSync"
import { selectScopedPreview, useVersionStore } from "@/stores/useVersionStore"
import { fetchVersionBody, useVersionsQuery } from "@/queries/versionQueries"
import { useVersionRepositoryKind } from "@/contexts/VersionRepositoryContext"
import { useRestoreVersionMutation } from "@/queries/versionMutations"
import type { PendingVersion } from "@/types"
import { VersionDrawer, VersionPreviewBanner } from "@/components/versioning"
import { structuralFingerprint } from "@/lib/version/predicates"
import { useVersioningTranslation } from "@/components/versioning/strings"
import type { Diagram } from "@/types"
import { log } from "@/logger"
import { normalizeThumbnailSvg } from "@/utils/thumbnailSvg"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { installPerfHooks } from "@/utils/perfHooks"
import { setActiveDiagramForTracking } from "@/utils/localProductivityTracker"
import { ErrorPage } from "./ErrorPage"
import { useTranslation } from "@/i18n"

const THUMBNAIL_DEBOUNCE_MS = 2000

const EMPTY_VERSIONS: readonly PendingVersion[] = Object.freeze([])

const route = getRouteApi("/local/$id")

export const UmlStudioLocal: FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasColumnRef = useRef<HTMLDivElement | null>(null)
  const canvasColumnWidth = useElementWidth(canvasColumnRef)
  const thumbnailExportTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const thumbnailExportSequenceRef = useRef(0)
  const isThumbnailExportCanceledRef = useRef(false)
  const { setEditor, editor } = useEditorContext()
  const { openModal } = useModalContext()
  const { locale, t: tr } = useTranslation()
  const t = useVersioningTranslation()
  const { id: diagramId } = route.useParams()
  const { version: previewFromUrl } = route.useSearch()
  const router = useRouter()

  const diagram = usePersistenceModelStore((store) => (diagramId ? store.models[diagramId] : null))
  const setCurrentModelId = usePersistenceModelStore((store) => store.setCurrentModelId)
  const updateModel = usePersistenceModelStore((store) => store.updateModel)
  const setThumbnail = usePersistenceModelStore((store) => store.setThumbnail)

  useDocumentTitle(diagram?.model.title)

  useEffect(() => {
    setActiveDiagramForTracking(diagramId ?? null)
    return () => {
      setActiveDiagramForTracking(null)
    }
  }, [diagramId])

  useEffect(() => {
    if (!diagramId) return
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "persistenceModelStore" || !e.newValue) return
      try {
        const models =
          (
            JSON.parse(e.newValue) as {
              state?: { models?: Record<string, unknown> }
            }
          )?.state?.models ?? {}
        if (!(diagramId in models)) {
          void usePersistenceModelStore.persist.rehydrate()
        }
      } catch {
        // Ignore, the user may have deleted the model.
      }
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [diagramId])

  const preview = useVersionStore((s) => selectScopedPreview(s, diagramId))
  const queryClient = useQueryClient()
  const kind = useVersionRepositoryKind()
  const { openPreview, closePreview } = useVersionPreviewUrlSync(
    kind,
    diagramId,
    previewFromUrl,
    Boolean(editor)
  )
  const versionsQuery = useVersionsQuery(kind, diagramId)
  const versions = versionsQuery.data?.versions ?? EMPTY_VERSIONS
  const restoreMutation = useRestoreVersionMutation(kind, diagramId)

  useEditorShortcuts(diagramId ?? undefined)

  const prePreviewFingerprintRef = useRef<string | null>(null)
  const [canRestoreFromPreview, setCanRestoreFromPreview] = useState(false)

  const editorForLabelsRef = useRef(editor)
  useEffect(() => {
    editorForLabelsRef.current = editor
  })

  useEffect(() => {
    const ed = editorForLabelsRef.current
    if (ed && typeof ed.setLabels === "function") {
      const baseLabels = locale === "es" ? SPANISH_LABELS : DEFAULT_LABELS
      ed.setLabels({
        ...baseLabels,
        attributes: tr.agent.attributes || baseLabels.attributes,
        methods: tr.agent.methods || baseLabels.methods,
      })
    }
  }, [locale, tr.agent.attributes, tr.agent.methods])

  useEffect(() => {
    if (!containerRef.current || !diagram) return
    isThumbnailExportCanceledRef.current = false
    setCurrentModelId(diagram.id)

    const baseLabels = locale === "es" ? SPANISH_LABELS : DEFAULT_LABELS
    const instance = new UmlStudioEditor(containerRef.current, {
      model: diagram.model,
      labels: {
        ...baseLabels,
        attributes: tr.agent.attributes || baseLabels.attributes,
        methods: tr.agent.methods || baseLabels.methods,
      },
    })

    const subId = instance.subscribeToModelChange((model) => {
      if (selectScopedPreview(useVersionStore.getState(), diagramId)) return
      updateModel(model)
      if (typeof navigator !== "undefined" && navigator.webdriver) return
      if (thumbnailExportTimeoutRef.current) {
        clearTimeout(thumbnailExportTimeoutRef.current)
      }

      const sequence = ++thumbnailExportSequenceRef.current
      thumbnailExportTimeoutRef.current = setTimeout(async () => {
        try {
          const exportedSvg = await instance.exportAsSVG({ svgMode: "compat" })
          if (
            sequence !== thumbnailExportSequenceRef.current ||
            isThumbnailExportCanceledRef.current
          ) {
            return
          }

          const normalizedSvg = normalizeThumbnailSvg(
            exportedSvg.svg,
            exportedSvg.clip.width,
            exportedSvg.clip.height
          )

          setThumbnail(model.id, normalizedSvg)
        } catch (error) {
          log.error("Failed to generate diagram thumbnail", error as Error)
        }
      }, THUMBNAIL_DEBOUNCE_MS)
    })

    setEditor(instance)

    if (import.meta.env.DEV || import.meta.env.VITE_E2E === "true") {
      ;(window as Window & { umlstudioEditor?: UmlStudioEditor }).umlstudioEditor = instance
    }
    const removePerfHooks = installPerfHooks(instance)

    return () => {
      isThumbnailExportCanceledRef.current = true
      thumbnailExportSequenceRef.current += 1
      removePerfHooks()
      if (import.meta.env.DEV || import.meta.env.VITE_E2E === "true") {
        delete (window as Window & { umlstudioEditor?: UmlStudioEditor }).umlstudioEditor
      }
      if (thumbnailExportTimeoutRef.current) {
        clearTimeout(thumbnailExportTimeoutRef.current)
        thumbnailExportTimeoutRef.current = null
      }

      log.debug("Cleaning up UmlStudio instance")
      instance.unsubscribe(subId)
      instance.destroy()
      const isTransitioningToAnotherLocalDiagram = /^\/local\//.test(router.state.location.pathname)
      if (
        !isTransitioningToAnotherLocalDiagram &&
        usePersistenceModelStore.getState().currentModelId === diagram.id
      ) {
        setCurrentModelId(null)
        setEditor(undefined)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagram?.id, router, setCurrentModelId, setEditor, setThumbnail, updateModel])

  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => {
    if (!editor) return
    if (preview) {
      if (prePreviewFingerprintRef.current === null) {
        try {
          prePreviewFingerprintRef.current = structuralFingerprint(editor.model)
        } catch {
          prePreviewFingerprintRef.current = ""
        }
      }
      try {
        setCanRestoreFromPreview(
          prePreviewFingerprintRef.current !== structuralFingerprint(preview.body as Diagram)
        )
      } catch {
        setCanRestoreFromPreview(true)
      }
      try {
        editor.setReadonly(true)
        editor.setPreviewMode(true)
        // eslint-disable-next-line react-hooks/immutability
        editor.model = importDiagram(preview.body as Diagram) as UMLModel
        editor.fitView()
      } catch (err) {
        editor.setPreviewMode(false)
        prePreviewFingerprintRef.current = null
        log.error("Failed to render preview body", err as Error)
        const isSchemaError = err instanceof Error && err.message.includes("schema")
        toast.error(isSchemaError ? t.failureSchemaUnsupported : t.previewFailed)
      }
    } else {
      editor.setReadonly(false)
      prePreviewFingerprintRef.current = null
      setCanRestoreFromPreview(false)
      editor.setPreviewMode(false)
      editor.fitView()
    }
  }, [preview, editor, t])

  const resolveBody = useCallback(
    async (versionId: string): Promise<Diagram> => {
      if (preview?.versionId === versionId) return preview.body as Diagram
      if (!diagramId) {
        throw new Error("No current diagram id")
      }
      return fetchVersionBody(queryClient, kind, diagramId, versionId)
    },
    [preview, diagramId, queryClient, kind]
  )

  const performRestore = useCallback(
    async (versionId: string) => {
      if (!editor || !diagramId) return
      const summary = versions.find((v) => v.id === versionId)
      try {
        const body = await resolveBody(versionId)
        if (preview) editor.setPreviewMode(false)
        const liveBody = editor.model
        await restoreMutation.mutateAsync({
          versionId,
          currentBody: liveBody,
        })
        // eslint-disable-next-line react-hooks/immutability
        editor.model = importDiagram(body) as UMLModel
        editor.fitView()
        if (preview) closePreview()
        if (summary) {
          const label =
            summary.description.trim() ||
            summary.name.trim() ||
            (summary.seq !== undefined ? `v${summary.seq}` : "this version")
          toast.success(t.restoredSnack(label), { autoClose: 4000 })
        }
      } catch (err) {
        log.error("Restore failed", err as Error)
        toast.error(t.restoreFailed)
      }
    },
    [editor, diagramId, versions, preview, resolveBody, closePreview, restoreMutation, t]
  )

  const handleConfirmedRestore = useCallback(
    // eslint-disable-next-line react-hooks/immutability
    async (versionId: string) => {
      if (!editor || !diagramId) return
      try {
        const baseline = prePreviewFingerprintRef.current ?? structuralFingerprint(editor.model)
        const targetBody = await resolveBody(versionId)
        const dirty = baseline !== structuralFingerprint(targetBody)
        if (!dirty) {
          await performRestore(versionId)
          return
        }
        openModal("CONFIRM_RESTORE", {
          version: versions.find((v) => v.id === versionId) ?? null,
          onConfirm: async () => {
            await performRestore(versionId)
          },
        })
      } catch (err) {
        log.error("Restore preflight failed", err as Error)
        toast.error(t.restoreFailed)
      }
    },
    [editor, diagramId, versions, resolveBody, performRestore, openModal, t]
  )

  const handleVersionSaved = useCallback(() => {}, [])

  const handleExitPreview = useCallback(() => {
    closePreview()
  }, [closePreview])

  const banner = useMemo(() => {
    if (!preview || !diagramId) return null
    return (
      <div
        className="pointer-events-none absolute right-0 left-0 z-5 flex justify-center px-4 *:pointer-events-auto"
        style={{ top: "calc(var(--safe-area-inset-top, 0px) + 64px)" }}
      >
        <VersionPreviewBanner
          containerWidth={canvasColumnWidth}
          diagramId={diagramId}
          canRestore={canRestoreFromPreview}
          onExitPreview={handleExitPreview}
          onRestore={handleConfirmedRestore}
        />
      </div>
    )
  }, [
    preview,
    diagramId,
    canvasColumnWidth,
    canRestoreFromPreview,
    handleExitPreview,
    handleConfirmedRestore,
  ])

  if (!diagramId || !diagram) {
    return <ErrorPage message="Diagram not found." buttonLabel="All diagrams" withChrome={false} />
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div ref={canvasColumnRef} className="relative h-full min-w-0 flex-1">
          <div ref={containerRef} className="h-full w-full" />
          {banner}
          <VersionDrawer
            diagramId={diagramId}
            onConfirmedRestore={handleConfirmedRestore}
            onVersionSaved={handleVersionSaved}
            onPreview={openPreview}
          />
        </div>
      </div>
    </div>
  )
}
