import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@umlstudio/ui/components/dropdown-menu"
import { Button } from "@umlstudio/ui/components/button"
import { Clock, Copy, Eye, MoreHorizontal, Pencil, RotateCcw, Trash2, Check } from "lucide-react"
import { VersionThumbnail } from "./VersionThumbnail"
import { Fragment, useState, useRef, type FC, type KeyboardEvent, type ReactNode } from "react"
import { toast } from "react-toastify"
import { cn } from "@umlstudio/ui/lib/utils"
import { Textarea } from "@umlstudio/ui/components/textarea"
import { log } from "@/logger"
import type { PendingVersion } from "@/types"
import { useEditVersionInfoMutation } from "@/queries/versionMutations"
import { getVersionRepository } from "@/services/versionRepository"
import { useVersionRepositoryKind } from "@/contexts/VersionRepositoryContext"
import { MAX_DESCRIPTION_LENGTH, useVersioningTranslation } from "./strings"
import { relativeTime } from "./relativeTime"
import { isNamedVersion } from "@/lib/version/predicates"

interface ViewProps {
  version: PendingVersion
  thumbnail?: ReactNode
  versionNumber?: number
  isPreviewing: boolean
  canRestore: boolean
  hasPermalink?: boolean
  onPreview: (versionId: string) => void
  onRestore: (versionId: string) => void
  onDelete: (versionId: string) => void
  onEditDescription: (versionId: string, description: string) => Promise<void>
  onCopyLink: (versionId: string) => void
  className?: string
  ref?: React.Ref<HTMLLIElement>
}

export function VersionListItemView({
  version,
  thumbnail,
  versionNumber,
  isPreviewing,
  canRestore,
  hasPermalink = true,
  onPreview,
  onRestore,
  onDelete,
  onEditDescription,
  onCopyLink,
  className,
  ref,
}: ViewProps) {
  const t = useVersioningTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(version.description ?? "")
  const cancellingRef = useRef(false)

  const closeMenu = () => setMenuOpen(false)

  const startEditing = () => {
    setDraft(version.description ?? "")
    setEditing(true)
  }

  const submitEdit = async () => {
    if (cancellingRef.current) {
      cancellingRef.current = false
      return
    }
    setEditing(false)
    const next = draft.trim()
    if (next === (version.description ?? "").trim()) return
    try {
      await onEditDescription(version.id, next)
    } catch {
      setDraft(version.description ?? "")
    }
  }

  const cancelEdit = () => {
    cancellingRef.current = true
    setDraft(version.description ?? "")
    setEditing(false)
  }

  const onEditKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void submitEdit()
    } else if (e.key === "Escape") {
      e.preventDefault()
      cancelEdit()
    }
  }

  const handleCopyLink = () => {
    closeMenu()
    onCopyLink(version.id)
  }

  const named = isNamedVersion(version)
  const ago = relativeTime(version.createdAt)
  const description = version.description?.trim()
  const title =
    version.name?.trim() || (versionNumber !== undefined ? `#${versionNumber}` : t.autoSaved)

  const stereotype = version.pending
    ? "«saving»"
    : version.failed
      ? "«failed»"
      : named
        ? t.checkpointStereotype
        : t.autoGroupStereotype

  return (
    <li
      ref={ref}
      id={`version-row-${version.id}`}
      role="listitem"
      aria-current={isPreviewing ? true : undefined}
      className={cn(
        "group relative mb-3 flex list-none flex-col rounded-(--umlstudio-chrome-radius-md) border border-uml-border bg-(--uml-node-bg) transition-all duration-150 shadow-sm overflow-hidden",
        isPreviewing &&
          "ring-2 ring-(--umlstudio-primary) bg-(--umlstudio-surface-active) border-(--umlstudio-primary)",
        version.failed && "border-l-4 border-l-destructive",
        className
      )}
      style={{
        opacity: version.pending ? 0.85 : 1,
        color: "var(--umlstudio-foreground)",
      }}
    >
      {/* UML Compartment 1: Header (Stereotype, Name & Actions) */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-(--uml-node-header-border) bg-uml-header">
        <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
          <span
            className="text-[11px] font-medium font-mono uppercase tracking-wider px-2 py-0.5 rounded shrink-0"
            style={{
              backgroundColor: "var(--uml-node-stereotype-bg)",
              color: "var(--uml-node-stereotype-color)",
              border:
                "1px solid color-mix(in srgb, var(--uml-node-stereotype-color) 35%, transparent)",
            }}
          >
            {stereotype}
          </span>
          <span
            className="text-xs font-semibold text-(--uml-node-header-title,var(--umlstudio-foreground)) truncate"
            title={title}
          >
            {versionNumber !== undefined ? `v${versionNumber} · ` : ""}
            {title}
          </span>
        </div>

        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            aria-label={t.drawerTitle}
            disabled={Boolean(version.pending)}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex size-6 cursor-pointer items-center justify-center rounded-(--umlstudio-chrome-radius-sm) text-(--umlstudio-text-muted) hover:text-foreground hover:bg-(--umlstudio-surface-hover) outline-none transition-colors"
          >
            <MoreHorizontal className="size-3.5" aria-hidden />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {canRestore && (
              <DropdownMenuItem
                onClick={() => {
                  closeMenu()
                  onRestore(version.id)
                }}
              >
                <RotateCcw className="size-3.5 mr-2 text-(--umlstudio-text-muted)" />
                {t.restoreThis}
              </DropdownMenuItem>
            )}

            {hasPermalink && (
              <DropdownMenuItem onClick={handleCopyLink}>
                <Copy className="size-3.5 mr-2 text-(--umlstudio-text-muted)" />
                {t.copyLink}
              </DropdownMenuItem>
            )}

            <DropdownMenuItem
              onClick={() => {
                closeMenu()
                requestAnimationFrame(() => startEditing())
              }}
            >
              <Pencil className="size-3.5 mr-2 text-(--umlstudio-text-muted)" />
              {description ? t.editDescription : t.addDescription}
            </DropdownMenuItem>

            {named && (
              <Fragment>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    closeMenu()
                    onDelete(version.id)
                  }}
                >
                  <Trash2 className="size-3.5 mr-2" />
                  {t.delete}
                </DropdownMenuItem>
              </Fragment>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* UML Compartment 2: Body (Thumbnail & Description/Metadata) */}
      <div className="p-3 flex items-start gap-3 border-b border-(--uml-node-header-border) bg-uml-node-bg">
        <div
          onClick={() => !version.pending && onPreview(version.id)}
          className="group/thumb relative rounded border border-uml-border overflow-hidden shrink-0 shadow-inner bg-background flex items-center justify-center cursor-pointer hover:border-(--umlstudio-primary) transition-colors"
          title={t.previewButton}
        >
          {version.pending ? (
            <div className="h-10 w-16 animate-pulse bg-(--umlstudio-surface-hover)" />
          ) : (
            thumbnail
          )}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
            <Eye className="size-4 text-white drop-shadow" />
          </div>
        </div>

        <div className="min-w-0 flex-1 flex flex-col justify-between self-stretch">
          {editing ? (
            <Textarea
              autoFocus
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => void submitEdit()}
              onKeyDown={onEditKeyDown}
              placeholder={t.createPlaceholder}
              aria-label={t.editDescription}
              className="max-h-24 min-h-8 resize-none px-2 py-1 text-xs placeholder:text-(--umlstudio-text-muted) focus-visible:border-(--umlstudio-primary) bg-(--uml-node-bg) text-foreground border-uml-border"
            />
          ) : description ? (
            <p className="text-xs text-foreground line-clamp-2 leading-relaxed wrap-break-word">
              {description}
            </p>
          ) : (
            <p className="text-xs italic text-(--umlstudio-text-muted)">
              {named ? t.noDescription : t.autoSaved}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-(--umlstudio-text-muted) font-mono">
            <div className="flex items-center gap-1">
              <Clock className="size-3 shrink-0" />
              <span>{ago}</span>
            </div>

            {(version.authorName || version.author) && (
              <div
                className="flex items-center gap-1.5 rounded-full border border-uml-border px-2 py-0.5 text-[10px] text-foreground bg-(--umlstudio-surface-active) shadow-xs"
                title={`Author: ${version.authorName || version.author}`}
              >
                {version.authorAvatar ? (
                  <img
                    src={version.authorAvatar}
                    alt=""
                    className="size-3 rounded-full object-cover"
                  />
                ) : (
                  <span
                    className="size-2 rounded-full shrink-0 flex items-center justify-center text-[8px]"
                    style={{
                      backgroundColor: version.authorColor || "var(--umlstudio-primary)",
                    }}
                    aria-hidden
                  />
                )}
                <span className="truncate max-w-30 font-sans font-medium">
                  {version.authorName || version.author}
                </span>
              </div>
            )}

            {version.pending && <span className="text-(--umlstudio-accent)">· {t.saving}</span>}
            {version.failed && <span className="text-destructive">· error</span>}
          </div>
        </div>
      </div>

      {/* UML Compartment 3: Methods / Actions */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-uml-header">
        <div className="text-[11px] font-mono text-(--umlstudio-text-muted)">
          {isPreviewing && (
            <span className="inline-flex items-center gap-1 text-(--umlstudio-primary) font-semibold">
              <Check className="size-3" /> {t.previewingButton}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onPreview(version.id)}
            disabled={Boolean(version.pending) || isPreviewing}
            className="h-7 px-2 text-xs text-(--umlstudio-text-muted) hover:text-(--umlstudio-primary) hover:bg-(--umlstudio-surface-hover)"
          >
            <Eye className="size-3.5 mr-1" />
            {isPreviewing ? t.previewingButton : t.previewButton}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onRestore(version.id)}
            disabled={!canRestore || Boolean(version.pending)}
            className="h-7 px-2.5 text-xs font-medium border-uml-border hover:bg-(--umlstudio-primary) hover:text-white hover:border-(--umlstudio-primary) text-foreground bg-(--uml-node-bg) disabled:opacity-40 transition-colors"
          >
            <RotateCcw className="size-3 mr-1" />
            {t.restoreButton}
          </Button>
        </div>
      </div>
    </li>
  )
}

type ContainerProps = Omit<
  ViewProps,
  "onEditDescription" | "onCopyLink" | "thumbnail" | "hasPermalink"
> & {
  diagramId: string
}

export const VersionListItem: FC<ContainerProps> = ({ diagramId, ...props }) => {
  const t = useVersioningTranslation()
  const kind = useVersionRepositoryKind()
  const editVersionInfo = useEditVersionInfoMutation(kind, diagramId)
  const permalinkUrl = getVersionRepository(kind).permalink(diagramId, props.version.id)

  const onEditDescription = async (versionId: string, description: string) => {
    try {
      await editVersionInfo.mutateAsync({
        versionId,
        patch: { description },
      })
    } catch (err) {
      log.error("Edit description failed", err)
      toast.error(t.failureToEdit)
      throw err
    }
  }

  const onCopyLink = async () => {
    if (!permalinkUrl) return
    try {
      await navigator.clipboard.writeText(permalinkUrl)
      toast.success(t.copied)
    } catch (err) {
      log.error("Copy link failed", err)
      toast.error(t.copyFailed)
    }
  }

  return (
    <VersionListItemView
      {...props}
      thumbnail={
        <VersionThumbnail
          diagramId={diagramId}
          versionId={props.version.id}
          isAuto={!isNamedVersion(props.version)}
          size="compact"
        />
      }
      hasPermalink={Boolean(permalinkUrl)}
      onEditDescription={onEditDescription}
      onCopyLink={onCopyLink}
    />
  )
}
