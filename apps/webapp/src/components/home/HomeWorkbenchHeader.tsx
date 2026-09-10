import { type FC } from "react";
import {
  Search,
  FolderInput,
  Plus,
  Star,
  SlidersHorizontal,
} from "lucide-react";
import type { UMLDiagramType } from "@umlstudio/core";
import { Button } from "@umlstudio/ui/components/button";
import { Badge } from "@umlstudio/ui/components/badge";
import { BrandLockup } from "@/components/navbar/BrandLockup";
import { ThemeSwitcherMenu } from "@/components/navbar/ThemeSwitcher";
import { LanguageSwitcher } from "@/components/navbar/LanguageSwitcher";
import { navbarButtonStyle } from "@/components/navbar/styleConstants";
import { useTranslation } from "@/i18n";
import { HomeHelpMenu } from "./HomeHelpMenu";
import { RefinePopover } from "./RefinePopover";
import { HomeRefinementChips } from "./HomeRefinementChips";
import type { HomeChrome } from "./useHomeChrome";

export type HomeWorkbenchHeaderProps = {
  chrome: HomeChrome;
  count: number;
  typeOptions: readonly UMLDiagramType[];
  onNewDiagram?: () => void;
  onImportJson?: () => void;
};

export const HomeWorkbenchHeader: FC<HomeWorkbenchHeaderProps> = ({
  chrome,
  count,
  typeOptions,
  onNewDiagram,
  onImportJson,
}) => {
  const { searchTerm, setSearchTerm, favoritesOnly, toggleFavoritesOnly } =
    chrome;
  const { t } = useTranslation();

  return (
    <div className="sticky top-0 z-20 flex flex-col gap-2.5 border-b border-border-subtle bg-surface px-4 py-2.5 pt-0 md:px-6">
      <h1 className="sr-only">{t.dashboard.title}</h1>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BrandLockup />
          <div className="hidden h-5 w-px bg-border-subtle md:block" />
          <span className="hidden text-xs font-semibold text-secondary-foreground md:inline">
            {t.navigation.brandSubtitle}
          </span>
        </div>

        <div className="flex min-w-60 flex-1 max-w-md items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-border-subtle bg-(--home-surface-raised) px-3 py-1.5 focus-within:border-(--dodger-blue)">
            <Search className="size-4 shrink-0 opacity-60 text-secondary-foreground" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`${t.dashboard.searchPlaceholder} (${count} ${t.dashboard.diagramsCount})`}
              className="w-full border-none bg-transparent text-xs text-(--home-text-primary) outline-none"
            />
          </div>

          <button
            type="button"
            onClick={toggleFavoritesOnly}
            data-active={favoritesOnly}
            aria-label={t.dashboard.filterFavorites}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
              favoritesOnly
                ? "border-(--dodger-blue) bg-[rgba(53,144,243,0.15)] text-(--dodger-blue)"
                : "border-border-subtle bg-(--home-surface-raised) text-secondary-foreground hover:text-(--home-text-primary)"
            }`}
          >
            <Star
              className="size-4"
              fill={favoritesOnly ? "currentColor" : "none"}
            />
          </button>

          <RefinePopover
            variant="popover"
            chrome={chrome}
            typeOptions={typeOptions}
            trigger={
              <button
                type="button"
                className={navbarButtonStyle("relative")}
                aria-label="Filter"
              >
                <SlidersHorizontal className="size-4" aria-hidden />
                <span className="hidden min-[940px]:inline">Filter</span>
                {chrome.refineCount > 0 && (
                  <Badge className="size-4 min-w-0 px-0 text-[10px]">
                    {chrome.refineCount}
                  </Badge>
                )}
              </button>
            }
          />
        </div>

        <div className="flex items-center gap-2">
          {onImportJson && (
            <Button
              variant="outline"
              size="sm"
              onClick={onImportJson}
              className="border-border-subtle bg-(--home-surface-raised) text-xs"
            >
              <FolderInput className="size-3.5 mr-1" />
              <span className="hidden sm:inline">{t.dashboard.importJson}</span>
            </Button>
          )}

          {onNewDiagram && (
            <Button
              variant="default"
              size="sm"
              onClick={onNewDiagram}
              className="bg-(--dodger-blue) text-xs font-semibold text-white hover:bg-(--dodger-blue)/90"
            >
              <Plus className="size-3.5 mr-1" />
              <span>{t.dashboard.newDiagram}</span>
            </Button>
          )}

          <div className="hidden h-5 w-px bg-border-subtle sm:block" />

          <LanguageSwitcher />
          <HomeHelpMenu variant="home" />
          <ThemeSwitcherMenu />
        </div>
      </div>

      <HomeRefinementChips chrome={chrome} />
    </div>
  );
};
