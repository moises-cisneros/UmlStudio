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
import { XmiFileImportButton } from "./XmiFileImportButton";
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
import { usePersistenceModelStore } from "@/stores/usePersistenceModelStore";
import { DiagramApiClient } from "@/services/DiagramApiClient";
import { useDiagramIdFromPath } from "@/hooks/useDiagramIdFromPath";
import { useSharedDiagramId } from "@/hooks/useSharedDiagramId";

interface FileMenuProps {
  color?: string;
  onClose?: () => void;
}

type ExportFormat = "PNG" | "Spring Boot" | "XMI";

type ExportRunResult = { clamped?: boolean; appliedScale?: number };

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

export function FileMenuItems({ onSelect }: { onSelect: () => void }) {
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
  const [busyFormat, setBusyFormat] = useState<ExportFormat | null>(null);
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
      toast.success("Diagram deleted successfully");
      setShowDeleteConfirm(false);
      onSelect();
      navigate({ to: "/" });
    } catch (err) {
      log.error("Failed to delete diagram", err as Error);
      toast.error("Could not delete diagram. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  }, [diagramId, sharedDiagramId, isDeleting, deleteModel, navigate, onSelect]);

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
        <DropdownMenuLabel>Import</DropdownMenuLabel>
        <XmiFileImportButton close={onSelect} />
      </DropdownMenuGroup>

      <DropdownMenuSeparator />

      <DropdownMenuGroup>
        <DropdownMenuLabel>{t.menu.exportAs}</DropdownMenuLabel>
        <DropdownMenuItem
          disabled={busyFormat === "PNG"}
          onClick={() =>
            runExport("PNG", async () =>
              exportAsPng({ setWhiteBackground: true }),
            )
          }
        >
          {t.menu.exportPng}
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
            Rename diagram…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleShareDiagram}>
            Share diagram…
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            closeOnClick={false}
            onClick={handleRequestDelete}
          >
            Delete diagram…
          </DropdownMenuItem>
        </>
      )}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Diagram?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete this diagram? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export const FileMenu: FC<FileMenuProps> = ({ color, onClose }) => {
  const [open, setOpen] = useState(false);
  const isLg = useMediaQuery("(min-width: 1024px)");
  const { t } = useTranslation();

  const close = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, [onClose]);

  return (
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
        <FileMenuItems onSelect={close} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
