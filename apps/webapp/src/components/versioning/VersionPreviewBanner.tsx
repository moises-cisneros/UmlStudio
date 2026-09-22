import { Eye } from "lucide-react"
import { useState, type CSSProperties, type FC } from "react"
import { cn } from "@umlstudio/ui/lib/utils"
import { selectScopedPreview, useVersionStore } from "@/stores/useVersionStore"
import { useVersionsQuery } from "@/queries/versionQueries"
import { useVersionRepositoryKind } from "@/contexts/VersionRepositoryContext"
import { useVersioningTranslation } from "./strings"
import { relativeTime } from "./relativeTime"

const COMPACT_WIDTH_PX = 768

interface ViewProps {
  label: string
  ago: string
  authorName?: string
  authorAvatar?: string
  authorColor?: string
  versionId: string
  canRestore: boolean
  containerWidth?: number
  onExitPreview: () => void
  onRestore: (versionId: string) => void | Promise<void>
  className?: string
  ref?: React.Ref<HTMLDivElement>
}

const buttonStyle: CSSProperties = {
  fontFamily: "inherit",
  whiteSpace: "nowrap",
  border: "1px solid var(--home-banner-warning-btn-border)",
  backgroundColor: "var(--home-banner-warning-btn-bg)",
  color: "var(--home-banner-warning-btn-text)",
}

export function VersionPreviewBannerView({
  label,
  ago,
  authorName,
  authorAvatar,
  authorColor,
  versionId,
  canRestore,
  containerWidth,
  onExitPreview,
  onRestore,
  className,
  ref,
}: ViewProps) {
  const t = useVersioningTranslation()
  const isSmall = containerWidth !== undefined && containerWidth < COMPACT_WIDTH_PX

  const [restoring, setRestoring] = useState(false)

  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      className={cn(
        "flex w-max max-w-[calc(100%-16px)] items-center rounded-xl border backdrop-blur-md",
        className
      )}
      style={{
        backgroundColor: "var(--home-banner-warning-bg)",
        color: "var(--home-banner-warning-text)",
        borderColor: "var(--home-banner-warning-border)",
        boxShadow: "var(--umlstudio-chrome-shadow-floating)",
        padding: "0.35rem 0.75rem",
        gap: isSmall ? "0.5rem" : "0.75rem",
      }}
    >
      <Eye
        className="size-4 shrink-0"
        style={{ color: "var(--home-banner-warning-icon)" }}
        aria-hidden
      />

      <div
        className="min-w-0 flex-1 flex items-center gap-1.5 text-caption font-semibold whitespace-nowrap"
        title={label || undefined}
      >
        <span>Read-only preview</span>
        {label && <span className="opacity-80">· {label}</span>}
        {authorName && (
          <span className="inline-flex items-center gap-1 font-normal opacity-90">
            · by
            {authorAvatar ? (
              <img src={authorAvatar} alt="" className="size-3.5 rounded-full object-cover" />
            ) : (
              <span
                className="size-2 rounded-full inline-block shrink-0"
                style={{
                  backgroundColor: authorColor || "var(--umlstudio-primary)",
                }}
              />
            )}
            <span className="font-medium">{authorName}</span>
          </span>
        )}
        {ago && <span className="opacity-70 font-normal">· {ago}</span>}
      </div>

      <div
        className="flex shrink-0 flex-row items-center"
        style={{
          gap: "0.5rem",
          marginLeft: isSmall ? "0.5rem" : "0.875rem",
        }}
      >
        <button
          type="button"
          onClick={onExitPreview}
          className="inline-flex cursor-pointer items-center justify-center rounded-md text-caption font-medium transition-colors hover:[background:var(--home-banner-warning-btn-hover)]"
          style={{
            ...buttonStyle,
            padding: "0.125rem 0.5rem",
          }}
        >
          {t.exitPreview}
        </button>
        {canRestore && (
          <button
            type="button"
            disabled={restoring}
            onClick={async () => {
              setRestoring(true)
              try {
                await onRestore(versionId)
              } finally {
                setRestoring(false)
              }
            }}
            className="inline-flex cursor-pointer items-center justify-center rounded-md text-caption font-semibold transition-colors hover:[background:var(--home-banner-warning-btn-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              ...buttonStyle,
              padding: "0.125rem 0.625rem",
            }}
          >
            {t.restoreThis}
          </button>
        )}
      </div>
    </div>
  )
}

interface ContainerProps {
  diagramId: string
  onExitPreview: () => void
  onRestore: (versionId: string) => void | Promise<void>
  canRestore: boolean
  containerWidth?: number
  className?: string
}

export const VersionPreviewBanner: FC<ContainerProps> = ({
  diagramId,
  onExitPreview,
  onRestore,
  canRestore,
  containerWidth,
  className,
}) => {
  const t = useVersioningTranslation()
  const preview = useVersionStore((s) => selectScopedPreview(s, diagramId))
  const kind = useVersionRepositoryKind()
  const { data } = useVersionsQuery(kind, diagramId)
  if (!preview) return null

  const summary = data?.versions.find((v) => v.id === preview.versionId)
  const label = summary?.description?.trim() || summary?.name?.trim() || t.unnamed
  const ago = summary ? relativeTime(summary.createdAt) : ""

  return (
    <VersionPreviewBannerView
      label={label}
      ago={ago}
      authorName={summary?.authorName || summary?.author}
      authorAvatar={summary?.authorAvatar}
      authorColor={summary?.authorColor}
      versionId={preview.versionId}
      canRestore={canRestore}
      containerWidth={containerWidth}
      onExitPreview={onExitPreview}
      onRestore={onRestore}
      className={className}
    />
  )
}
