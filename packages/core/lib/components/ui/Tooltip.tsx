import React from "react"
import {
  Tooltip as SharedTooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider as SharedTooltipProvider,
} from "@umlstudio/ui/components/tooltip"
import { useUmlStudioPortalContainer } from "./portalContainer"
import { usePortalThemeVars } from "./portalTheme"

export interface TooltipProps {
  title: React.ReactNode
  children: React.ReactNode
  side?: "top" | "bottom" | "left" | "right"
  delayDuration?: number
}

export const TooltipProvider: React.FC<{
  children: React.ReactNode
  delayDuration?: number
}> = ({ children, delayDuration = 700 }) => (
  <SharedTooltipProvider delay={delayDuration}>
    {children}
  </SharedTooltipProvider>
)

export const Tooltip: React.FC<TooltipProps> = ({
  title,
  children,
  side = "top",
  delayDuration,
}) => {
  const [triggerElement, setTriggerElement] =
    React.useState<HTMLButtonElement | null>(null)
  const portalThemeVars = usePortalThemeVars(triggerElement)
  const portalContainer = useUmlStudioPortalContainer()

  if (!title) return <>{children}</>

  const trigger = React.isValidElement(children) ? (
    <TooltipTrigger
      ref={setTriggerElement}
      render={children as React.ReactElement<Record<string, unknown>>}
      delay={delayDuration}
    />
  ) : (
    <TooltipTrigger ref={setTriggerElement} delay={delayDuration}>
      {children}
    </TooltipTrigger>
  )

  return (
    <SharedTooltip>
      {trigger}
      <TooltipContent
        side={side}
        style={portalThemeVars}
        portalContainer={portalContainer}
      >
        {title}
      </TooltipContent>
    </SharedTooltip>
  )
}
