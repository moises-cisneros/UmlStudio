import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"

import { cn } from "../lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

export interface IconButtonProps extends Omit<
  ButtonPrimitive.Props,
  "aria-label" | "children"
> {
  ariaLabel: string
  tooltip?: React.ReactNode
  children: React.ReactNode
}

function IconButton({
  ariaLabel,
  tooltip,
  className,
  type = "button",
  children,
  ...props
}: IconButtonProps) {
  const button = (
    <ButtonPrimitive
      type={type}
      data-slot="icon-button"
      className={cn(className)}
      aria-label={ariaLabel}
      {...props}
    >
      {children}
    </ButtonPrimitive>
  )

  if (!tooltip) {
    return button
  }

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

export { IconButton }
