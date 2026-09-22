import { cn } from "@umlstudio/ui/lib/utils"

export const navbarButtonStyle = (className?: string): string =>
  cn(
    "inline-flex min-w-0 cursor-pointer items-center justify-start gap-1 whitespace-nowrap text-left",
    "min-h-[var(--umlstudio-chrome-btn)] rounded-[var(--umlstudio-chrome-radius-sm)] px-2 py-1",
    "border-0 bg-transparent text-sm leading-tight font-medium normal-case",
    "text-foreground transition-colors",
    "hover:bg-[var(--umlstudio-chrome-surface-hover)]",
    "active:bg-[var(--umlstudio-chrome-surface-active)]",
    "focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--umlstudio-chrome-accent)_45%,transparent)] focus-visible:outline-none",
    className
  )

export type ChromeReveal = "lg" | "wide" | "always"
export const CHROME_REVEAL: Record<ChromeReveal, { labelClass: string; mq: string }> = {
  lg: { labelClass: "hidden lg:inline", mq: "(min-width: 1024px)" },
  wide: { labelClass: "hidden min-[940px]:inline", mq: "(min-width: 940px)" },
  always: { labelClass: "inline", mq: "(min-width: 0px)" },
}
