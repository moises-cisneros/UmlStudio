import { Link } from "@tanstack/react-router"
import { ChevronLeft } from "lucide-react"
import { cn } from "@umlstudio/ui/lib/utils"
import type { BackTarget } from "@/hooks/useBackTarget"

type BackNavTone = "onDark" | "onSurface"

const toneClass: Record<BackNavTone, string> = {
  onDark:
    "text-foreground hover:bg-[var(--umlstudio-chrome-surface-hover)] active:bg-[var(--umlstudio-chrome-surface-active)]",
  onSurface:
    "text-[color:var(--umlstudio-chrome-text)] hover:bg-[var(--umlstudio-chrome-surface-hover)] active:bg-[var(--umlstudio-chrome-surface-active)]",
}

type BackNavProps = BackTarget & {
  tone?: BackNavTone
  onNavigate?: () => void
  className?: string
  labelClassName?: string
}

export const BackNav = ({
  label,
  tone = "onDark",
  onNavigate,
  className,
  labelClassName,
  ...target
}: BackNavProps) => (
  <Link
    {...target}
    onClick={onNavigate}
    aria-label={label}
    className={cn(
      "inline-flex min-h-[var(--umlstudio-chrome-btn)] items-center gap-1 whitespace-nowrap rounded-[var(--umlstudio-chrome-radius-sm)] px-2 py-1 text-sm font-medium transition-colors focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--umlstudio-chrome-accent)_45%,transparent)] focus-visible:outline-none",
      toneClass[tone],
      className
    )}
  >
    <ChevronLeft className="size-4 shrink-0" aria-hidden />
    <span className={labelClassName}>{label}</span>
  </Link>
)
