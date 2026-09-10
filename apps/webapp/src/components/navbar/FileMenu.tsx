import { FC, useCallback, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@umlstudio/ui/components/dropdown-menu";
import { Button } from "@umlstudio/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@umlstudio/ui/components/tooltip";
import { ChevronDownIcon, FilesIcon } from "lucide-react";
import { toast, type ToastContentProps } from "react-toastify";
import { useModalContext } from "@/contexts";
import { useMediaQuery } from "@/hooks";
import {
  useExportAsJSON,
  useExportAsPNG,
  useExportAsSpringBoot,
  useExportAsSVG,
  useExportAsXMI,
} from "@/hooks";
import { log } from "@/logger";
import { EDITOR_SHORTCUTS } from "@/hooks/useEditorShortcuts";
import { formatComboText } from "@/utils/shortcutCaps";
import {
  JsonFileImportButton,
  XmiFileImportButton,
} from "./JsonFileImportButton";
import { navbarButtonStyle } from "./styleConstants";
import { MOBILE_MENU_CONTENT_CLASS } from "./islandPrimitives";
import { useTranslation } from "@/i18n";

interface FileMenuProps {
  color?: string;
  onClose?: () => void;
}

type ExportFormat = "SVG" | "PNG" | "JSON" | "Spring Boot" | "XMI";

type ExportRunResult = { clamped?: boolean; appliedScale?: number };

function exportSuccessMessage(
  format: ExportFormat,
  result: ExportRunResult | void,
): string {
  if (result?.clamped) {
    const scale =
      typeof result.appliedScale === "number"
        ? ` (rendered at ${Math.round(result.appliedScale * 100)}%)`
        : "";
    return `${format} downscaled to fit memory limits${scale}.`;
  }
  return `${format} exported.`;
}

function exportErrorMessage(format: ExportFormat, err: unknown): string {
  if ((err as Error)?.name === "RasterTooLargeError") {
    return "Diagram is too large to export as PNG. Try SVG or JSON instead.";
  }
  return `${format} export failed. Please try again.`;
}

const saveAsJsonShortcut = EDITOR_SHORTCUTS.find(
  (shortcut) => shortcut.id === "save-as-json",
)!.combo;

export function FileMenuItems({ onSelect }: { onSelect: () => void }) {
  const { openModal } = useModalContext();
  const { t } = useTranslation();
  const exportAsSvg = useExportAsSVG("compat");
  const exportAsPng = useExportAsPNG();
  const exportAsJSON = useExportAsJSON();
  const exportAsSpringBoot = useExportAsSpringBoot();
  const exportAsXMI = useExportAsXMI();
  const [busyFormat, setBusyFormat] = useState<ExportFormat | null>(null);

  const handleNewDiagram = useCallback(() => {
    openModal("NEW_DIAGRAM", { dialogVariant: "home" });
    onSelect();
  }, [openModal, onSelect]);

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

      <DropdownMenuSeparator />

      <DropdownMenuGroup>
        <DropdownMenuLabel>Import</DropdownMenuLabel>
        <JsonFileImportButton close={onSelect} />
        <XmiFileImportButton close={onSelect} />
      </DropdownMenuGroup>

      <DropdownMenuSeparator />

      <DropdownMenuGroup>
        <DropdownMenuLabel>{t.menu.exportAs}</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => runExport("SVG", async () => exportAsSvg())}
        >
          {t.menu.exportSvg}
        </DropdownMenuItem>
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
          onClick={() => runExport("JSON", async () => exportAsJSON())}
        >
          {t.menu.exportJson}
          <DropdownMenuShortcut>
            {formatComboText(saveAsJsonShortcut)}
          </DropdownMenuShortcut>
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
              <FilesIcon className="size-4" aria-hidden />
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
