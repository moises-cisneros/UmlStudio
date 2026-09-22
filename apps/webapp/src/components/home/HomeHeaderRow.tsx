import { useEffect, useRef, useState } from "react"
import { ChevronDownIcon, FolderInput, Plus, Search, SlidersHorizontal, Heart } from "lucide-react"
import type { UMLDiagramType } from "@umlstudio/core"
import { Badge } from "@umlstudio/ui/components/badge"
import {
  GroupDivider,
  Island,
  IslandInput,
  ISLAND_LAYOUT_STYLE,
} from "@/components/navbar/islandPrimitives"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@umlstudio/ui/components/tooltip"
import { navbarButtonStyle } from "@/components/navbar/styleConstants"
import { useMediaQuery } from "@/hooks"
import { BrandLockup } from "@/components/navbar/BrandLockup"
import { ThemeSwitcherMenu } from "@/components/navbar/ThemeSwitcher"
import { RefinePopover } from "./RefinePopover"
import { HomeRefinementChips } from "./HomeRefinementChips"
import { HomeBrandPill } from "./HomeBrandPill"
import { HomeActionsPill } from "./HomeActionsPill"
import { HomeHelpMenu } from "./HomeHelpMenu"
import type { HomeChrome } from "./useHomeChrome"

export type HomeHeaderRowProps = {
  chrome: HomeChrome
  count: number
  typeOptions: readonly UMLDiagramType[]
  onNewDiagram?: () => void
  onImportJson?: () => void
}

export function HomeHeaderRow({
  chrome,
  count,
  typeOptions,
  onNewDiagram,
  onImportJson,
}: HomeHeaderRowProps) {
  return (
    <div className="sticky top-[calc(var(--safe-area-inset-top,0px)_+_0.75rem)] z-20 flex flex-col gap-[var(--umlstudio-chrome-gap)] pb-2 md:top-[calc(var(--safe-area-inset-top,0px)_+_1rem)]">
      <h1 className="sr-only">Your diagrams</h1>

      <div className="hidden items-start gap-[var(--umlstudio-chrome-gap)] md:flex">
        <HomeBrandIsland />
        <div className="flex min-w-[200px] flex-1">
          <HomeSearchIsland chrome={chrome} count={count} />
        </div>
        <HomeActionsIsland
          chrome={chrome}
          typeOptions={typeOptions}
          onNewDiagram={onNewDiagram}
          onImportJson={onImportJson}
        />
      </div>

      <div className="flex items-start gap-[var(--umlstudio-chrome-gap)] md:hidden">
        <HomeBrandPill />
        <div className="min-w-0 flex-1">
          <MobileSearchPill chrome={chrome} count={count} />
        </div>
        <HomeActionsPill chrome={chrome} typeOptions={typeOptions} onImportJson={onImportJson} />
      </div>

      <HomeRefinementChips chrome={chrome} />
    </div>
  )
}

function HomeBrandIsland() {
  return (
    <Island as="header" role="banner" ariaLabel="Home">
      <BrandLockup />
    </Island>
  )
}

function HomeSearchIsland({ chrome, count }: { chrome: HomeChrome; count: number }) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <Island
      className="umlstudio-chrome-title-island w-full"
      ariaLabel="Search diagrams"
      style={{ maxWidth: "560px" }}
    >
      <Search
        className="size-3.5 shrink-0 text-[color:var(--umlstudio-chrome-text-muted)]"
        aria-hidden
      />
      <IslandInput
        ref={inputRef}
        type="search"
        value={chrome.searchTerm}
        onChange={(event) => chrome.setSearchTerm(event.target.value)}
        placeholder="Search diagrams"
        aria-label="Search diagrams by name"
        className="flex-1"
      />
      <span
        aria-hidden
        className="shrink-0 px-1 text-xs font-medium tabular-nums select-none text-[color:var(--umlstudio-chrome-text)]"
      >
        {count}
      </span>
    </Island>
  )
}

function HomeActionsIsland({
  chrome,
  typeOptions,
  onNewDiagram,
  onImportJson,
}: {
  chrome: HomeChrome
  typeOptions: readonly UMLDiagramType[]
  onNewDiagram?: () => void
  onImportJson?: () => void
}) {
  const isWide = useMediaQuery("(min-width: 940px)")
  return (
    <TooltipProvider>
      <Island ariaLabel="Home actions">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="umlstudio-chrome-iconbtn"
                aria-pressed={chrome.favoritesOnly}
                aria-label={chrome.favoritesOnly ? "Show all diagrams" : "Show favorites only"}
                onClick={chrome.toggleFavoritesOnly}
                style={chrome.favoritesOnly ? { color: "rgb(244 63 94)" } : undefined}
              >
                <Heart
                  className="size-[var(--umlstudio-chrome-icon)]"
                  fill={chrome.favoritesOnly ? "currentColor" : "none"}
                  aria-hidden
                />
              </button>
            }
          />
          <TooltipContent>Favorites</TooltipContent>
        </Tooltip>

        <GroupDivider />

        <Tooltip disabled={isWide}>
          <RefinePopover
            variant="popover"
            chrome={chrome}
            typeOptions={typeOptions}
            trigger={
              <TooltipTrigger
                render={
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
                    <ChevronDownIcon className="size-4" aria-hidden />
                  </button>
                }
              />
            }
          />
          <TooltipContent>Filter</TooltipContent>
        </Tooltip>

        <GroupDivider />

        <Tooltip disabled={isWide}>
          <TooltipTrigger
            render={
              <button
                type="button"
                className={navbarButtonStyle()}
                aria-label="Import"
                onClick={onImportJson}
              >
                <FolderInput className="size-4" aria-hidden />

                <span className="hidden min-[940px]:inline">Import</span>
              </button>
            }
          />
          <TooltipContent>Import</TooltipContent>
        </Tooltip>
        <button
          type="button"
          className={navbarButtonStyle("umlstudio-chrome-accent-btn")}
          onClick={onNewDiagram}
        >
          <Plus className="size-4" aria-hidden />
          <span>New diagram</span>
        </button>

        <GroupDivider />

        <HomeHelpMenu reveal="wide" />
        <ThemeSwitcherMenu />
      </Island>
    </TooltipProvider>
  )
}

function MobileSearchPill({ chrome, count }: { chrome: HomeChrome; count: number }) {
  const [expanded, setExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const open = () => {
    setExpanded(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const isActive = expanded || chrome.searchTerm.length > 0

  if (!isActive) {
    return (
      <button
        type="button"
        onClick={open}
        aria-label="Search diagrams"
        className="umlstudio-glass umlstudio-chrome-island w-full cursor-pointer"
        style={{ ...ISLAND_LAYOUT_STYLE, width: "100%" }}
      >
        <Search
          className="size-4 shrink-0 text-[color:var(--umlstudio-chrome-text-muted)]"
          aria-hidden
        />
        <span className="min-w-0 truncate text-sm font-medium text-[color:var(--umlstudio-chrome-text)]">
          Search diagrams
        </span>
      </button>
    )
  }

  return (
    <div
      className="umlstudio-glass umlstudio-chrome-island umlstudio-chrome-title-island w-full"
      style={{ ...ISLAND_LAYOUT_STYLE, width: "100%" }}
    >
      <Search
        className="size-4 shrink-0 text-[color:var(--umlstudio-chrome-text-muted)]"
        aria-hidden
      />
      <IslandInput
        ref={inputRef}
        type="search"
        value={chrome.searchTerm}
        onChange={(event) => chrome.setSearchTerm(event.target.value)}
        onBlur={() => setExpanded(false)}
        placeholder="Search diagrams"
        aria-label="Search diagrams by name"
        className="flex-1"
      />
      <span
        aria-hidden
        className="shrink-0 px-1 text-xs font-medium tabular-nums select-none text-[color:var(--umlstudio-chrome-text)]"
      >
        {count}
      </span>
    </div>
  )
}
