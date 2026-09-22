import { type AriaRole, type ComponentProps, type CSSProperties, type ReactNode } from "react"
import { cn } from "@umlstudio/ui/lib/utils"

export const ISLAND_LAYOUT_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--umlstudio-chrome-gap)",
  height: "var(--umlstudio-chrome-island-h)",
  paddingLeft: "var(--umlstudio-chrome-pad)",
  paddingRight: "var(--umlstudio-chrome-pad)",
  paddingTop: 0,
  paddingBottom: 0,
  boxSizing: "border-box",
  pointerEvents: "auto",
  maxWidth: "100%",
  minWidth: 0,
}

export const MOBILE_MENU_CONTENT_CLASS =
  "flex w-60 max-w-[calc(100vw-var(--safe-area-inset-left,0px)-var(--safe-area-inset-right,0px)-16px)] flex-col [&_[data-slot=dropdown-menu-item]]:max-md:min-h-11 [&_[data-slot=dropdown-menu-sub-trigger]]:max-md:min-h-11"

export const MOBILE_MENU_SUBCONTENT_CLASS =
  "[&_[data-slot=dropdown-menu-radio-item]]:max-md:min-h-11 [&_[data-slot=dropdown-menu-item]]:max-md:min-h-11"

export function Island({
  children,
  as,
  role,
  ariaLabel,
  className,
  style,
}: {
  children: ReactNode
  as?: "header"
  role?: AriaRole
  ariaLabel?: string
  className?: string
  style?: CSSProperties
}) {
  const Tag = as ?? "div"
  return (
    <Tag
      role={role}
      aria-label={ariaLabel}
      className={cn("umlstudio-glass umlstudio-chrome-island", className)}
      style={style ? { ...ISLAND_LAYOUT_STYLE, ...style } : ISLAND_LAYOUT_STYLE}
    >
      {children}
    </Tag>
  )
}

export function GroupDivider() {
  return (
    <div
      aria-hidden
      style={{
        alignSelf: "stretch",
        width: "1px",
        marginTop: "3px",
        marginBottom: "3px",
        marginLeft: "2px",
        marginRight: "2px",
        backgroundColor: "var(--umlstudio-chrome-border)",
      }}
    />
  )
}

export const IslandInput = ({ className, style, ...props }: ComponentProps<"input">) => {
  return (
    <input
      type="text"
      className={cn("umlstudio-chrome-title-input", className)}
      style={{
        textAlign: "left",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        border: 0,
        outline: "none",
        background: "transparent",
        paddingLeft: 8,
        paddingRight: 8,
        minWidth: 0,
        fontSize: "0.875rem",
        fontWeight: 600,
        color: "var(--umlstudio-chrome-text)",
        ...style,
      }}
      {...props}
    />
  )
}
