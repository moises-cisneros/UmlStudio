import { Link } from "@tanstack/react-router"
import { TooltipProvider } from "@umlstudio/ui/components/tooltip"
import { Island, GroupDivider } from "./islandPrimitives"
import { BackNav } from "./BackNav"
import { BrandLockup } from "./BrandLockup"
import { ThemeSwitcherMenu } from "./ThemeSwitcher"
import { HomeHelpMenu } from "@/components/home/HomeHelpMenu"
import { useBackTarget } from "@/hooks/useBackTarget"

export const ChromeSubHeader = () => {
  const backTarget = useBackTarget()

  return (
    <TooltipProvider>
      <div className="sticky top-[calc(var(--safe-area-inset-top,0px)_+_0.75rem)] z-20 flex items-start gap-[var(--umlstudio-chrome-gap)] pb-2 md:top-[calc(var(--safe-area-inset-top,0px)_+_1rem)]">
        <Island as="header" role="banner" ariaLabel="Home">
          <Link
            to="/"
            aria-label="UmlStudio home"
            className="flex shrink-0 items-center rounded-sm text-[color:var(--umlstudio-chrome-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--umlstudio-chrome-accent)]"
          >
            <BrandLockup />
          </Link>
          <GroupDivider />

          <BackNav {...backTarget} tone="onDark" labelClassName="hidden min-[360px]:inline" />
        </Island>

        <div className="flex-1" />

        <Island ariaLabel="Page actions">
          <HomeHelpMenu reveal="lg" />
          <ThemeSwitcherMenu />
        </Island>
      </div>
    </TooltipProvider>
  )
}
