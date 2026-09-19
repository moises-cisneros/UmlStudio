import { FC, useCallback, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@umlstudio/ui/components/dropdown-menu";
import { Button } from "@umlstudio/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@umlstudio/ui/components/tooltip";
import { ChevronDownIcon, FolderKanban } from "lucide-react";
import { toast, type ToastContentProps } from "react-toastify";
import { useModalContext } from "@/contexts";
import { useMediaQuery } from "@/hooks";
import { useExportAsPNG, useExportAsSpringBoot, useExportAsXMI } from "@/hooks";
import { log } from "@/logger";
import { JsonFileImportButton, XmiFileImportButton } from "./XmiFileImportButton";
import { VisionPhotoImportItem } from "./VisionPhotoImportItem";
import { SaveLocalCopyButton } from "./SaveLocalCopyButton";
import { navbarButtonStyle } from "./styleConstants";
import { MOBILE_MENU_CONTENT_CLASS } from "./islandPrimitives";
import { useTranslation } from "@/i18n";
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
import { useNavigate } from "@tanstack/react-router";
import { useEditorContext } from "@/contexts";
import { VisionImportDialog } from "@/components/vision/VisionImportDialog";
import { usePersistenceModelStore } from "@/stores/usePersistenceModelStore";
import { DiagramApiClient } from "@/services/DiagramApiClient";
import { useDiagramIdFromPath } from "@/hooks/useDiagramIdFromPath";
import { useSharedDiagramId } from "@/hooks/useSharedDiagramId";

interface FileMenuProps {
  color?: string;
  onClose?: () => void;
}

type ExportFormat = "PNG" | "Spring Boot" | "XMI" | "JSON";

type ExportRunResult = { clamped?: boolean; appliedScale?: number };

const PNG_SCALES = [1, 2, 4] as const;
const DEFAULT_PNG_SCALE = 1.5;

function exportSuccessMessage(
  format: ExportFormat,
  result?: ExportRunResult | void,
): string {
  if (result?.clamped) {
    return `${format} exported (downscaled to ${result.appliedScale}x to fit memory limits).`;
  }
  return `${format} exported.`;
}

function exportErrorMessage(format: ExportFormat, err: unknown): string {
  if ((err as Error)?.name === "RasterTooLargeError") {
    return "Diagram is too large to export as PNG.";
  }
  return `${format} export failed. Please try again.`;
}

export function FileMenuItems({
  onSelect,
  onImportPhoto,
}: {
  onSelect: () => void;
  onImportPhoto: () => void;
}) {
  const { openModal } = useModalContext();
  const { editor } = useEditorContext();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const diagramId = useDiagramIdFromPath();
  const sharedDiagramId = useSharedDiagramId();
  const deleteModel = usePersistenceModelStore((s) => s.deleteModel);
  const exportAsPng = useExportAsPNG();
  const exportAsSpringBoot = useExportAsSpringBoot();
  const exportAsXMI = useExportAsXMI();

  const exportAsJson = useCallback(async () => {
    if (!editor) {
      throw new Error("Editor not initialized");
    }
    const model = editor.model;
    const title = editor.getDiagramMetadata()?.diagramTitle || model.title || "diagram";
    const filename = `${title.toLowerCase().replace(/[^a-z0-9_-]/gi, "_") || "diagram"}.json`;
    const jsonStr = JSON.stringify(model, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [editor]);

  const [busyFormat, setBusyFormat] = useState<ExportFormat | null>(null);
  const [pngScale, setPngScale] = useState<number>(DEFAULT_PNG_SCALE);
  const [transparentPng, setTransparentPng] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleNewDiagram = useCallback(() => {
    openModal("NEW_DIAGRAM", { dialogVariant: "home" });
    onSelect();
  }, [openModal, onSelect]);

  const handleRenameDiagram = useCallback(() => {
    if (!diagramId) return;
    openModal("RENAME_DIAGRAM", {
      diagramId,
      initialTitle: editor?.getDiagramMetadata()?.diagramTitle || "",
      source: sharedDiagramId ? "shared" : "local",
    });
    onSelect();
  }, [diagramId, editor, openModal, sharedDiagramId, onSelect]);

  const handleShareDiagram = useCallback(() => {
    openModal("SHARE", { dialogVariant: "home" });
    onSelect();
  }, [openModal, onSelect]);

  const handleRequestDelete = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!diagramId || isDeleting) return;
    setIsDeleting(true);
    try {
      if (sharedDiagramId) {
        await DiagramApiClient.deleteDiagram(sharedDiagramId);
      } else {
        deleteModel(diagramId);
      }
      toast.success(t.dashboard.toastDiagramDeletedSuccess);
      setShowDeleteConfirm(false);
      onSelect();
      navigate({ to: "/" });
    } catch (err) {
      log.error("Failed to delete diagram", err as Error);
      toast.error(t.dashboard.toastDiagramDeleteError);
    } finally {
      setIsDeleting(false);
    }
  }, [
    diagramId,
    sharedDiagramId,
    isDeleting,
    deleteModel,
    t,
    navigate,
    onSelect,
  ]);

  const runExport = useCallback(
    async (
      format: ExportFormat,
      action: () => Promise<ExportRunResult | void>,
    ) => {
      if (busyFormat) return;
      onSelect();
      setBusyFormat(format);
      try {
        await toast.promise(action(), {
          pending: `Exporting ${format}…`,
          success: {
            render: ({ data }: ToastContentProps<ExportRunResult | void>) =>
              exportSuccessMessage(format, data),
          },
          error: {
            render: ({ data }: ToastContentProps<unknown>) =>
              exportErrorMessage(format, data),
          },
        });
      } catch (err) {
        log.error("export failed", err as Error);
      } finally {
        setBusyFormat(null);
      }
    },
    [busyFormat, onSelect],
  );

  return (
    <>
      <DropdownMenuItem onClick={handleNewDiagram}>
        {t.menu.newDiagram}
      </DropdownMenuItem>

      <SaveLocalCopyButton variant="menuItem" onAfter={onSelect} />

      <DropdownMenuSeparator />

      <DropdownMenuGroup>
        <DropdownMenuLabel>{t.common.importLabel}</DropdownMenuLabel>
        <JsonFileImportButton close={onSelect} />
        <XmiFileImportButton close={onSelect} />
        <VisionPhotoImportItem close={onSelect} onImportPhoto={onImportPhoto} />
      </DropdownMenuGroup>

      <DropdownMenuSeparator />

      <DropdownMenuGroup>
        <DropdownMenuLabel>{t.menu.exportAs}</DropdownMenuLabel>
        <div
          className="flex flex-col gap-1.5 px-2 py-1.5"
          role="group"
          aria-label="PNG export options"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <span className="text-xs font-medium text-muted-foreground">
            PNG scale
            {pngScale !== DEFAULT_PNG_SCALE ? ` (${pngScale}x)` : " (default)"}
          </span>
          <div
            className="flex items-center gap-1"
            role="radiogroup"
            aria-label="PNG scale"
          >
            {PNG_SCALES.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={pngScale === option}
                aria-label={`${option}x scale`}
                onClick={() => setPngScale(option)}
                className={
                  pngScale === option
                    ? "rounded-md border border-primary bg-primary/10 px-2 py-0.5 text-xs text-foreground"
                    : "rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground"
                }
              >
                {option}x
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={transparentPng}
              onChange={(e) => setTransparentPng(e.target.checked)}
              aria-label="Transparent background"
            />
            Transparent background
          </label>
        </div>
        <DropdownMenuItem
          disabled={busyFormat === "PNG"}
          onClick={() =>
            runExport("PNG", async () =>
              exportAsPng({ scale: pngScale, transparent: transparentPng }),
            )
          }
        >
          {t.menu.exportPng}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={busyFormat === "JSON"}
          onClick={() => runExport("JSON", async () => exportAsJson())}
        >
          {t.menu.exportJson}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={busyFormat === "XMI"}
          onClick={() => runExport("XMI", async () => exportAsXMI())}
        >
          {t.menu.exportXmi}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={busyFormat === "Spring Boot"}
          onClick={() =>
            runExport("Spring Boot", async () => exportAsSpringBoot())
          }
        >
          {t.menu.exportSpringBoot}
        </DropdownMenuItem>
      </DropdownMenuGroup>

      {diagramId && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleRenameDiagram}>
            {t.menu.renameDiagram}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleShareDiagram}>
            {t.menu.shareDiagram}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            closeOnClick={false}
            onClick={handleRequestDelete}
          >
            {t.menu.deleteDiagram}
          </DropdownMenuItem>
        </>
      )}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.dashboard.confirmDeleteTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.dashboard.confirmDeleteDesc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t.common.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
            >
              {isDeleting ? t.common.deleting : t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export const FileMenu: FC<FileMenuProps> = ({ color, onClose }) => {
  const [open, setOpen] = useState(false);
  const [visionOpen, setVisionOpen] = useState(false);
  const isLg = useMediaQuery("(min-width: 1024px)");
  const { t } = useTranslation();

  const close = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, [onClose]);

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <Tooltip disabled={isLg}>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                id="file-menu-button"
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className={navbarButtonStyle()}
                    style={color ? { color } : undefined}
                    aria-label={t.menu.file}
                  />
                }
              >
                <FolderKanban className="size-4" aria-hidden />
                <span className="hidden lg:inline">{t.menu.file}</span>
                <ChevronDownIcon className="size-4" aria-hidden />
              </DropdownMenuTrigger>
            }
          />
          <TooltipContent>{t.menu.file}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          aria-labelledby="file-menu-button"
          className={MOBILE_MENU_CONTENT_CLASS}
        >
          <FileMenuItems
            onSelect={close}
            onImportPhoto={() => setVisionOpen(true)}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <VisionImportDialog
        open={visionOpen}
        onClose={() => setVisionOpen(false)}
      />
    </>
  );
};
