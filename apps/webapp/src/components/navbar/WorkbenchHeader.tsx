import { type FC, useEffect } from "react"
import { Link } from "@tanstack/react-router"
import { Button } from "@umlstudio/ui/components/button"
import { Share2 } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@umlstudio/ui/components/tooltip"
import { useModalContext, useEditorContext } from "@/contexts"
import { useMediaQuery } from "@/hooks"
import { BrandLockup } from "./BrandLockup"
import { FileMenu } from "./FileMenu"
import { EditMenu } from "./EditMenu"
import { SelectionMenu } from "./SelectionMenu"
import { CanvasHeaderActions } from "./CanvasHeaderActions"
import { HelpMenu } from "./HelpMenu"
import { VersionHistoryButton } from "./VersionHistoryButton"
import { ThemeSwitcherMenu } from "./ThemeSwitcher"
import { CollaboratorPresence } from "./CollaboratorPresence"
import { LanguageSwitcher } from "./LanguageSwitcher"
import { UserAccountMenu } from "./UserAccountMenu"
import { navbarButtonStyle } from "./styleConstants"
import { useDiagramTitle } from "./useDiagramTitle"
import { useWorkbenchStore } from "@/stores/useWorkbenchStore"
import { useTranslation } from "@/i18n"

interface WorkbenchHeaderProps {
  layout?: "full" | "narrow"
  hideBrand?: boolean
}

export const WorkbenchHeader: FC<WorkbenchHeaderProps> = ({ hideBrand = false }) => {
  const { openModal } = useModalContext()
  const { editor } = useEditorContext()
  const { t } = useTranslation()
  const isLg = useMediaQuery("(min-width: 1024px)")
  const { value: titleValue, onValueChange: onTitleChange } = useDiagramTitle()
  const { toggleAgentDock, setActiveDockTab } = useWorkbenchStore()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault()
        toggleAgentDock()
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setActiveDockTab("agent")
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleAgentDock, setActiveDockTab])

  return (
    <TooltipProvider>
      <header className="workbench-top-header" role="banner" aria-label="Workbench Header">
        {/* SECTOR IZQUIERDO: MARCA, TITULO Y MENUS */}
        <div className="workbench-brand-group">
          {!hideBrand && (
            <Link
              to="/"
              aria-label={t.navigation.allDiagrams}
              className="flex items-center text-inherit no-underline transition-opacity hover:opacity-85"
            >
              <BrandLockup />
            </Link>
          )}

          <div className="hidden h-5 w-px bg-border-subtle sm:block" />

          {/* TITULO DEL DIAGRAMA CON INDICADOR DE SINCRONIZACIÓN LUA/REDIS */}
          <div
            className="workbench-title-chip"
            title={`${titleValue || t.navigation.untitledDiagram} (${t.navigation.realtimeSync})`}
          >
            <span className="workbench-sync-dot" />
            <input
              type="text"
              value={titleValue}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder={t.navigation.untitledDiagram}
              aria-label="Diagram title"
              className="border-none bg-transparent text-sm font-semibold text-(--home-text-primary) outline-none min-w-24 max-w-56"
            />
          </div>

          <div className="workbench-menu-bar flex items-center gap-1">
            <CanvasHeaderActions />
            <div className="hidden h-4 w-px bg-border-subtle sm:block mx-0.5" />
            <FileMenu />
            <EditMenu />
            <SelectionMenu />
          </div>
        </div>

        {/* SECTOR DERECHO: COLABORADORES, EXPORTAR, COMPARTIR Y AJUSTES */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* INTEGRANTES ACTIVOS (PRESENCIA COLABORATIVA EN TIEMPO REAL) */}
          <CollaboratorPresence editor={editor} />

          {/* COMPARTIR */}
          <Tooltip disabled={isLg}>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className={navbarButtonStyle()}
                  aria-label={t.menu.share}
                  onClick={() => openModal("SHARE", { dialogVariant: "home" })}
                >
                  <Share2 className="size-4" aria-hidden />
                  <span className="hidden lg:inline">{t.menu.share}</span>
                </Button>
              }
            />
            <TooltipContent>{t.menu.share}</TooltipContent>
          </Tooltip>

          <VersionHistoryButton />

          <div className="hidden h-5 w-px bg-border-subtle sm:block mx-0.5" />

          {/* SELECTOR DE IDIOMA */}
          <LanguageSwitcher />

          <HelpMenu />
          <ThemeSwitcherMenu />

          <div className="hidden h-5 w-px bg-border-subtle sm:block mx-0.5" />
          <UserAccountMenu variant="navbar" />
        </div>
      </header>
    </TooltipProvider>
  )
}
