import type { FC } from "react"
import { X, Heart, ArrowUpDown, Layers, RotateCcw } from "lucide-react"
import { Button } from "@umlstudio/ui/components/button"
import { useTranslation } from "@/i18n"
import type { HomeChrome, RefinementKind } from "./useHomeChrome"

const getRefinementIcon = (kind: RefinementKind) => {
  switch (kind) {
    case "favorites":
      return <Heart className="size-3.5 fill-rose-500 text-rose-500 shrink-0" aria-hidden="true" />
    case "source":
      return <Layers className="size-3.5 text-(--dodger-blue) shrink-0" aria-hidden="true" />
    case "sort":
      return <ArrowUpDown className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
    default:
      return null
  }
}

export const HomeRefinementChips: FC<{ chrome: HomeChrome }> = ({ chrome }) => {
  const { activeRefinements, resetAll } = chrome
  const { t } = useTranslation()

  if (activeRefinements.length === 0) {
    return null
  }

  return (
    <div
      role="group"
      aria-label={t.dashboard.filterApplied}
      className="flex flex-wrap items-center gap-2 pt-1"
    >
      <span className="text-xs font-semibold text-muted-foreground mr-0.5">
        {t.dashboard.filterApplied}:
      </span>

      {activeRefinements.map((refinement) => (
        <span
          key={refinement.key}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium text-foreground transition-all duration-150 hover:border-border hover:bg-muted/70 shadow-2xs"
        >
          {getRefinementIcon(refinement.key)}
          <span className="max-w-48 truncate">{refinement.label}</span>
          <button
            type="button"
            onClick={refinement.clear}
            aria-label={`${t.dashboard.cancel}: ${refinement.label}`}
            className="ml-0.5 -mr-1 inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </span>
      ))}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={resetAll}
        className="h-7 gap-1 px-2 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
      >
        <RotateCcw className="size-3" aria-hidden="true" />
        <span>{t.dashboard.filterClearAll}</span>
      </Button>
    </div>
  )
}
