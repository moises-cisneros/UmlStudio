import { ReactNode, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@umlstudio/ui/components/dropdown-menu";
import { IconButton } from "@umlstudio/ui/components/icon-button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@umlstudio/ui/components/tooltip";
import { HelpCircle, FolderKanban, Share2 } from "lucide-react";
import { useModalContext } from "@/contexts";
import { ALL_DIAGRAMS_LABEL } from "@/lib/navProvenance";
import { BackNav } from "./BackNav";
import { FileMenuItems } from "./FileMenu";
import { VisionImportDialog } from "@/components/vision/VisionImportDialog";
import { SaveLocalCopyButton } from "./SaveLocalCopyButton";
import { ThemeSwitcherMenu } from "./ThemeSwitcher";
import { VersionHistoryButton } from "./VersionHistoryButton";
import {
  ISLAND_LAYOUT_STYLE,
  MOBILE_MENU_CONTENT_CLASS,
} from "./islandPrimitives";

export function MobileMenuButton({
  label,
  icon,
  id,
  children,
}: {
  label: string;
  icon: ReactNode;
  id: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const triggerId = `${id}-button`;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              id={triggerId}
              className="umlstudio-chrome-iconbtn"
              aria-label={label}
            >
              {icon}
            </DropdownMenuTrigger>
          }
        />
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        aria-labelledby={triggerId}
        align="end"
        side="bottom"
        className={MOBILE_MENU_CONTENT_CLASS}
      >
        {children(close)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const PILL_STYLE = ISLAND_LAYOUT_STYLE;

export function MobileBackPill() {
  return (
    <header
      role="banner"
      aria-label="Editor"
      className="umlstudio-glass umlstudio-chrome-island"
      style={PILL_STYLE}
    >
      <BackNav to="/" label={ALL_DIAGRAMS_LABEL} labelClassName="hidden" />
    </header>
  );
}

export function MobileActionsPill() {
  const { openModal } = useModalContext();
  const [visionOpen, setVisionOpen] = useState(false);

  return (
    <div
      aria-label="Editor actions"
      className="umlstudio-glass umlstudio-chrome-island"
      style={PILL_STYLE}
    >
      <MobileMenuButton
        id="mobile-file"
        label="File"
        icon={
          <FolderKanban
            className="size-[var(--umlstudio-chrome-icon)]"
            aria-hidden
          />
        }
      >
        {(close) => (
          <>
            <FileMenuItems
              onSelect={close}
              onImportPhoto={() => setVisionOpen(true)}
            />
            <DropdownMenuSeparator />
            <SaveLocalCopyButton variant="menuItem" onAfter={close} />
          </>
        )}
      </MobileMenuButton>

      <IconButton
        ariaLabel="Share"
        tooltip="Share"
        className="umlstudio-chrome-iconbtn"
        onClick={() => openModal("SHARE", { dialogVariant: "home" })}
      >
        <Share2 className="size-4" aria-hidden />
      </IconButton>
      <VersionHistoryButton variant="icon" />

      <IconButton
        ariaLabel="Help"
        tooltip="Help"
        className="umlstudio-chrome-iconbtn"
        onClick={() => openModal("HowToUseModal", { variant: "editor" })}
      >
        <HelpCircle className="size-4" aria-hidden />
      </IconButton>

      <ThemeSwitcherMenu />
      <VisionImportDialog
        open={visionOpen}
        onClose={() => setVisionOpen(false)}
      />
    </div>
  );
}
