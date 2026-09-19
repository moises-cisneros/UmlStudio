import {
  CheckCircle2,
  CircleDot,
  ArrowLeft,
  type LucideIcon,
} from "lucide-react";
import type { FC } from "react";
import { cn } from "@umlstudio/ui/lib/utils";
import { Button } from "@umlstudio/ui/components/button";
import { selectScopedPreview, useVersionStore } from "@/stores/useVersionStore";
import type { PendingVersion } from "@/types";
import { useClosePreview } from "@/hooks/useVersionPreviewUrlSync";
import { relativeTime } from "./relativeTime";
import { useVersioningTranslation } from "./strings";

interface ViewProps {
  hasChanges: boolean;
  latestSavedVersion?: PendingVersion;
  isPreviewing: boolean;
  onExitPreview: () => void;
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
}

export function CurrentVersionRowView({
  hasChanges,
  latestSavedVersion,
  isPreviewing,
  onExitPreview,
  className,
  ref,
}: ViewProps) {
  const t = useVersioningTranslation();

  if (isPreviewing) {
    return (
      <div
        ref={ref}
        className={cn(
          "mb-3 flex flex-col rounded-(--umlstudio-chrome-radius-md) border-2 border-brand-dodger-blue bg-(--uml-node-bg) overflow-hidden shadow-sm",
          className,
        )}
      >
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-(--uml-node-header-border) bg-uml-header">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-brand-dodger-blue text-white shrink-0">
              {t.previewStereotype}
            </span>
            <span className="text-xs font-semibold text-(--uml-node-header-title,var(--umlstudio-foreground))">
              {t.previewModeActive}
            </span>
          </div>
        </div>

        <div className="p-3 flex items-center justify-between gap-3 bg-(--uml-node-bg)">
          <p className="text-xs text-(--umlstudio-text-muted) leading-relaxed">
            {t.previewReadonlyNotice}
          </p>
          <Button
            type="button"
            size="sm"
            onClick={onExitPreview}
            className="h-8 px-3 shrink-0 font-medium bg-brand-dodger-blue hover:brightness-110 text-white"
          >
            <ArrowLeft className="size-3.5 mr-1.5" />
            {t.returnToCurrent}
          </Button>
        </div>
      </div>
    );
  }

  const upToDate = Boolean(latestSavedVersion) && !hasChanges;
  let icon: LucideIcon;
  let iconColor: string;
  let statusBadge: string;
  let subtitle: string;

  if (!latestSavedVersion) {
    icon = CircleDot;
    iconColor = "var(--umlstudio-text-muted)";
    statusBadge = t.noVersionsYet;
    subtitle = t.noVersionsYetDesc;
  } else if (upToDate) {
    icon = CheckCircle2;
    iconColor = "var(--color-success, #10b981)";
    statusBadge = t.upToDateTitle;
    subtitle = t.upToDateSubtitle(relativeTime(latestSavedVersion.createdAt));
  } else {
    icon = CircleDot;
    iconColor = "var(--color-warning, #f59e0b)";
    statusBadge = t.unsavedChangesTitle;
    subtitle = t.unsavedChangesSubtitle(
      relativeTime(latestSavedVersion.createdAt),
    );
  }

  const Icon = icon;

  return (
    <div
      ref={ref}
      className={cn(
        "mb-3 flex flex-col rounded-(--umlstudio-chrome-radius-md) border border-uml-border bg-(--uml-node-bg) overflow-hidden shadow-sm",
        !upToDate &&
          Boolean(latestSavedVersion) &&
          "border-l-4 border-l-(--color-warning,#f59e0b)",
        upToDate,
        className,
      )}
      aria-label={t.liveCanvas}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-(--uml-node-header-border) bg-uml-header">
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-medium font-mono uppercase tracking-wider px-2 py-0.5 rounded shrink-0"
            style={{
              backgroundColor: "var(--uml-node-stereotype-bg)",
              color: "var(--uml-node-stereotype-color)",
              border:
                "1px solid color-mix(in srgb, var(--uml-node-stereotype-color) 35%, transparent)",
            }}
          >
            {t.liveCanvasStereotype}
          </span>
          <span className="text-xs font-semibold text-(--uml-node-header-title,var(--umlstudio-foreground))">
            {t.liveCanvas}
          </span>
        </div>

        <span
          className="inline-flex items-center gap-1 text-[11px] font-medium font-mono"
          style={{ color: iconColor }}
        >
          <Icon className="size-3" />
          {statusBadge}
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2 bg-(--uml-node-bg)">
        <p className="text-xs text-(--umlstudio-text-muted) leading-relaxed">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

interface ContainerProps {
  diagramId: string;
  hasChanges: boolean;
  latestSavedVersion?: PendingVersion;
  className?: string;
}

export const CurrentVersionRow: FC<ContainerProps> = ({
  diagramId,
  hasChanges,
  latestSavedVersion,
  className,
}) => {
  const previewState = useVersionStore((s) =>
    selectScopedPreview(s, diagramId),
  );
  const closePreview = useClosePreview();

  return (
    <CurrentVersionRowView
      hasChanges={hasChanges}
      latestSavedVersion={latestSavedVersion}
      isPreviewing={Boolean(previewState)}
      onExitPreview={closePreview}
      className={className}
    />
  );
};
