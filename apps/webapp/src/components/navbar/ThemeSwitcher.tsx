import { DropdownMenuItem } from "@umlstudio/ui/components/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@umlstudio/ui/components/tooltip"
import { cn } from "@umlstudio/ui/lib/utils"
import React from "react"
import { Moon, Sun } from "lucide-react"
import { useShallow } from "zustand/shallow"
import { useThemeStore } from "@/stores/useThemeStore"

interface ThemeSwitcherButtonProps {
  isDarkMode: boolean
  onToggle: () => void
  className?: string
  ref?: React.Ref<HTMLButtonElement>
}

export function ThemeSwitcherButton({
  isDarkMode,
  onToggle,
  className,
  ref,
}: ThemeSwitcherButtonProps) {
  const title = isDarkMode ? "Switch to light mode" : "Switch to dark mode"

  const button = (
    <button
      ref={ref}
      type="button"
      onClick={onToggle}
      aria-label={title}
      className={cn("umlstudio-chrome-iconbtn", className)}
    >
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center transition-[transform,opacity] duration-[250ms]",
          isDarkMode ? "scale-100 rotate-0 opacity-100" : "scale-[0.6] -rotate-90 opacity-0"
        )}
      >
        <Moon className="size-[var(--umlstudio-chrome-icon)]" aria-hidden="true" />
      </span>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center transition-[transform,opacity] duration-[250ms]",
          isDarkMode ? "scale-[0.6] rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"
        )}
      >
        <Sun className="size-[var(--umlstudio-chrome-icon)]" aria-hidden="true" />
      </span>
    </button>
  )

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  )
}

interface ThemeSwitcherMenuProps {
  variant?: "icon" | "menuItem"
  onToggle?: () => void
}

export const ThemeSwitcherMenu: React.FC<ThemeSwitcherMenuProps> = ({
  variant = "icon",
  onToggle,
}) => {
  const { currentTheme, toggleTheme } = useThemeStore(
    useShallow((state) => ({
      currentTheme: state.currentTheme,
      toggleTheme: state.toggleTheme,
    }))
  )
  const isDarkMode = currentTheme === "dark"
  const title = isDarkMode ? "Switch to light mode" : "Switch to dark mode"

  const handleToggle = () => {
    toggleTheme()
    onToggle?.()
  }

  if (variant === "menuItem") {
    return (
      <DropdownMenuItem onClick={handleToggle} aria-label={title} className="justify-between">
        Theme
        {isDarkMode ? (
          <Sun className="size-[var(--umlstudio-chrome-icon)]" aria-hidden="true" />
        ) : (
          <Moon className="size-[var(--umlstudio-chrome-icon)]" aria-hidden="true" />
        )}
      </DropdownMenuItem>
    )
  }

  return <ThemeSwitcherButton isDarkMode={isDarkMode} onToggle={handleToggle} />
}
