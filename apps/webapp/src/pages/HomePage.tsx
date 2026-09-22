import React, { lazy, Suspense, useEffect, useMemo, useRef } from "react"
import { useLocation } from "@tanstack/react-router"
import { type UMLDiagramType } from "@umlstudio/core"
import { usePersistenceModelStore } from "@/stores/usePersistenceModelStore"
import { useModalContext } from "@/contexts"
import { useImportDiagramFile } from "@/hooks/useImportDiagramFile"
import { DiagramGallerySkeleton } from "@/components/home/DiagramGallerySkeleton"
import { HomeWorkbenchHeader } from "@/components/home/HomeWorkbenchHeader"
import { PageShell } from "@/components/PageShell"
import { useHomeChrome } from "@/components/home/useHomeChrome"
import { getDiagramTypeLabel } from "@/components/home/diagramTypeMeta"
import { pruneExpiredSharedDiagrams } from "@/utils/sharedDiagramStorage"
import { readHighlightSharedDiagramId } from "@/lib/navProvenance"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { useTranslation } from "@/i18n"

import { Heart, LayoutGrid, List, SlidersHorizontal } from "lucide-react"
import { Button } from "@umlstudio/ui/components/button"
import { Badge } from "@umlstudio/ui/components/badge"
import { cn } from "@umlstudio/ui/lib/utils"
import { RefinePopover } from "@/components/home/RefinePopover"
import { HomeRefinementChips } from "@/components/home/HomeRefinementChips"

const DiagramGallery = lazy(() =>
  import("@/components/home/DiagramGallery").then((module) => ({
    default: module.DiagramGallery,
  }))
)

export const HomePage = () => {
  const { t } = useTranslation()
  useDocumentTitle(t.dashboard.title)
  const location = useLocation()
  const highlightSharedDiagramId = readHighlightSharedDiagramId(location.state) ?? null
  const { openModal } = useModalContext()
  const setCurrentModelId = usePersistenceModelStore((state) => state.setCurrentModelId)
  const jsonImportRef = useRef<HTMLInputElement>(null)
  const importFile = useImportDiagramFile()

  const chrome = useHomeChrome()

  const openNewDiagram = () => openModal("NEW_DIAGRAM", { dialogVariant: "home" })
  const triggerJsonImport = () => jsonImportRef.current?.click()

  const handleJsonImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void importFile(file)
    e.target.value = ""
  }

  useEffect(() => {
    setCurrentModelId(null)
  }, [setCurrentModelId])

  useEffect(() => {
    pruneExpiredSharedDiagrams()
  }, [])

  const [presentTypes, setPresentTypes] = React.useState<readonly UMLDiagramType[]>([])
  const typeOptions = useMemo(
    () =>
      [...presentTypes].sort((firstType, secondType) =>
        getDiagramTypeLabel(firstType).localeCompare(getDiagramTypeLabel(secondType))
      ),
    [presentTypes]
  )

  return (
    <PageShell
      mainClassName="pb-[max(4rem,calc(var(--safe-area-inset-bottom,0px)+2.5rem))] md:pb-[max(2.5rem,var(--safe-area-inset-bottom,0px))]"
      header={
        <HomeWorkbenchHeader
          chrome={chrome}
          onNewDiagram={openNewDiagram}
          onImportJson={triggerJsonImport}
        />
      }
    >
      <input
        ref={jsonImportRef}
        type="file"
        accept=".json,application/json,.xmi,.xml,application/xml,text/xml"
        className="sr-only"
        onChange={handleJsonImport}
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className="mt-6 px-4 md:px-0">
        <div className="mb-6 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-black tracking-tight text-(--home-text-primary)">
              {t.dashboard.title}
            </h2>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={chrome.toggleFavoritesOnly}
                data-active={chrome.favoritesOnly}
                aria-label={t.dashboard.filterFavorites}
                title={t.dashboard.filterFavorites}
                className={cn(
                  "h-8 gap-1.5 border-border-subtle px-3 text-xs font-medium transition-colors",
                  chrome.favoritesOnly
                    ? "border-rose-500/50 bg-rose-500/15 text-rose-500 hover:bg-rose-500/20 hover:text-rose-500"
                    : "bg-(--home-card-surface) text-secondary-foreground hover:bg-(--home-surface-hover) hover:text-(--home-text-primary)"
                )}
              >
                <Heart
                  className="size-3.5"
                  fill={chrome.favoritesOnly ? "currentColor" : "none"}
                  aria-hidden="true"
                />
                <span>{t.dashboard.filterFavoritesOnly}</span>
              </Button>

              <RefinePopover
                variant="popover"
                chrome={chrome}
                typeOptions={typeOptions}
                trigger={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 border-border-subtle bg-(--home-card-surface) px-3 text-xs font-medium text-secondary-foreground hover:bg-(--home-surface-hover) hover:text-(--home-text-primary)"
                    aria-label={t.dashboard.filterTitle}
                  >
                    <SlidersHorizontal className="size-3.5" aria-hidden />
                    <span>{t.dashboard.filterTitle}</span>
                    {chrome.refineCount > 0 && (
                      <Badge className="size-4 min-w-0 px-0 text-[10px]">
                        {chrome.refineCount}
                      </Badge>
                    )}
                  </Button>
                }
              />

              <div
                role="group"
                aria-label="View mode"
                className="flex items-center rounded-lg border border-border/50 bg-(--home-card-surface) p-0.5 shadow-xs"
              >
                <Button
                  type="button"
                  variant={chrome.viewMode === "list" ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-8 gap-1.5 px-3 text-xs font-medium transition-colors",
                    chrome.viewMode === "list"
                      ? "bg-(--home-surface-hover) text-(--home-text-primary) shadow-2xs"
                      : "text-muted-foreground hover:text-(--home-text-primary)"
                  )}
                  onClick={() => chrome.setViewMode("list")}
                  aria-label={t.dashboard.viewModeListAria}
                  title={t.dashboard.viewModeList}
                >
                  <List className="size-4" aria-hidden="true" />
                  <span>{t.dashboard.viewModeList}</span>
                </Button>
                <Button
                  type="button"
                  variant={chrome.viewMode === "cards" ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-8 gap-1.5 px-3 text-xs font-medium transition-colors",
                    chrome.viewMode === "cards"
                      ? "bg-(--home-surface-hover) text-(--home-text-primary) shadow-2xs"
                      : "text-muted-foreground hover:text-(--home-text-primary)"
                  )}
                  onClick={() => chrome.setViewMode("cards")}
                  aria-label={t.dashboard.viewModeCardsAria}
                  title={t.dashboard.viewModeCards}
                >
                  <LayoutGrid className="size-4" aria-hidden="true" />
                  <span>{t.dashboard.viewModeCards}</span>
                </Button>
              </div>
            </div>
          </div>

          <HomeRefinementChips chrome={chrome} />
        </div>

        <Suspense fallback={<DiagramGallerySkeleton />}>
          <DiagramGallery
            chrome={chrome}
            highlightSharedDiagramId={highlightSharedDiagramId}
            onTypeOptionsChange={setPresentTypes}
          />
        </Suspense>
      </div>
    </PageShell>
  )
}
