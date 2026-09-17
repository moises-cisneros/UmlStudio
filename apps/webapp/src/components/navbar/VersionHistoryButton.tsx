import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@umlstudio/ui/components/tooltip";
import { GitCommitHorizontal } from "lucide-react";
import { useLocation } from "@tanstack/react-router";
import { useVersionStore } from "@/stores/useVersionStore";
import { useTranslation } from "@/i18n";
import { useDiagramIdFromPath } from "@/hooks/useDiagramIdFromPath";
import { useMediaQuery } from "@/hooks";
import { navbarButtonStyle } from "./styleConstants";

interface VersionHistoryButtonViewProps {
  isOpen: boolean;
  onToggle: () => void;
  color?: string;
  variant?: "bar" | "icon";
}

export function VersionHistoryButtonView({
  isOpen,
  onToggle,
  color,
  variant = "bar",
}: VersionHistoryButtonViewProps) {
  const { t } = useTranslation();
  const iconOnly = variant === "icon";
  const isLg = useMediaQuery("(min-width: 1024px)");

  const tooltipText = `${t.menu.versionHistory} (${/mac/i.test(navigator.userAgent) ? "⌥⇧H" : "Alt+Shift+H"})`;

  return (
    <Tooltip disabled={!iconOnly && isLg}>
      <TooltipTrigger
        className={navbarButtonStyle()}
        style={color ? { color } : undefined}
        aria-label={tooltipText}
        aria-pressed={isOpen}
        onClick={onToggle}
        data-version-history-trigger="true"
      >
        <GitCommitHorizontal className="size-4" aria-hidden />
        <span className={iconOnly ? "hidden" : "hidden lg:inline"}>
          {t.menu.versionHistory}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltipText}</TooltipContent>
    </Tooltip>
  );
}

interface VersionHistoryButtonProps {
  variant?: "bar" | "icon";
}

export const VersionHistoryButton = ({
  variant,
}: VersionHistoryButtonProps) => {
  const diagramId = useDiagramIdFromPath();
  const { pathname } = useLocation();
  const hasVersioning =
    pathname.startsWith("/shared/") ||
    pathname.startsWith("/local/") ||
    Boolean(diagramId);
  const openDrawer = useVersionStore((s) => s.openDrawer);
  const closeDrawer = useVersionStore((s) => s.closeDrawer);
  const isOpen = useVersionStore((s) =>
    diagramId ? Boolean(s.drawerOpenByDiagram[diagramId]) : false,
  );

  if (!diagramId || !hasVersioning) return null;

  return (
    <VersionHistoryButtonView
      isOpen={isOpen}
      variant={variant}
      onToggle={() => (isOpen ? closeDrawer(diagramId) : openDrawer(diagramId))}
    />
  );
};
