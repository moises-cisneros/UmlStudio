import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../lib/utils"

const buttonVariants = cva("", {
  variants: {
    variant: {
      default: "",
      outline: "",
      secondary: "",
      ghost: "",
      destructive: "",
      link: "",
    },
    size: {
      default: "",
      xs: "",
      sm: "",
      lg: "",
      icon: "",
      "icon-xs": "",
      "icon-sm": "",
      "icon-lg": "",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
})

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-variant={variant}
      data-size={size}
      className={cn("group/button", className)}
      {...props}
      data-slot="button"
    />
  )
}

export { Button, buttonVariants }
