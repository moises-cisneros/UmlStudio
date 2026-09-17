import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@umlstudio/ui/components/tooltip";
import { DropdownMenuItem } from "@umlstudio/ui/components/dropdown-menu";
import { toast } from "react-toastify";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEditorContext } from "@/contexts";
import { usePersistenceModelStore } from "@/stores/usePersistenceModelStore";
import { useDiagramIdFromPath } from "@/hooks/useDiagramIdFromPath";
import { useMediaQuery } from "@/hooks";
import { useVersioningTranslation } from "@/components/versioning/strings";
import { cloneModelAsLocalCopy } from "@/utils/saveLocalDiagramCopy";
import { log } from "@/logger";
import { navbarButtonStyle } from "./styleConstants";

interface Props {
  color?: string;
  variant?: "bar" | "icon" | "menuItem";
  onAfter?: () => void;
}

export const SaveLocalCopyButton = ({
  color,
  variant = "bar",
  onAfter,
}: Props) => {
  const t = useVersioningTranslation();
  const iconOnly = variant === "icon";
  const diagramId = useDiagramIdFromPath();
  const { pathname } = useLocation();
  const { editor } = useEditorContext();
  const createModel = usePersistenceModelStore((s) => s.createModel);
  const navigate = useNavigate();
  const isLg = useMediaQuery("(min-width: 1024px)");

  if (!diagramId || !editor || !pathname.startsWith("/shared/")) return null;

  const handleClick = () => {
    try {
      const copy = cloneModelAsLocalCopy(editor.model);
      createModel(copy);
      toast.success(t.saveLocalCopySuccess, { autoClose: 6000 });
      navigate({ to: "/local/$id", params: { id: copy.id }, replace: true });
    } catch (err) {
      log.error("Save a local copy failed", err as Error);
      toast.error(t.saveLocalCopyFailed);
    } finally {
      onAfter?.();
    }
  };

  if (variant === "menuItem") {
    return (
      <DropdownMenuItem
        onClick={handleClick}
        aria-label={t.saveLocalCopyButton}
        style={color ? { color } : undefined}
      >
        {t.saveLocalCopyButton}
      </DropdownMenuItem>
    );
  }

  return (
    <Tooltip disabled={!iconOnly && isLg}>
      <TooltipTrigger
        className={navbarButtonStyle()}
        style={color ? { color } : undefined}
        onClick={handleClick}
        aria-label={t.saveLocalCopyButton}
      >
        <span className={iconOnly ? "hidden" : "hidden lg:inline"}>
          {t.saveLocalCopyButton}
        </span>
      </TooltipTrigger>
      <TooltipContent>{t.saveLocalCopyButton}</TooltipContent>
    </Tooltip>
  );
};
