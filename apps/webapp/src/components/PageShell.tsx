import type { ReactNode } from "react"
import { cn } from "@umlstudio/ui/lib/utils"

export interface PageShellProps {
  header: ReactNode
  children: ReactNode
  contentClassName?: string
  mainClassName?: string
  ariaLabel?: string
}

export function PageShell({
  header,
  children,
  contentClassName,
  mainClassName,
  ariaLabel,
}: PageShellProps) {
  return (
    <div className="home-canvas-bg relative flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground transition-colors duration-200">
      <div
        className={cn(
          "home-page-scrollbar app-scroll-y relative z-10 w-full min-h-0 flex-1",
          mainClassName
        )}
      >
        <div className="home-content-x mx-auto w-full max-w-[1536px] pt-[calc(var(--safe-area-inset-top,0px)_+_1.25rem)] md:pt-[calc(var(--safe-area-inset-top,0px)_+_1.5rem)]">
          {header}

          <main aria-label={ariaLabel} className={cn("mx-auto w-full", contentClassName)}>
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
