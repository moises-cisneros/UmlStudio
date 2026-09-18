import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type Ref,
} from "react";
import {
  MoreVertical,
  Heart,
  Unlink,
  ExternalLink,
  Pencil,
  Copy,
  Share2,
  Link2,
  Download,
  Shield,
  Trash2,
  UserX,
} from "lucide-react";
import type { UMLDiagramType } from "@umlstudio/core";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@umlstudio/ui/components/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@umlstudio/ui/components/alert-dialog";
import { cn } from "@umlstudio/ui/lib/utils";
import { Skeleton } from "@umlstudio/ui/components/skeleton";
import { Badge } from "@umlstudio/ui/components/badge";
import { Button } from "@umlstudio/ui/components/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@umlstudio/ui/components/card";
import { Separator } from "@umlstudio/ui/components/separator";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "react-toastify";
import { useModalContext } from "@/contexts";
import { usePersistenceModelStore } from "@/stores/usePersistenceModelStore";
import { useMinuteTick } from "@/hooks/useMinuteTick";
import { useTranslation } from "@/i18n";
import { DiagramView } from "@/types";
import { getDiagramTypeIcon } from "./diagramTypeMeta";
import {
  MOBILE_MENU_CONTENT_CLASS,
  MOBILE_MENU_SUBCONTENT_CLASS,
} from "@/components/navbar/islandPrimitives";
import {
  markSharedDiagramCopied,
  removeSharedDiagramEntry,
  updateSharedDiagramView,
} from "@/utils/sharedDiagramStorage";
import {
  SHARED_DIAGRAM_VIEW_OPTIONS,
  DEFAULT_SHARED_DIAGRAM_VIEW,
  sharedDiagramRoute,
  buildSharedDiagramUrl,
  getSharedDiagramViewBadge,
} from "@/utils/sharedDiagramLinks";
import { getCachedThumbnailSources } from "@/utils/thumbnailTheme";
import { cloneModelAsLocalCopy } from "@/utils/saveLocalDiagramCopy";
import { DiagramApiClient } from "@/services/DiagramApiClient";
import { log } from "@/logger";
import { runWhenIdle } from "@/utils/idle";

export type DiagramSource = "local" | "shared";

export type RecentDiagram = {
  id: string;
  title: string;
  type: UMLDiagramType;
  lastModifiedAt: string;
  favorite: boolean;
  source?: DiagramSource;
  createdAt?: string;
  lastSharedView?: DiagramView;
};

export const formatRelativeLastModified = (lastModifiedAt: string, nowMs: number) => {
  const parsedDate = new Date(lastModifiedAt);
  if (Number.isNaN(parsedDate.getTime())) {
    return "Unknown date";
  }

  const diffMilliseconds = nowMs - parsedDate.getTime();
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (diffMilliseconds < minuteMs) {
    return "just now";
  }

  if (diffMilliseconds < hourMs) {
    const minutes = Math.floor(diffMilliseconds / minuteMs);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  if (diffMilliseconds < dayMs) {
    const hours = Math.floor(diffMilliseconds / hourMs);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  if (diffMilliseconds < 2 * dayMs) {
    return "Yesterday";
  }

  return parsedDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export const getDiagramNav = (diagram: RecentDiagram) => {
  const source = diagram.source ?? "local";
  if (source === "local") {
    return { to: "/local/$id", params: { id: diagram.id } } as const;
  }

  return sharedDiagramRoute(
    diagram.id,
    diagram.lastSharedView ?? DEFAULT_SHARED_DIAGRAM_VIEW,
  );
};

export type DiagramActionsMenuViewProps = {
  diagram: RecentDiagram;
  isExpired?: boolean;
  canDelete?: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onShare: () => void;
  onCopySharedLink: () => void;
  onSaveLocalCopy: () => void;
  onChangeSharedView: (view: DiagramView) => void;
  onRemoveSharedEntry: () => void;
  containerClassName?: string;
  stopPropagation?: boolean;
};

const DEFAULT_MENU_CONTAINER_CLASS = "relative";

type PendingConfirm = "delete" | "remove";

export function DiagramActionsMenuView({
  diagram,
  isExpired = false,
  canDelete = true,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onShare,
  onCopySharedLink,
  onSaveLocalCopy,
  onChangeSharedView,
  onRemoveSharedEntry,
  containerClassName = DEFAULT_MENU_CONTAINER_CLASS,
  stopPropagation = false,
}: DiagramActionsMenuViewProps) {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );

  const isLocalDiagram = (diagram.source ?? "local") === "local";
  const sharedView = diagram.lastSharedView ?? DEFAULT_SHARED_DIAGRAM_VIEW;

  const runAndClose = (action: () => void) => {
    action();
    setIsMenuOpen(false);
  };

  const requestConfirm = (kind: PendingConfirm) => {
    setIsMenuOpen(false);
    setPendingConfirm(kind);
  };

  const confirmCopy = pendingConfirm
    ? pendingConfirm === "delete"
      ? {
        title: t.dashboard.confirmDeleteTitle,
        description: t.dashboard.confirmDeleteDesc,
        confirmLabel: t.dashboard.confirmDeleteBtn,
      }
      : {
        title: t.dashboard.confirmRemoveTitle,
        description: t.dashboard.confirmRemoveDesc,
        confirmLabel: t.dashboard.confirmRemoveBtn,
      }
    : null;

  const stopIfNeeded = (
    event: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLElement>,
  ) => {
    if (stopPropagation) {
      event.stopPropagation();
    }
  };

  return (
    <div
      className={containerClassName}
      onClick={stopIfNeeded}
      onMouseDown={stopIfNeeded}
      onKeyDown={stopIfNeeded}
    >
      <DropdownMenu
        open={isMenuOpen}
        onOpenChange={(open) => setIsMenuOpen(open)}
      >
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label={t.dashboard.diagramActionsAria}
              className="pointer-events-auto rounded-lg text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 aria-expanded:bg-accent aria-expanded:text-foreground aria-expanded:opacity-100 home-card-control"
              onClick={stopIfNeeded}
            />
          }
        >
          <MoreVertical className="size-4.5" aria-hidden="true" />
        </DropdownMenuTrigger>

        <DropdownMenuContent
          id={`diagram-actions-menu-${diagram.id}`}
          aria-label={t.dashboard.diagramActionsAria}
          align="end"
          sideOffset={8}
          className={cn(
            MOBILE_MENU_CONTENT_CLASS,
            "w-56 rounded-xl border border-border/70 bg-popover/95 p-1.5 shadow-xl backdrop-blur-md",
          )}
        >
          {isExpired ? (
            <DropdownMenuItem
              variant="destructive"
              closeOnClick={false}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer"
              onClick={() => requestConfirm("remove")}
            >
              <UserX className="size-4 shrink-0 text-destructive" />
              <span>{t.dashboard.actionRemoveFromShared}</span>
            </DropdownMenuItem>
          ) : isLocalDiagram ? (
            <>
              <DropdownMenuItem
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer"
                onClick={() => runAndClose(onOpen)}
              >
                <ExternalLink className="size-4 shrink-0 text-(--dodger-blue)" />
                <span>{t.dashboard.actionOpen}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer"
                onClick={() => runAndClose(onRename)}
              >
                <Pencil className="size-4 shrink-0 text-muted-foreground" />
                <span>{t.dashboard.actionRename}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer"
                onClick={() => runAndClose(onDuplicate)}
              >
                <Copy className="size-4 shrink-0 text-muted-foreground" />
                <span>{t.dashboard.actionDuplicate}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer"
                onClick={() => runAndClose(onShare)}
              >
                <Share2 className="size-4 shrink-0 text-muted-foreground" />
                <span>{t.dashboard.actionShare}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1 border-border/50" />
              <DropdownMenuItem
                variant="destructive"
                disabled={!canDelete}
                closeOnClick={false}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer"
                title={
                  canDelete
                    ? undefined
                    : t.dashboard.cannotDeleteCurrent
                }
                onClick={() => requestConfirm("delete")}
              >
                <Trash2 className="size-4 shrink-0 text-destructive" />
                <span>{t.dashboard.actionDelete}</span>
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer"
                onClick={() => runAndClose(onOpen)}
              >
                <ExternalLink className="size-4 shrink-0 text-(--dodger-blue)" />
                <span>{t.dashboard.actionOpen}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer"
                onClick={() => runAndClose(onRename)}
              >
                <Pencil className="size-4 shrink-0 text-muted-foreground" />
                <span>{t.dashboard.actionRename}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer"
                onClick={() => runAndClose(onCopySharedLink)}
              >
                <Link2 className="size-4 shrink-0 text-muted-foreground" />
                <span>{t.dashboard.actionCopyLink}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer"
                onClick={() => runAndClose(onSaveLocalCopy)}
              >
                <Download className="size-4 shrink-0 text-muted-foreground" />
                <span>{t.dashboard.actionSaveLocalCopy}</span>
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer">
                  <Shield className="size-4 shrink-0 text-muted-foreground" />
                  <span>{t.dashboard.actionChangeSharingMode}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent
                  aria-label={t.dashboard.actionChangeSharingMode}
                  className={cn(
                    MOBILE_MENU_SUBCONTENT_CLASS,
                    "w-48 rounded-xl border border-border/70 bg-popover/95 p-1.5 shadow-xl backdrop-blur-md",
                  )}
                >
                  <DropdownMenuRadioGroup
                    value={sharedView}
                    onValueChange={(value) =>
                      runAndClose(() =>
                        onChangeSharedView(value as DiagramView),
                      )
                    }
                  >
                    {SHARED_DIAGRAM_VIEW_OPTIONS.map((option) => (
                      <DropdownMenuRadioItem
                        key={option.value}
                        value={option.value}
                        className="rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer"
                      >
                        {option.badge}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator className="my-1 border-border/50" />
              <DropdownMenuItem
                variant="destructive"
                closeOnClick={false}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium cursor-pointer"
                onClick={() => requestConfirm("remove")}
              >
                <UserX className="size-4 shrink-0 text-destructive" />
                <span>{t.dashboard.actionRemoveFromShared}</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={pendingConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setPendingConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmCopy?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmCopy?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.dashboard.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingConfirm === "delete") {
                  onDelete();
                } else if (pendingConfirm === "remove") {
                  onRemoveSharedEntry();
                }
              }}
            >
              {confirmCopy?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type DiagramActionsMenuProps = {
  diagram: RecentDiagram;
  containerClassName?: string;
  stopPropagation?: boolean;
  isExpired?: boolean;
  onSharedDiagramRemoved?: (diagramId: string) => void;
  onSharedDiagramViewChange?: (diagramId: string, view: DiagramView) => void;
};

export const DiagramActionsMenu = ({
  diagram,
  containerClassName,
  stopPropagation = false,
  isExpired = false,
  onSharedDiagramRemoved,
  onSharedDiagramViewChange,
}: DiagramActionsMenuProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openModal } = useModalContext();
  const deleteModel = usePersistenceModelStore((state) => state.deleteModel);
  const duplicateModel = usePersistenceModelStore(
    (state) => state.duplicateModel,
  );
  const createModel = usePersistenceModelStore((state) => state.createModel);
  const currentModelId = usePersistenceModelStore(
    (state) => state.currentModelId,
  );

  const isLocalDiagram = (diagram.source ?? "local") === "local";
  const sharedView = diagram.lastSharedView ?? DEFAULT_SHARED_DIAGRAM_VIEW;
  const isCurrentDiagramInEditor = diagram.id === currentModelId;

  const copySharedLink = async (view: DiagramView, message: string) => {
    try {
      await navigator.clipboard.writeText(
        buildSharedDiagramUrl(diagram.id, view),
      );
      markSharedDiagramCopied(diagram.id, view);
      toast.success(message);
    } catch {
      toast.error(t.dashboard.toastCouldNotCopyLink);
    }
  };

  const saveLocalCopy = async () => {
    try {
      const model = await DiagramApiClient.fetchDiagram(diagram.id);
      const copy = cloneModelAsLocalCopy(model);
      createModel(copy);
      markSharedDiagramCopied(diagram.id, sharedView);
      toast.success(t.dashboard.toastSaveLocalCopySuccess, {
        autoClose: 6000,
      });
      navigate({ to: "/local/$id", params: { id: copy.id }, replace: true });
    } catch (err) {
      log.error("Save a local copy from the gallery failed", err as Error);
      toast.error(t.dashboard.toastSaveLocalCopyFailed);
    }
  };

  return (
    <DiagramActionsMenuView
      diagram={diagram}
      isExpired={isExpired}
      canDelete={isLocalDiagram && !isCurrentDiagramInEditor}
      stopPropagation={stopPropagation}
      containerClassName={containerClassName}
      onOpen={() => navigate(getDiagramNav(diagram))}
      onRename={() => {
        openModal("RENAME_DIAGRAM", {
          diagramId: diagram.id,
          initialTitle: diagram.title,
          source: isLocalDiagram ? "local" : "shared",
        });
      }}
      onDuplicate={() => {
        if (isLocalDiagram) duplicateModel(diagram.id);
      }}
      onDelete={() => {
        if (isLocalDiagram && !isCurrentDiagramInEditor) {
          deleteModel(diagram.id);
        }
      }}
      onShare={() => {
        if (isLocalDiagram) {
          openModal("SHARE_DASHBOARD", {
            modelId: diagram.id,
            contentOverflow: true,
          });
        }
      }}
      onCopySharedLink={() =>
        void copySharedLink(sharedView, t.dashboard.toastLinkCopied)
      }
      onSaveLocalCopy={() => void saveLocalCopy()}
      onChangeSharedView={(view) => {
        updateSharedDiagramView(diagram.id, view);
        onSharedDiagramViewChange?.(diagram.id, view);
        toast.success(
          `${getSharedDiagramViewBadge(view)} ${t.dashboard.toastSharingModeUpdated}`,
        );
      }}
      onRemoveSharedEntry={() => {
        removeSharedDiagramEntry(diagram.id);
        onSharedDiagramRemoved?.(diagram.id);
      }}
    />
  );
};

const PreviewTile = ({ children }: { children: ReactNode }) => {
  return (
    <div className="flex size-20 items-center justify-center rounded-xl border border-border-subtle bg-[color-mix(in_srgb,var(--home-text-primary)_4%,transparent)] text-muted-foreground">
      {children}
    </div>
  );
};

export type DiagramPreviewState =
  | "thumbnail"
  | "loading"
  | "placeholder"
  | "expired";

type DiagramPreviewProps = {
  diagram: RecentDiagram;
  title: string;
  lightDataUrl: string | null;
  darkDataUrl: string | null;
  state: DiagramPreviewState;
};

function DiagramPreview({
  diagram,
  title,
  lightDataUrl,
  darkDataUrl,
  state,
}: DiagramPreviewProps) {
  const { t } = useTranslation();
  return (
    <div className="flex aspect-16/10 w-full items-center justify-center">
      {state === "expired" ? (
        <div className="flex flex-col items-center gap-2.5 text-center text-muted-foreground">
          <Unlink className="size-10" aria-hidden="true" />
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-secondary-foreground">
              {t.dashboard.linkExpired}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {t.dashboard.linkExpiredDesc}
            </p>
          </div>
        </div>
      ) : state === "thumbnail" ? (
        <div className="relative h-full w-full">
          <img
            src={lightDataUrl!}
            alt={`${title} diagram preview`}
            className="theme-thumbnail-image theme-thumbnail-light"
            loading="lazy"
          />
          {darkDataUrl && (
            <img
              src={darkDataUrl}
              alt=""
              aria-hidden="true"
              className="theme-thumbnail-image theme-thumbnail-dark"
              loading="lazy"
            />
          )}
        </div>
      ) : state === "loading" ? (
        <Skeleton className="size-full rounded-md" />
      ) : (
        <PreviewTile>{getDiagramTypeIcon(diagram.type, "size-9")}</PreviewTile>
      )}
    </div>
  );
}

type CardTagTone = "type" | "local" | "shared";

const CARD_TAG_TONE: Record<CardTagTone, { bg: string; text: string }> = {
  type: { bg: "var(--home-tag-type-bg)", text: "var(--home-tag-type-text)" },
  local: { bg: "var(--home-tag-local-bg)", text: "var(--home-tag-local-text)" },
  shared: {
    bg: "var(--home-tag-shared-bg)",
    text: "var(--home-tag-shared-text)",
  },
};

function CardTag({ label, tone }: { label: string; tone: CardTagTone }) {
  const { bg, text } = CARD_TAG_TONE[tone];
  return (
    <Badge
      className={cn(
        "h-auto max-w-[14ch] truncate rounded border-0 px-2 py-0.5 text-xs leading-tight font-semibold",
      )}
      title={label}
      style={{ background: bg, color: text }}
    >
      {label}
    </Badge>
  );
}

export type DiagramCardThumbnail = {
  lightDataUrl: string | null;
  darkDataUrl: string | null;
};

export type DiagramCardViewProps = {
  diagram: RecentDiagram;
  thumbnail?: DiagramCardThumbnail | null;
  previewState: DiagramPreviewState;
  isHighlighted?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onOpen?: () => void;
  actionsMenu?: ReactNode;
  className?: string;
  ref?: Ref<HTMLDivElement>;
};

export function DiagramCardView({
  diagram,
  thumbnail = null,
  previewState,
  isHighlighted = false,
  isFavorite = false,
  onToggleFavorite,
  onOpen,
  actionsMenu,
  className,
  ref,
}: DiagramCardViewProps) {
  const { t } = useTranslation();
  const isExpired = previewState === "expired";
  const isUntitled = !diagram.title.trim();
  const title = diagram.title.trim() || t.dashboard.emptyStateTitle;
  const isLocalDiagram = (diagram.source ?? "local") === "local";
  const lightDataUrl = thumbnail?.lightDataUrl ?? null;
  const darkDataUrl = thumbnail?.darkDataUrl ?? null;

  useMinuteTick();
  const relativeDate = formatRelativeLastModified(
    diagram.lastModifiedAt,
    // eslint-disable-next-line react-hooks/purity
    Date.now(),
  );
  const sourceTypeLabel = isLocalDiagram
    ? t.dashboard.filterSourceLocal
    : t.dashboard.filterSourceShared;
  const sharedViewLabel = getSharedDiagramViewBadge(diagram.lastSharedView);

  const nav = getDiagramNav(diagram);

  return (
    <Card
      ref={ref}
      role="listitem"
      className={cn(
        "home-diagram-card group relative flex min-h-(--card-min-h) flex-col gap-0 overflow-hidden rounded-(--umlstudio-chrome-radius-lg) border border-(--umlstudio-chrome-border) bg-(--home-card-surface) py-0 shadow-(--umlstudio-chrome-shadow-floating) transition-all duration-280 ease-[cubic-bezier(0.16,1,0.3,1)]",
        isHighlighted
          ? "animate-[diagram-highlight-pulse_2.4s_ease-out_forwards] bg-accent-hover shadow-[0_0_0_3px_color-mix(in_srgb,var(--home-accent-base)_35%,transparent)]"
          : "hover:bg-accent-hover hover:shadow-[0_6px_16px_var(--home-shadow-card-hover)]",
        className,
      )}
    >
      <Link
        {...nav}
        onClick={(event: ReactMouseEvent<HTMLAnchorElement>) => {
          if (isExpired) {
            event.preventDefault();
            return;
          }
          onOpen?.();
        }}
        aria-label={isExpired ? `${title} (expired)` : `Open ${title}`}
        aria-disabled={isExpired}
        tabIndex={isExpired ? -1 : undefined}
        className={cn(
          "flex h-full w-full flex-col rounded-[inherit] text-left outline-none after:absolute after:inset-0 after:z-10 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          isExpired ? "cursor-default" : "cursor-pointer",
        )}
      >
        <CardHeader className="flex w-full flex-col gap-2 rounded-none px-4 pt-12 pb-2">
          <DiagramPreview
            diagram={diagram}
            title={title}
            lightDataUrl={lightDataUrl}
            darkDataUrl={darkDataUrl}
            state={previewState}
          />

          <CardContent className="mt-auto w-full px-0 text-left">
            <p
              className={cn(
                "line-clamp-2 text-sm leading-snug font-medium",
                isUntitled
                  ? "text-muted-foreground italic"
                  : "text-(--home-text-strong)",
                isExpired && "opacity-50",
              )}
              title={title}
            >
              {title}
            </p>
          </CardContent>
        </CardHeader>

        <Separator className="mx-4 w-auto bg-border-subtle" />

        <CardFooter
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-none border-t-0 bg-transparent px-4 pt-2.5 pb-3.5",
            isExpired && "opacity-50",
          )}
        >
          <time
            dateTime={diagram.lastModifiedAt}
            title={new Date(diagram.lastModifiedAt).toLocaleString()}
            className="truncate text-xs leading-tight font-medium text-muted-foreground"
          >
            {relativeDate}
          </time>

          <div className="flex shrink-0 items-center gap-1">
            <CardTag
              label={sourceTypeLabel}
              tone={isLocalDiagram ? "local" : "shared"}
            />
            {!isLocalDiagram && (
              <CardTag label={sharedViewLabel} tone="shared" />
            )}
          </div>
        </CardFooter>
      </Link>

      <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex items-start justify-between">
        {onToggleFavorite ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label={
              isFavorite ? t.dashboard.removeFavorite : t.dashboard.addFavorite
            }
            aria-pressed={isFavorite}
            className={cn(
              "pointer-events-auto transition-opacity",
              isFavorite
                ? "text-rose-500 opacity-100"
                : "text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:text-rose-500 home-card-control",
            )}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite();
            }}
          >
            <Heart
              className="size-5"
              aria-hidden="true"
              fill={isFavorite ? "currentColor" : "none"}
            />
          </Button>
        ) : (
          <span />
        )}

        {actionsMenu}
      </div>
    </Card>
  );
}

type DiagramCardProps = {
  diagram: RecentDiagram;
  previewState: DiagramPreviewState;
  isHighlighted?: boolean;
  onToggleFavorite?: (diagram: RecentDiagram) => void;
  onSharedDiagramRemoved?: (diagramId: string) => void;
  onSharedDiagramViewChange?: (diagramId: string, view: DiagramView) => void;
  observeViewport?: (id: string, node: Element | null) => () => void;
};

export function DiagramCardComponent({
  diagram,
  previewState,
  isHighlighted = false,
  onToggleFavorite,
  onSharedDiagramRemoved,
  onSharedDiagramViewChange,
  observeViewport,
}: DiagramCardProps) {
  const toggleFavorite = usePersistenceModelStore(
    (state) => state.toggleFavorite,
  );
  const thumbnailSvg = usePersistenceModelStore(
    (state) => state.thumbnails[diagram.id],
  );
  const thumbnailRevision = usePersistenceModelStore(
    (state) => state.thumbnailRevisions[diagram.id] ?? 0,
  );

  const isExpired = previewState === "expired";
  const isLocalDiagram = (diagram.source ?? "local") === "local";
  const canToggleFavorite =
    !isExpired && (isLocalDiagram || Boolean(onToggleFavorite));

  const cardObserveId = `diagram-thumb-${diagram.id}`;
  const observeCleanupRef = useRef<(() => void) | null>(null);
  const cardRef = useCallback(
    (node: HTMLDivElement | null) => {
      observeCleanupRef.current?.();
      observeCleanupRef.current = null;
      if (node && observeViewport) {
        observeCleanupRef.current = observeViewport(cardObserveId, node);
      }
    },
    [observeViewport, cardObserveId],
  );

  const thumbnailCacheKey = `${diagram.id}:${thumbnailRevision}`;
  const lightDataUrl = useMemo(
    () =>
      getCachedThumbnailSources(thumbnailCacheKey, thumbnailSvg)
        ?.lightDataUrl ?? null,
    [thumbnailCacheKey, thumbnailSvg],
  );
  const [rawDarkDataUrl, setRawDarkDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!thumbnailSvg) {
      return;
    }
    return runWhenIdle(() => {
      const sources = getCachedThumbnailSources(
        thumbnailCacheKey,
        thumbnailSvg,
        {
          eager: true,
        },
      );
      if (sources) {
        setRawDarkDataUrl(sources.darkDataUrl);
      }
    });
  }, [thumbnailCacheKey, thumbnailSvg]);

  const darkDataUrl = thumbnailSvg ? rawDarkDataUrl : null;

  const resolvedPreviewState: DiagramPreviewState =
    previewState === "expired" || previewState === "placeholder"
      ? previewState
      : !lightDataUrl
        ? "loading"
        : "thumbnail";

  return (
    <DiagramCardView
      ref={cardRef}
      diagram={diagram}
      thumbnail={lightDataUrl ? { lightDataUrl, darkDataUrl } : null}
      previewState={resolvedPreviewState}
      isHighlighted={isHighlighted}
      isFavorite={diagram.favorite}
      onToggleFavorite={
        canToggleFavorite
          ? () => {
            if (onToggleFavorite) {
              onToggleFavorite(diagram);
            } else if (isLocalDiagram) {
              toggleFavorite(diagram.id);
            }
          }
          : undefined
      }
      actionsMenu={
        <DiagramActionsMenu
          diagram={diagram}
          stopPropagation
          isExpired={isExpired}
          containerClassName="pointer-events-auto relative"
          onSharedDiagramRemoved={onSharedDiagramRemoved}
          onSharedDiagramViewChange={onSharedDiagramViewChange}
        />
      }
    />
  );
};

export const DiagramCard = DiagramCardComponent;
