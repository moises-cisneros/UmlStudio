import { Link } from "@tanstack/react-router";
import { Button } from "@umlstudio/ui/components/button";
import { Share2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@umlstudio/ui/components/tooltip";
import { useModalContext } from "@/contexts";
import { useMediaQuery } from "@/hooks";
import { ALL_DIAGRAMS_LABEL } from "@/lib/navProvenance";
import { BrandLockup } from "./BrandLockup";
import { BackNav } from "./BackNav";
import { FileMenu } from "./FileMenu";
import { HelpMenu } from "./HelpMenu";
import { VersionHistoryButton } from "./VersionHistoryButton";
import { ThemeSwitcherMenu } from "./ThemeSwitcher";
import { MobileBackPill, MobileActionsPill } from "./MobileIslands";
import { navbarButtonStyle } from "./styleConstants";
import { Island, GroupDivider } from "./islandPrimitives";
import { HeaderTitleField } from "./HeaderTitleField";
import { useDiagramTitle } from "./useDiagramTitle";
import { CanvasHeaderActions } from "./CanvasHeaderActions";

interface EditorHeaderRowProps {
  layout: "full" | "narrow";
  hideBrand: boolean;
}

export function EditorHeaderRow({ layout, hideBrand }: EditorHeaderRowProps) {
  const isNarrow = layout === "narrow";
  return (
    <TooltipProvider>
      <div className="umlstudio-chrome-header-row">
        {isNarrow ? (
          <MobileBackPill />
        ) : (
          <HeaderBrandIsland showLogo={!hideBrand} />
        )}
        <div className="umlstudio-chrome-header-spacer">
          <HeaderTitleIsland />
        </div>
        {isNarrow ? <MobileActionsPill /> : <HeaderActionsIsland />}
      </div>
    </TooltipProvider>
  );
}

export function HeaderBrandIsland({ showLogo = true }: { showLogo?: boolean }) {
  return (
    <Island as="header" role="banner" ariaLabel="Editor">
      {showLogo && (
        <>
          <Link
            to="/"
            aria-label="UmlStudio home"
            style={{
              display: "flex",
              alignItems: "center",
              color: "inherit",
              textDecoration: "none",
            }}
          >
            <BrandLockup />
          </Link>
          <GroupDivider />
        </>
      )}
      <BackNav
        to="/"
        label={ALL_DIAGRAMS_LABEL}
        labelClassName="hidden lg:inline"
      />
    </Island>
  );
}

export function HeaderTitleIsland() {
  const { value, onValueChange } = useDiagramTitle();
  return <HeaderTitleField value={value} onValueChange={onValueChange} />;
}

export function HeaderActionsIsland() {
  const { openModal } = useModalContext();
  const isLg = useMediaQuery("(min-width: 1024px)");
  return (
    <Island ariaLabel="Editor actions">
      <div className="flex items-center gap-0.5">
        <CanvasHeaderActions />
        <GroupDivider />
        <FileMenu />

        <Tooltip disabled={isLg}>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className={navbarButtonStyle()}
                aria-label="Share"
                onClick={() => openModal("SHARE", { dialogVariant: "home" })}
              >
                <Share2 className="size-4" aria-hidden />
                <span className="hidden lg:inline">Share</span>
              </Button>
            }
          />
          <TooltipContent>Share</TooltipContent>
        </Tooltip>
        <VersionHistoryButton />
      </div>
      <GroupDivider />
      <div className="flex items-center gap-0.5">
        <HelpMenu />
        <ThemeSwitcherMenu />
      </div>
    </Island>
  );
}
