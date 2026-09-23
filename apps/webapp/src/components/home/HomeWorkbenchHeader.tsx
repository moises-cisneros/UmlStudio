import type { FC } from "react"
import { Search, FolderInput, Plus, FileCode, FileText, Camera, ChevronDown } from "lucide-react"
import { Button } from "@umlstudio/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@umlstudio/ui/components/dropdown-menu"
import { BrandLockup } from "@/components/navbar/BrandLockup"
import { ThemeSwitcherMenu } from "@/components/navbar/ThemeSwitcher"
import { LanguageSwitcher } from "@/components/navbar/LanguageSwitcher"
import { UserAccountMenu } from "@/components/navbar/UserAccountMenu"
import { useTranslation } from "@/i18n"
import { HomeHelpMenu } from "./HomeHelpMenu"
import type { HomeChrome } from "./useHomeChrome"

export type HomeWorkbenchHeaderProps = {
  chrome: HomeChrome
  onNewDiagram?: () => void
  onImportJson?: () => void
  onImportXmi?: () => void
  onImportVision?: () => void
}

export const HomeWorkbenchHeader: FC<HomeWorkbenchHeaderProps> = ({
  chrome,
  onNewDiagram,
  onImportJson,
  onImportXmi,
  onImportVision,
}) => {
  const { searchTerm, setSearchTerm } = chrome
  const { t } = useTranslation()

  const hasImportOptions = onImportJson || onImportXmi || onImportVision

  return (
    <div className="sticky top-0 z-20 flex flex-col gap-2.5 border-b border-border-subtle bg-surface px-4 py-2.5 pt-0 md:px-6">
      <h1 className="sr-only">{t.dashboard.title}</h1>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BrandLockup />
        </div>

        <div className="flex min-w-60 flex-1 max-w-md items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-border-subtle bg-(--home-surface-raised) px-3 py-1.5 focus-within:border-(--dodger-blue)">
            <Search className="size-4 shrink-0 opacity-60 text-secondary-foreground" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t.dashboard.searchPlaceholder}
              className="w-full border-none bg-transparent text-xs text-(--home-text-primary) outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasImportOptions && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border-subtle bg-(--home-surface-raised) text-xs"
                  >
                    <FolderInput className="size-3.5 mr-1" />
                    <span className="hidden sm:inline">{t.dashboard.importDiagram}</span>
                    <ChevronDown className="size-3 ml-1 opacity-70" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-56">
                {onImportJson && (
                  <DropdownMenuItem onClick={onImportJson} className="cursor-pointer gap-2 text-xs">
                    <FileCode className="size-4 text-emerald-500 shrink-0" />
                    <div className="flex flex-col">
                      <span className="font-medium">{t.dashboard.importJson}</span>
                      <span className="text-[10px] text-muted-foreground">UmlStudio JSON</span>
                    </div>
                  </DropdownMenuItem>
                )}
                {onImportXmi && (
                  <DropdownMenuItem onClick={onImportXmi} className="cursor-pointer gap-2 text-xs">
                    <FileText className="size-4 text-blue-500 shrink-0" />
                    <div className="flex flex-col">
                      <span className="font-medium">{t.dashboard.importXmi}</span>
                      <span className="text-[10px] text-muted-foreground">
                        Enterprise Architect XMI
                      </span>
                    </div>
                  </DropdownMenuItem>
                )}
                {onImportVision && (
                  <DropdownMenuItem
                    onClick={onImportVision}
                    className="cursor-pointer gap-2 text-xs"
                  >
                    <Camera className="size-4 text-amber-500 shrink-0" />
                    <div className="flex flex-col">
                      <span className="font-medium">{t.dashboard.importPhoto}</span>
                      <span className="text-[10px] text-muted-foreground">
                        Reconocimiento IA (Vision)
                      </span>
                    </div>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
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

          <div className="hidden h-5 w-px bg-border-subtle sm:block" />
          <UserAccountMenu variant="home" />
        </div>
      </div>
    </div>
  )
}
