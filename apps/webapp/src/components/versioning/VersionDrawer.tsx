import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@umlstudio/ui/components/tooltip"
import { Button } from "@umlstudio/ui/components/button"
import { Textarea } from "@umlstudio/ui/components/textarea"
import { Spinner } from "@umlstudio/ui/components/spinner"
import { Skeleton } from "@umlstudio/ui/components/skeleton"
import { GitBranch, GitCommitHorizontal, SlidersHorizontal, X } from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import { toast } from "react-toastify"
import { useQueryClient } from "@tanstack/react-query"
import { useEditorContext, useModalContext } from "@/contexts"
import { selectScopedPreview, useVersionStore } from "@/stores/useVersionStore"
import { fetchVersionBody, useVersionsQuery } from "@/queries/versionQueries"
import { useCreateVersionMutation, useRestoreVersionMutation } from "@/queries/versionMutations"
import { ApiError } from "@/services/DiagramApiClient"
import { getVersionRepository } from "@/services/versionRepository"
import { useVersionRepositoryKind } from "@/contexts/VersionRepositoryContext"
import type { PendingVersion } from "@/types"
import { MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH, useVersioningTranslation } from "./strings"
import { relativeTime } from "./relativeTime"
import { CurrentVersionRow } from "./CurrentVersionRow"
import { VersionListItem } from "./VersionListItem"
import { AutoGroupRow } from "./AutoGroupRow"
import { TEXT_PRIMARY } from "./theme"
import { structuralFingerprint, isNamedVersion } from "@/lib/version/predicates"
import { groupUnnamedRuns } from "./utils"

const EMPTY_VERSIONS: readonly PendingVersion[] = Object.freeze([])

interface Props {
  diagramId: string
  onVersionSaved?: (headRev?: number) => void
  onConfirmedRestore?: (versionId: string) => Promise<void> | void
  onPreview?: (versionId: string) => void
  onClose?: () => void
}

export const VersionSidebarBody: FC<Props> = ({
  diagramId,
  onVersionSaved,
  onConfirmedRestore,
  onPreview,
  onClose,
}) => {
  const t = useVersioningTranslation()
  const kind = useVersionRepositoryKind()
  const repo = getVersionRepository(kind)
  const isLocal = kind === "local"
  const MAX_VERSIONS = repo.cap
  const queryClient = useQueryClient()
  const versionsQuery = useVersionsQuery(kind, diagramId, {
    refetchOnFocus: true,
  })
  const serverVersions = versionsQuery.data?.versions ?? EMPTY_VERSIONS
  const total = versionsQuery.data?.total
  const loadFailed = versionsQuery.isError && serverVersions.length === 0
  const errorCode = !loadFailed
    ? null
    : versionsQuery.error instanceof ApiError
      ? versionsQuery.error.code
      : "INTERNAL"
  const [lastLocalSaveId, setLastLocalSaveId] = useState<string | null>(null)
  const createMutation = useCreateVersionMutation(kind, diagramId, {
    onCommitted: (summary) => {
      setLastLocalSaveId(summary.id)
      onVersionSaved?.(summary.headRev)
    },
  })
  const restoreMutation = useRestoreVersionMutation(kind, diagramId)
  const enterPreview = useVersionStore((s) => s.enterPreview)
  const previewState = useVersionStore((s) => selectScopedPreview(s, diagramId))

  const pendingRow = useMemo<PendingVersion | null>(() => {
    const vars = createMutation.variables
    if (!vars || (!createMutation.isPending && !createMutation.isError)) {
      return null
    }
    return {
      id: "pending-create",
      diagramId,
      name: vars.name ?? "",
      description: vars.description ?? "",
      createdAt: new Date(createMutation.submittedAt).toISOString(),
      kind: "user",
      librarySchemaVersion: vars.body.version,
      ...(createMutation.isPending ? { pending: true as const } : { failed: true }),
    }
  }, [
    createMutation.variables,
    createMutation.isPending,
    createMutation.isError,
    createMutation.submittedAt,
    diagramId,
  ])
  const versions = useMemo<readonly PendingVersion[]>(
    () => (pendingRow ? [pendingRow, ...serverVersions] : serverVersions),
    [pendingRow, serverVersions]
  )

  const { editor } = useEditorContext()
  const { openModal } = useModalContext()

  const [draft, setDraft] = useState("")
  const submitting = createMutation.isPending
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const [isEmptyDiagram, setIsEmptyDiagram] = useState(true)
  useEffect(() => {
    if (!editor) return
    const compute = () =>
      setIsEmptyDiagram(
        (editor.model.nodes?.length ?? 0) === 0 && (editor.model.edges?.length ?? 0) === 0
      )
    compute()
    const subId = editor.subscribeToModelChange(compute)
    return () => editor.unsubscribe(subId)
  }, [editor])

  const [showAutosaves, setShowAutosaves] = useState(true)
  const filteredVersions = showAutosaves ? versions : versions.filter(isNamedVersion)
  const groupedVersions = groupUnnamedRuns(filteredVersions)

  const latestVersion = versions[0]
  const sectionSubtitle = latestVersion
    ? t.lastVersion(relativeTime(latestVersion.createdAt))
    : t.noVersionYet

  const latestSavedVersion = versions.find((v) => !v.pending && !v.failed)
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(true)
  const [baselineVersionId, setBaselineVersionId] = useState<string | null | undefined>(undefined)
  const baselineResolved = baselineVersionId === (latestSavedVersion?.id ?? null)
  const initialListLoaded = !versionsQuery.isPending

  const latestSavedVersionId = latestSavedVersion?.id ?? null
  const [prevVersionId, setPrevVersionId] = useState(latestSavedVersionId)
  if (latestSavedVersionId !== prevVersionId) {
    setPrevVersionId(latestSavedVersionId)
    if (!latestSavedVersion) {
      setSavedFingerprint(null)
      setHasChanges(true)
      setBaselineVersionId(null)
    } else if (editor && lastLocalSaveId === latestSavedVersion.id) {
      setSavedFingerprint(structuralFingerprint(editor.model))
      setHasChanges(false)
      setBaselineVersionId(latestSavedVersion.id)
    }
  }

  const [prevFingerprint, setPrevFingerprint] = useState(savedFingerprint)
  if (savedFingerprint !== prevFingerprint) {
    setPrevFingerprint(savedFingerprint)
    if (savedFingerprint === null) {
      setHasChanges(true)
    } else if (editor) {
      setHasChanges(structuralFingerprint(editor.model) !== savedFingerprint)
    }
  }

  useEffect(() => {
    if (!editor || !latestSavedVersion) return
    if (lastLocalSaveId === latestSavedVersion.id) return

    let stale = false
    const resolvingVersionId = latestSavedVersion.id
    fetchVersionBody(queryClient, kind, latestSavedVersion.diagramId, resolvingVersionId)
      .then((body) => {
        if (!stale) setSavedFingerprint(structuralFingerprint(body))
      })
      .catch(() => {
        if (!stale) {
          setSavedFingerprint(null)
          setHasChanges(true)
        }
      })
      .finally(() => {
        if (!stale) setBaselineVersionId(resolvingVersionId)
      })
    return () => {
      stale = true
    }
  }, [editor, latestSavedVersion, queryClient, kind, lastLocalSaveId])

  useEffect(() => {
    if (!editor || savedFingerprint === null) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const recompute = () => {
      setHasChanges(structuralFingerprint(editor.model) !== savedFingerprint)
    }
    const scheduleRecompute = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(recompute, 200)
    }
    const subId = editor.subscribeToModelChange(scheduleRecompute)
    return () => {
      if (timer) clearTimeout(timer)
      editor.unsubscribe(subId)
    }
  }, [editor, savedFingerprint])

  const canSave =
    Boolean(editor) &&
    initialListLoaded &&
    baselineResolved &&
    hasChanges &&
    previewState === null &&
    !isEmptyDiagram

  const handleCreate = (saveableOverride?: boolean) => {
    const saveable = saveableOverride ?? canSave
    if (!editor || submitting || !saveable) return
    void repo.requestPersistence?.()
    const description = draft.trim()
    const name = description ? description.split("\n")[0]!.slice(0, MAX_NAME_LENGTH) : ""
    createMutation.mutate(
      { body: editor.model, name, description: description || undefined },
      {
        onSuccess: () => setDraft(""),
        onError: (err) => {
          if (err instanceof ApiError) {
            if (err.code === "BODY_TOO_LARGE") toast.error(err.message)
            else toast.error(t.failureToCreate)
          } else {
            toast.error(t.failureToCreate)
          }
        },
      }
    )
  }

  const saveRequest = useVersionStore((s) => s.saveRequestByDiagram[diagramId] ?? 0)
  const clearSaveRequest = useVersionStore((s) => s.clearSaveRequest)
  const handledSaveRequestRef = useRef(0)
  const runSaveRequestRef = useRef<() => void>(() => {})
  useEffect(() => {
    runSaveRequestRef.current = () => {
      const dirty =
        savedFingerprint === null ||
        (editor !== undefined && structuralFingerprint(editor.model) !== savedFingerprint)
      const saveable = Boolean(editor) && dirty && previewState === null && !isEmptyDiagram
      if (saveable) {
        void handleCreate(saveable)
      } else if (editor && !isEmptyDiagram && previewState === null) {
        toast.info(t.noChangesToSave)
      }
    }
  })

  useEffect(() => {
    if (saveRequest === 0) {
      handledSaveRequestRef.current = 0
      return
    }
    if (saveRequest <= handledSaveRequestRef.current || !initialListLoaded || !baselineResolved) {
      return
    }
    handledSaveRequestRef.current = saveRequest
    clearSaveRequest(diagramId)
    runSaveRequestRef.current()
  }, [saveRequest, initialListLoaded, baselineResolved, clearSaveRequest, diagramId])

  const handlePreview = useCallback(
    async (versionId: string) => {
      if (onPreview) {
        onPreview(versionId)
        return
      }
      if (!editor) return
      try {
        const body = await fetchVersionBody(queryClient, kind, diagramId, versionId)
        enterPreview(diagramId, versionId, body)
      } catch {
        toast.error(t.previewFailed)
      }
    },
    [editor, onPreview, enterPreview, diagramId, queryClient, kind, t.previewFailed]
  )

  const handleRestore = useCallback(
    async (versionId: string) => {
      if (!editor) return
      if (onConfirmedRestore) {
        try {
          await onConfirmedRestore(versionId)
        } catch {
          toast.error(t.restoreFailed)
        }
        return
      }
      try {
        const { headRev } = await restoreMutation.mutateAsync({
          versionId,
          currentBody: editor.model,
        })
        onVersionSaved?.(headRev)
      } catch {
        toast.error(t.restoreFailed)
      }
    },
    [editor, restoreMutation, onVersionSaved, onConfirmedRestore, t.restoreFailed]
  )

  const handleDelete = useCallback(
    (versionId: string) => {
      const version = versions.find((v) => v.id === versionId) ?? null
      openModal("DELETE_VERSION", { diagramId, versionId, version, kind })
    },
    [openModal, diagramId, versions, kind]
  )

  const totalDisplay = typeof total === "number" ? total : versions.length

  const versionNumberById = useMemo(() => {
    const map = new Map<string, number>()
    const saved = versions.filter((v) => !v.pending && !v.failed)
    const fallbackTop = typeof total === "number" ? total : saved.length
    saved.forEach((v, i) => {
      if (typeof v.seq === "number") map.set(v.id, v.seq)
      else map.set(v.id, fallbackTop - i)
    })
    return map
  }, [versions, total])

  const handleComposerKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void handleCreate()
    }
  }

  const closeDrawer = useVersionStore((s) => s.closeDrawer)

  return (
    <div
      className="flex h-full flex-col bg-transparent select-none"
      style={{ color: TEXT_PRIMARY }}
      role="complementary"
      aria-label={t.drawerTitle}
    >
      {/* UML Compartment 1: Panel Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-(--uml-node-header-border) bg-[var(--uml-node-header-bg)]">
        <div className="flex items-center gap-2 min-w-0">
          <GitBranch className="size-4 text-brand-dodger-blue shrink-0" aria-hidden="true" />
          <span className="text-sm font-semibold tracking-tight text-(--uml-node-header-title,var(--umlstudio-foreground)) truncate">
            {t.drawerTitle}
          </span>
          <span className="rounded-full bg-(--color-palette-dodger-blue)/15 px-2 py-0.5 text-[11px] font-mono font-semibold text-[var(--color-palette-dodger-blue)] shrink-0">
            {totalDisplay}
            <span className="font-normal opacity-70"> / {MAX_VERSIONS}</span>
          </span>
        </div>

        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                onClick={() => setShowAutosaves((v) => !v)}
                aria-label={showAutosaves ? t.hideAutosaves : t.showAutosaves}
                aria-pressed={showAutosaves}
                className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-[var(--umlstudio-text-muted)] hover:text-[var(--umlstudio-foreground)] hover:bg-[var(--umlstudio-surface-hover)] transition-colors"
              >
                <SlidersHorizontal className="size-3.5" aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent>{showAutosaves ? t.hideAutosaves : t.showAutosaves}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                onClick={onClose ?? (() => closeDrawer(diagramId))}
                className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-[var(--umlstudio-text-muted)] hover:text-[var(--umlstudio-foreground)] hover:bg-[var(--umlstudio-surface-hover)] transition-colors"
                aria-label={t.closePanel}
              >
                <X className="size-4" aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent>{t.closePanel}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* UML Compartment 2: Checkpoint Composer */}
      {previewState === null && (
        <div className="p-3 border-b border-[var(--uml-node-header-border)] bg-[var(--uml-node-header-bg)] select-text">
          <div className="flex items-center justify-between mb-1.5">
            <span
              className="text-[11px] font-medium font-mono uppercase tracking-wider px-2 py-0.5 rounded shrink-0"
              style={{
                backgroundColor: "var(--uml-node-stereotype-bg)",
                color: "var(--uml-node-stereotype-color)",
                border:
                  "1px solid color-mix(in srgb, var(--uml-node-stereotype-color) 35%, transparent)",
              }}
            >
              {t.newCheckpointStereotype}
            </span>
            <span className="text-[11px] font-mono text-[var(--umlstudio-text-muted)]">
              {t.ctrlEnterHint}
            </span>
          </div>

          <Textarea
            rows={2}
            placeholder={t.createPlaceholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
            onKeyDown={handleComposerKeyDown}
            ref={composerRef}
            aria-label={t.createPlaceholder}
            className="mb-2 resize-none px-2.5 py-1.5 text-xs placeholder:text-[var(--umlstudio-text-muted)] focus-visible:border-[var(--color-palette-dodger-blue)] bg-[var(--uml-node-bg)] text-[var(--umlstudio-foreground)] border-[var(--uml-node-border)]"
          />

          <div className="flex items-center justify-between">
            <span
              className="text-[11px] text-[var(--umlstudio-text-muted)] truncate max-w-[210px]"
              title={sectionSubtitle}
            >
              {sectionSubtitle}
            </span>

            <Button
              type="button"
              size="sm"
              onClick={() => handleCreate()}
              disabled={submitting || !canSave}
              title={
                !canSave && previewState !== null
                  ? t.exitPreview
                  : !canSave && isEmptyDiagram
                    ? t.emptyDiagramTooltip
                    : !canSave && !hasChanges
                      ? t.noChangesToSave
                      : undefined
              }
              className="h-7 px-3 text-xs font-semibold bg-[var(--color-palette-dodger-blue)] hover:brightness-110 text-white disabled:opacity-40"
            >
              {submitting ? (
                <Spinner className="size-3 mr-1.5" />
              ) : (
                <GitCommitHorizontal className="size-3.5 mr-1.5" />
              )}
              {t.createButton}
            </Button>
          </div>
        </div>
      )}

      {/* UML Compartment 3: Scrollable Versions List */}
      <div className="flex-1 overflow-y-auto p-3">
        <CurrentVersionRow
          diagramId={diagramId}
          hasChanges={hasChanges}
          latestSavedVersion={latestSavedVersion}
        />

        {loadFailed ? (
          <div className="p-4 rounded border border-[var(--umlstudio-danger)]/40 bg-[var(--umlstudio-danger)]/10 text-center">
            <p className="text-xs font-medium" style={{ color: "var(--umlstudio-danger)" }}>
              {errorCode === "REDIS_UNAVAILABLE" ? t.failureRedis : t.failureToLoad}
            </p>
          </div>
        ) : versionsQuery.isPending && versions.length === 0 ? (
          <ul className="m-0 list-none p-0 space-y-3">
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                className="rounded-[var(--umlstudio-chrome-radius-md)] border border-[var(--umlstudio-chrome-border)] p-3 space-y-2 bg-black/10"
              >
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="size-5 rounded" />
                </div>
                <div className="flex gap-3">
                  <Skeleton className="h-10 w-16 rounded shrink-0" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : versions.length === 0 ? (
          <div className="px-4 py-8 text-center rounded border border-dashed border-[var(--umlstudio-chrome-border)]">
            <p className="mb-3 text-xs text-[var(--umlstudio-chrome-text-muted)]">
              {isLocal ? t.emptyBodyLocal : t.emptyBody}
            </p>
            {isLocal && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleCreate()}
                disabled={submitting || !canSave}
                className="text-xs"
              >
                {t.emptyCtaLocal}
              </Button>
            )}
          </div>
        ) : (
          <ul className="m-0 list-none p-0" role="list">
            {groupedVersions.map((entry) =>
              entry.kind === "auto-group" ? (
                <AutoGroupRow
                  key={entry.first.id}
                  group={entry}
                  diagramId={diagramId}
                  onPreview={handlePreview}
                  onRestore={handleRestore}
                  onDelete={handleDelete}
                  previewingVersionId={previewState?.versionId ?? null}
                  versionNumberById={versionNumberById}
                  latestSavedId={latestSavedVersion?.id}
                  hasUnsavedChanges={hasChanges}
                />
              ) : (
                <VersionListItem
                  key={entry.version.id}
                  diagramId={diagramId}
                  version={entry.version}
                  versionNumber={versionNumberById.get(entry.version.id)}
                  isPreviewing={previewState?.versionId === entry.version.id}
                  canRestore={entry.version.id !== latestSavedVersion?.id || hasChanges}
                  onPreview={handlePreview}
                  onRestore={handleRestore}
                  onDelete={handleDelete}
                />
              )
            )}

            {versionsQuery.hasNextPage && (
              <li className="list-none pt-2 text-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    versionsQuery.fetchNextPage({ throwOnError: true }).catch(() => {
                      toast.error("Error al cargar más versiones.")
                    })
                  }}
                  disabled={versionsQuery.isFetchingNextPage}
                  className="text-xs text-[var(--umlstudio-chrome-text-muted)] hover:text-[var(--umlstudio-chrome-text)]"
                >
                  {t.loadOlder}
                </Button>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}

export const VersionRail: FC<Props> = () => null

export const VersionDrawer: FC<Props> = ({
  diagramId,
  onVersionSaved,
  onConfirmedRestore,
  onPreview,
}) => {
  const t = useVersioningTranslation()
  const open = useVersionStore((s) => Boolean(s.drawerOpenByDiagram[diagramId]))
  const closeDrawer = useVersionStore((s) => s.closeDrawer)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        !target.closest("[data-version-history-trigger]")
      ) {
        closeDrawer(diagramId)
      }
    }

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        closeDrawer(diagramId)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("touchstart", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("touchstart", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, diagramId, closeDrawer])

  if (!open) return null

  return (
    <aside
      ref={panelRef}
      role="complementary"
      aria-label={t.drawerTitle}
      className="umlstudio-glass flex flex-col absolute top-[calc(48px+var(--umlstudio-chrome-gap,8px))] right-3 bottom-3 z-30 w-[420px] max-w-[calc(100%-24px)] rounded-[var(--umlstudio-chrome-radius-lg)] border border-[var(--umlstudio-chrome-border)] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-right-4 duration-200"
      style={{
        backgroundColor: "var(--umlstudio-chrome-glass-solid, var(--uml-node-bg, #ffffff))",
        color: "var(--umlstudio-chrome-text, var(--umlstudio-foreground))",
      }}
      onPointerDownCapture={(e) => e.stopPropagation()}
      onMouseDownCapture={(e) => e.stopPropagation()}
      onTouchStartCapture={(e) => e.stopPropagation()}
      onWheelCapture={(e) => e.stopPropagation()}
    >
      <VersionSidebarBody
        diagramId={diagramId}
        onVersionSaved={onVersionSaved}
        onConfirmedRestore={onConfirmedRestore}
        onPreview={onPreview}
        onClose={() => closeDrawer(diagramId)}
      />
    </aside>
  )
}
