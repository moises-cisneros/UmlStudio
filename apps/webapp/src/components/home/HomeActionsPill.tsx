import {
  CircleHelpIcon,
  FolderInput,
  SlidersHorizontal,
  Heart,
} from "lucide-react";
import { Badge } from "@umlstudio/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@umlstudio/ui/components/tooltip";
import type { UMLDiagramType } from "@umlstudio/core";
import { useModalContext } from "@/contexts";
import { ISLAND_LAYOUT_STYLE } from "@/components/navbar/islandPrimitives";
import { useTranslation } from "@/i18n";
import { ThemeSwitcherMenu } from "@/components/navbar/ThemeSwitcher";
import { RefinePopover } from "./RefinePopover";
import type { HomeChrome } from "./useHomeChrome";

export function HomeActionsPill({
  chrome,
  typeOptions,
  onImportJson,
}: {
  chrome: HomeChrome;
  typeOptions: readonly UMLDiagramType[];
  onImportJson?: () => void;
}) {
  const { openModal } = useModalContext();
  const { t } = useTranslation();

  return (
    <TooltipProvider>
      <div
        aria-label="Home actions"
        className="umlstudio-glass umlstudio-chrome-island"
        style={ISLAND_LAYOUT_STYLE}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="umlstudio-chrome-iconbtn"
                aria-pressed={chrome.favoritesOnly}
                aria-label={
                  chrome.favoritesOnly
                    ? "Mostrar todos los diagramas"
                    : t.dashboard.filterFavorites
                }
                onClick={chrome.toggleFavoritesOnly}
                style={
                  chrome.favoritesOnly ? { color: "rgb(244 63 94)" } : undefined
                }
              >
                <Heart
                  className="size-[var(--umlstudio-chrome-icon)]"
                  fill={chrome.favoritesOnly ? "currentColor" : "none"}
                  aria-hidden
                />
              </button>
            }
          />
          <TooltipContent>{t.dashboard.filterFavorites}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <RefinePopover
            variant="sheet"
            chrome={chrome}
            typeOptions={typeOptions}
            trigger={
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className="umlstudio-chrome-iconbtn"
                    aria-label="Filter"
                  >
                    <SlidersHorizontal
                      className="size-[var(--umlstudio-chrome-icon)]"
                      aria-hidden
                    />
                    {chrome.refineCount > 0 && (
                      <Badge
                        className="pointer-events-none absolute -top-0.5 -right-0.5 size-4 min-w-0 px-0 text-[10px]"
                        aria-hidden
                      >
                        {chrome.refineCount}
                      </Badge>
                    )}
                  </button>
                }
              />
            }
          />
          <TooltipContent>Filtro</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="umlstudio-chrome-iconbtn"
                aria-label={t.dashboard.importJson}
                onClick={onImportJson}
              >
                <FolderInput
                  className="size-[var(--umlstudio-chrome-icon)]"
                  aria-hidden
                />
              </button>
            }
          />
          <TooltipContent>{t.dashboard.importJson}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                id="home-help"
                className="umlstudio-chrome-iconbtn"
                aria-label={t.menu.help}
                onClick={() => openModal("HowToUseModal", { variant: "home" })}
              >
                <CircleHelpIcon
                  className="size-[var(--umlstudio-chrome-icon)]"
                  aria-hidden
                />
              </button>
            }
          />
          <TooltipContent>{t.menu.help}</TooltipContent>
        </Tooltip>

        <ThemeSwitcherMenu />
      </div>
    </TooltipProvider>
  );
}
