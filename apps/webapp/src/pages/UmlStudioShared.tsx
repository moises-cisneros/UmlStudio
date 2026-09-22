import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useEditorContext } from "@/contexts"
import {
  UmlStudioEditor,
  UmlStudioMode,
  collabColorFromName,
  importDiagram,
  DEFAULT_LABELS,
  SPANISH_LABELS,
  type UmlStudioOptions,
  type UMLModel,
} from "@umlstudio/core"
import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "react-toastify"
import { DiagramView } from "@/types"
import { WebSocketManager } from "@/services/WebSocketManager"
import { createDiagramAutosaver, type DiagramAutosaver } from "@/services/createDiagramAutosaver"
import { selectScopedPreview, useVersionStore } from "@/stores/useVersionStore"
import { useDiagramSeed } from "@/hooks/useDiagramSeed"
import { DiagramApiClient } from "@/services/DiagramApiClient"
import { prefetchVersions } from "@/queries/versionQueries"
import { useVersionRepositoryKind } from "@/contexts/VersionRepositoryContext"
import { useRestoreVersionMutation } from "@/queries/versionMutations"
import { applyControlEventToCache } from "@/queries/versionCacheEvents"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { UndoRestoreToast, VersionDrawer, VersionPreviewBanner } from "@/components/versioning"
import { useVersioningTranslation } from "@/components/versioning/strings"
import { structuralFingerprint } from "@/lib/version/predicates"
import { useVersionPreviewUrlSync } from "@/hooks/useVersionPreviewUrlSync"
import { useElementWidth } from "@/hooks/useElementWidth"
import { useFlushOnUnload } from "@/hooks/useFlushOnUnload"
import { useEditorShortcuts } from "@/hooks/useEditorShortcuts"
import { log } from "@/logger"
import { addSharedDiagramEntry } from "@/utils/sharedDiagramStorage"
import { useTranslation } from "@/i18n"
import { currentAccessToken, useAuthStore } from "@/stores/useAuthStore"

const route = getRouteApi("/shared/$diagramId")

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError"
}

export const UmlStudioShared: React.FC = () => {
  const { diagramId } = route.useParams()
  const { view: viewType, version: previewFromUrl } = route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const kind = useVersionRepositoryKind()
  const { setEditor, editor } = useEditorContext()
  const { locale, t: tr } = useTranslation()
  const t = useVersioningTranslation()
  const [diagramTitle, setDiagramTitle] = useState<string | null>(() =>
    editor ? editor.getDiagramMetadata().diagramTitle || null : null
  )
  const [prevEditor, setPrevEditor] = useState<typeof editor>(editor)

  if (editor !== prevEditor) {
    setPrevEditor(editor)
    setDiagramTitle(editor ? editor.getDiagramMetadata().diagramTitle || null : null)
  }

  useDocumentTitle(diagramTitle)

  useEffect(() => {
    if (!editor) return
    const subscriptionId = editor.subscribeToDiagramNameChange((title) =>
      setDiagramTitle(title || null)
    )
    return () => editor.unsubscribe(subscriptionId)
  }, [editor])

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

  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasColumnRef = useRef<HTMLDivElement | null>(null)
  const canvasColumnWidth = useElementWidth(canvasColumnRef)
  const wsManagerRef = useRef<WebSocketManager | null>(null)
  const autosaverRef = useRef<DiagramAutosaver | null>(null)
  const diagramIsUpdatedRef = useRef(false)
  const editorRef = useRef<UmlStudioEditor | null>(null)
  const restoredDuringPreviewRef = useRef(false)
  const prePreviewFingerprintRef = useRef<string | null>(null)
  const lifecycleKeyRef = useRef<string | null>(null)
  const [canRestoreFromPreview, setCanRestoreFromPreview] = useState(false)
  const authUser = useAuthStore((s) => s.user)
  const collaborationUser = useMemo(() => {
    if (!authUser) return null
    return {
      id: authUser.id,
      name: authUser.name,
      color: authUser.color ?? collabColorFromName(authUser.name),
      ...(authUser.avatar ? { imageUrl: authUser.avatar } : {}),
    }
  }, [authUser])

  const preview = useVersionStore((s) => selectScopedPreview(s, diagramId))
  const restoreMutation = useRestoreVersionMutation(kind, diagramId)
  const { openPreview, closePreview } = useVersionPreviewUrlSync(
    kind,
    diagramId,
    previewFromUrl,
    Boolean(editor)
  )

  useEditorShortcuts(diagramId)

  useFlushOnUnload({
    diagramId,
    getModel: () => editorRef.current?.model,
    isDirty: () => diagramIsUpdatedRef.current,
  })

  useEffect(() => {
    const nextLifecycleKey = `${diagramId ?? ""}:${viewType ?? ""}`
    if (lifecycleKeyRef.current === nextLifecycleKey) return
    lifecycleKeyRef.current = nextLifecycleKey
    diagramIsUpdatedRef.current = false
    restoredDuringPreviewRef.current = false
  }, [diagramId, viewType])

  useEffect(() => {
    if (viewType) return
    toast.error(tr.auth.invalidViewType)
    navigate({ to: "/" })
  }, [viewType, tr, navigate])

  const isCollaborationView = viewType === DiagramView.EDITOR
  const isAuthenticated = authUser !== null

  useEffect(() => {
    if (!viewType || isAuthenticated) return
    toast.error(tr.auth.authRequiredShared)
    navigate({ to: "/", replace: true })
  }, [viewType, isAuthenticated, tr, navigate])

  const {
    diagram,
    error: seedError,
    isPending: seedPending,
  } = useDiagramSeed(diagramId, Boolean(diagramId) && Boolean(viewType) && isAuthenticated)

  useEffect(() => {
    if (!seedError) return
    log.error("Failed to initialize diagram", seedError)
    toast.error("Failed to initialize diagram")
    navigate({ to: "/" })
  }, [seedError, navigate])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !diagramId || !viewType || !diagram || !collaborationUser) return

    let instance: UmlStudioEditor | null = null
    let modelChangeSubscriptionId: number | null = null
    const peerRefreshAbort = new AbortController()

    try {
      log.debug("Initializing UmlStudio editor with view type:", viewType)
      addSharedDiagramEntry(diagramId, { lastSharedView: viewType })
      log.debug("Fetched diagram", {
        diagramId,
        nodeCount: diagram.nodes?.length ?? 0,
        edgeCount: diagram.edges?.length ?? 0,
      })

      const baseLabels = locale === "es" ? SPANISH_LABELS : DEFAULT_LABELS
      const editorOptions: UmlStudioOptions = {
        model: diagram,
        labels: {
          ...baseLabels,
          attributes: tr.agent.attributes || baseLabels.attributes,
          methods: tr.agent.methods || baseLabels.methods,
        },
        collaborationEnabled: true,
        collaboration: {
          enabled: true,
          user: collaborationUser,
          showPresence: false,
          showCursors: true,
          showSelectionHighlights: true,
          showFollow: true,
          // @ts-expect-error custom locked callback
          onLockedElementAccess: (_elementId: string, lockUserName: string) => {
            const message =
              (
                baseLabels as unknown as { elementLockedBy?: (name: string) => string }
              ).elementLockedBy?.(lockUserName) ??
              `Este elemento está siendo editado por ${lockUserName}`
            toast.warn(message)
          },
        },
      }

      if (viewType === DiagramView.LECTOR) {
        editorOptions.mode = UmlStudioMode.Modelling
        editorOptions.readonly = true
      } else {
        editorOptions.mode = UmlStudioMode.Modelling
        editorOptions.readonly = false
      }

      instance = new UmlStudioEditor(container, editorOptions)
      editorRef.current = instance
      setEditor(instance)

      if ([DiagramView.EDITOR, DiagramView.LECTOR].includes(viewType)) {
        wsManagerRef.current = new WebSocketManager(
          diagramId,
          instance,
          () => toast.error("WebSocket error"),
          { mode: "shared", getToken: currentAccessToken }
        )
        wsManagerRef.current.startConnection()
        wsManagerRef.current.onControl((event) => {
          applyControlEventToCache(queryClient, diagramId, event)
          if (event.type === "VERSION_DELETED") {
            const previewing = selectScopedPreview(useVersionStore.getState(), diagramId)
            if (previewing?.versionId === event.versionId) closePreview()
          }
          if (event.type === "VERSION_RESTORED") {
            const state = useVersionStore.getState()
            const isLocalRestore =
              state.pendingRestoreFromId === event.restoredFromVersionId ||
              state.undoRestore?.restoredFromVersionId === event.restoredFromVersionId
            if (!isLocalRestore) {
              const actor = event.actor || "A collaborator"
              DiagramApiClient.fetchDiagram(diagramId, {
                signal: peerRefreshAbort.signal,
              })
                .then((next) => {
                  if (!instance) return
                  if (selectScopedPreview(useVersionStore.getState(), diagramId) !== null) {
                    return
                  }
                  instance.model = next
                })
                .catch((err) => {
                  if (isAbort(err)) return
                  toast.error(`${actor} restored a version but we couldn't refresh.`, {
                    toastId: "version-restored-refetch-failed",
                  })
                })
              toast.info(t.collaboratorRestoredTitle(actor), {
                toastId: "version-restored-by-collaborator",
                autoClose: 4000,
              })
            }
          }
        })
      }

      const editorInstance = instance
      const autosaver = createDiagramAutosaver({
        diagramId,
        getModel: () => editorInstance.model,
        isPaused: () => selectScopedPreview(useVersionStore.getState(), diagramId) !== null,
        collaboration: isCollaborationView,
        onSaved: () => {
          diagramIsUpdatedRef.current = false
        },
        onError: () => toast.error("Failed to sync changes"),
      })
      autosaverRef.current = autosaver

      modelChangeSubscriptionId = instance.subscribeToModelChange(() => {
        if (selectScopedPreview(useVersionStore.getState(), diagramId)) return
        diagramIsUpdatedRef.current = true
        autosaver.schedule()
      })

      void prefetchVersions(queryClient, kind, diagramId)
    } catch (err) {
      log.error("Failed to initialize diagram", err)
      toast.error("Failed to initialize diagram")
      navigate({ to: "/" })
    }

    return () => {
      peerRefreshAbort.abort()
      setEditor(undefined)
      wsManagerRef.current?.cleanup()
      if (instance && selectScopedPreview(useVersionStore.getState(), diagramId) !== null) {
        instance.setPreviewMode(false)
        useVersionStore.getState().exitPreview()
      }
      void autosaverRef.current?.flush()
      autosaverRef.current?.dispose()
      autosaverRef.current = null
      if (instance) {
        if (modelChangeSubscriptionId !== null) {
          instance.unsubscribe(modelChangeSubscriptionId)
        }
      }
      instance?.destroy()
      editorRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    closePreview,
    collaborationUser,
    diagram,
    diagramId,
    isCollaborationView,
    kind,
    navigate,
    queryClient,
    setEditor,
    viewType,
  ])

  const baseReadonly = viewType === DiagramView.LECTOR

  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => {
    if (!editor) return
    const abort = new AbortController()
    if (preview) {
      if (prePreviewFingerprintRef.current === null) {
        prePreviewFingerprintRef.current = structuralFingerprint(editor.model)
      }
      setCanRestoreFromPreview(
        prePreviewFingerprintRef.current !== structuralFingerprint(preview.body)
      )
      editor.setPreviewMode(true)
      try {
        // eslint-disable-next-line react-hooks/immutability
        editor.model = importDiagram(preview.body) as UMLModel
        editor.setReadonly(true)
        editor.fitView()
      } catch (err) {
        editor.setPreviewMode(false)
        prePreviewFingerprintRef.current = null
        log.error("Failed to apply previewed snapshot", err)
        const isSchemaError = err instanceof Error && /schema|version|import/i.test(err.message)
        toast.error(isSchemaError ? t.failureSchemaUnsupported : t.previewFailed)
      }
    } else {
      editor.setReadonly(baseReadonly)
      prePreviewFingerprintRef.current = null
      if (!diagramId) return

      if (restoredDuringPreviewRef.current) {
        restoredDuringPreviewRef.current = false
        editor.setPreviewMode(false)
        DiagramApiClient.fetchDiagram(diagramId, { signal: abort.signal })
          .then((head) => {
            editor.model = importDiagram(head) as UMLModel
            editor.fitView()
          })
          .catch((err) => {
            if (isAbort(err)) return
            log.error("Failed to reload diagram after restore", err)
            toast.error(t.failureSchemaUnsupported)
          })
      } else {
        editor.setPreviewMode(false)
        editor.fitView()
      }
    }
    return () => abort.abort()
  }, [preview, editor, diagramId, baseReadonly, t.failureSchemaUnsupported, t.previewFailed])

  const handleVersionSaved = useCallback((headRev?: number) => {
    autosaverRef.current?.setHeadRev(headRev)
    diagramIsUpdatedRef.current = false
  }, [])

  const handleExitPreview = useCallback(() => {
    closePreview()
  }, [closePreview])

  const handleRestore = useCallback(
    async (versionId: string) => {
      if (!diagramId || !editor) return
      const previewing = selectScopedPreview(useVersionStore.getState(), diagramId) !== null
      if (previewing) {
        restoredDuringPreviewRef.current = true
        editor.setPreviewMode(false)
      }
      const liveBody = editor.model
      try {
        const { headRev } = await restoreMutation.mutateAsync({
          versionId,
          currentBody: liveBody,
        })
        handleVersionSaved(headRev)
        if (previewing) closePreview()
      } catch {
        restoredDuringPreviewRef.current = false
        toast.error(t.restoreFailed)
      }
    },
    [diagramId, editor, handleVersionSaved, restoreMutation, closePreview, t.restoreFailed]
  )

  const isLoading = seedPending || !editor

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div ref={canvasColumnRef} className="relative h-full min-w-0 flex-1">
          {isLoading && (
            <div className="absolute inset-0 z-1 flex items-center justify-center">
              Loading diagram…
            </div>
          )}
          <div className={`h-full w-full ${isLoading ? "invisible" : ""}`} ref={containerRef} />
          {!isLoading && preview && diagramId && (
            <div className="pointer-events-none absolute left-0 right-0 top-3 z-5 flex justify-center px-4 *:pointer-events-auto">
              <VersionPreviewBanner
                containerWidth={canvasColumnWidth}
                diagramId={diagramId}
                canRestore={canRestoreFromPreview}
                onExitPreview={handleExitPreview}
                onRestore={handleRestore}
              />
            </div>
          )}
          {diagramId && (
            <VersionDrawer
              diagramId={diagramId}
              onVersionSaved={handleVersionSaved}
              onConfirmedRestore={handleRestore}
              onPreview={openPreview}
            />
          )}
        </div>
      </div>
      <UndoRestoreToast />
    </div>
  )
}
