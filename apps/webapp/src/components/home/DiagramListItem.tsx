import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Heart, Unlink, FileCode2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@umlstudio/ui/components/badge";
import { Button } from "@umlstudio/ui/components/button";
import { cn } from "@umlstudio/ui/lib/utils";
import { Skeleton } from "@umlstudio/ui/components/skeleton";
import { useTranslation } from "@/i18n";
import { useMinuteTick } from "@/hooks/useMinuteTick";
import { usePersistenceModelStore } from "@/stores/usePersistenceModelStore";
import { getCachedThumbnailSources } from "@/utils/thumbnailTheme";
import { runWhenIdle } from "@/utils/idle";
import { getSharedDiagramViewBadge } from "@/utils/sharedDiagramLinks";
import type { DiagramView } from "@/types";
import {
  DiagramActionsMenu,
  formatRelativeLastModified,
  getDiagramNav,
  type DiagramCardThumbnail,
  type DiagramPreviewState,
  type RecentDiagram,
} from "./DiagramCard";

export type DiagramListItemProps = {
  diagram: RecentDiagram;
  previewState: DiagramPreviewState;
  thumbnail?: DiagramCardThumbnail | null;
  showSourceBadge?: boolean;
  isHighlighted?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: (diagram: RecentDiagram) => void;
  onSharedDiagramRemoved?: (diagramId: string) => void;
  onSharedDiagramViewChange?: (diagramId: string, view: DiagramView) => void;
  onOpen?: () => void;
  observeViewport?: (id: string, node: Element | null) => () => void;
  className?: string;
};

export const DiagramListItem: FC<DiagramListItemProps> = ({
  diagram,
  previewState,
  thumbnail = null,
  showSourceBadge = true,
  isHighlighted = false,
  isFavorite = diagram.favorite ?? false,
  onToggleFavorite,
  onSharedDiagramRemoved,
  onSharedDiagramViewChange,
  onOpen,
  observeViewport,
  className,
}) => {
  const { t } = useTranslation();
  const isExpired = previewState === "expired";
  const isLocalDiagram = (diagram.source ?? "local") === "local";
  const title = diagram.title.trim() || t.dashboard.emptyStateTitle;
  const isUntitled = !diagram.title.trim();

  useMinuteTick();
  const relativeDate = formatRelativeLastModified(
    diagram.lastModifiedAt,
    // eslint-disable-next-line react-hooks/purity
    Date.now(),
  );

  const sharedViewLabel = getSharedDiagramViewBadge(diagram.lastSharedView);
  const sourceLabel = isLocalDiagram
    ? t.dashboard.filterSourceLocal
    : t.dashboard.filterSourceShared;

  const thumbnailSvg = usePersistenceModelStore(
    (state) => state.thumbnails[diagram.id],
  );
  const thumbnailRevision = usePersistenceModelStore(
    (state) => state.thumbnailRevisions[diagram.id] ?? 0,
  );

  const itemObserveId = `diagram-list-thumb-${diagram.id}`;
  const observeCleanupRef = useRef<(() => void) | null>(null);

  const rowRef = useCallback(
    (node: HTMLDivElement | null) => {
      observeCleanupRef.current?.();
      observeCleanupRef.current = null;
      if (node && observeViewport) {
        observeCleanupRef.current = observeViewport(itemObserveId, node);
      }
    },
    [observeViewport, itemObserveId],
  );

  const thumbnailCacheKey = `${diagram.id}:${thumbnailRevision}`;
  const lightDataUrl = useMemo(() => {
    if (thumbnail?.lightDataUrl) return thumbnail.lightDataUrl;
    return (
      getCachedThumbnailSources(thumbnailCacheKey, thumbnailSvg)
        ?.lightDataUrl ?? null
    );
  }, [thumbnail?.lightDataUrl, thumbnailCacheKey, thumbnailSvg]);

  const [rawDarkDataUrl, setRawDarkDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!thumbnailSvg) {
      return;
    }
    return runWhenIdle(() => {
      const sources = getCachedThumbnailSources(
        thumbnailCacheKey,
        thumbnailSvg,
        { eager: true },
      );
      if (sources) {
        setRawDarkDataUrl(sources.darkDataUrl);
      }
    });
  }, [thumbnailCacheKey, thumbnailSvg]);

  const darkDataUrl = thumbnailSvg ? rawDarkDataUrl : null;
  const nav = getDiagramNav(diagram);

  return (
    <div
      ref={rowRef}
      role="listitem"
      className={cn(
        "group relative flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-(--home-card-surface) px-3.5 py-2.5 shadow-xs transition-all duration-200 hover:border-(--dodger-blue)/40 hover:bg-(--home-surface-hover) hover:shadow-sm",
        isHighlighted &&
          "animate-[diagram-highlight-pulse_2.4s_ease-out_forwards] border-(--dodger-blue) bg-accent-hover",
        isExpired && "opacity-60",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {onToggleFavorite ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={
              isFavorite ? t.dashboard.removeFavorite : t.dashboard.addFavorite
            }
            aria-pressed={isFavorite}
            className={cn(
              "shrink-0 transition-colors",
              isFavorite
                ? "text-rose-500 opacity-100"
                : "text-muted-foreground opacity-40 hover:text-rose-500 hover:opacity-100 group-hover:opacity-100",
            )}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite?.(diagram);
            }}
          >
            <Heart
              className="size-4"
              fill={isFavorite ? "currentColor" : "none"}
              aria-hidden="true"
            />
          </Button>
        ) : (
          <span className="w-6 shrink-0" />
        )}

        <div className="flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border-subtle bg-muted/40">
          {isExpired ? (
            <Unlink
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
          ) : previewState === "loading" ? (
            <Skeleton className="size-full rounded-none" />
          ) : lightDataUrl ? (
            <div className="relative size-full">
              <img
                src={lightDataUrl}
                alt=""
                className="theme-thumbnail-image theme-thumbnail-light object-cover"
                loading="lazy"
              />
              {darkDataUrl && (
                <img
                  src={darkDataUrl}
                  alt=""
                  aria-hidden="true"
                  className="theme-thumbnail-image theme-thumbnail-dark object-cover"
                  loading="lazy"
                />
              )}
            </div>
          ) : (
            <FileCode2
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <Link
            {...nav}
            onClick={(event: ReactMouseEvent<HTMLAnchorElement>) => {
              if (isExpired) {
                event.preventDefault();
                return;
              }
              onOpen?.();
            }}
            aria-disabled={isExpired}
            className={cn(
              "block truncate text-sm font-semibold text-(--home-text-strong) transition-colors hover:text-(--dodger-blue) focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
              isUntitled && "italic text-muted-foreground",
              isExpired && "pointer-events-none",
            )}
            title={diagram.title.trim() || undefined}
          >
            {title}
          </Link>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <div className="flex items-center gap-1.5">
          {showSourceBadge && (
            <Badge
              className="h-auto max-w-[14ch] truncate rounded border-0 px-2 py-0.5 text-xs font-semibold leading-tight"
              style={{
                background: isLocalDiagram
                  ? "var(--home-tag-local-bg)"
                  : "var(--home-tag-shared-bg)",
                color: isLocalDiagram
                  ? "var(--home-tag-local-text)"
                  : "var(--home-tag-shared-text)",
              }}
              title={sourceLabel}
            >
              {sourceLabel}
            </Badge>
          )}

          {!isLocalDiagram && (
            <Badge
              className="h-auto max-w-[12ch] truncate rounded border-0 px-2 py-0.5 text-xs font-medium leading-tight"
              style={{
                background: "var(--home-tag-shared-bg)",
                color: "var(--home-tag-shared-text)",
              }}
              title={sharedViewLabel}
            >
              {sharedViewLabel}
            </Badge>
          )}
        </div>

        <time
          dateTime={diagram.lastModifiedAt}
          title={new Date(diagram.lastModifiedAt).toLocaleString()}
          className="hidden min-w-25 text-right text-xs font-medium text-muted-foreground sm:inline-block"
        >
          {relativeDate}
        </time>

        <DiagramActionsMenu
          diagram={diagram}
          isExpired={isExpired}
          onSharedDiagramRemoved={onSharedDiagramRemoved}
          onSharedDiagramViewChange={onSharedDiagramViewChange}
        />
      </div>
    </div>
  );
};
