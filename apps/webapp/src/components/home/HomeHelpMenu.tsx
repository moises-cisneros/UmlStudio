import { CircleHelpIcon } from "lucide-react"
import { Button } from "@umlstudio/ui/components/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@umlstudio/ui/components/tooltip"
import { useTranslation } from "@/i18n"
import { useMediaQuery } from "@/hooks"
import { useModalContext } from "@/contexts"
import {
  navbarButtonStyle,
  CHROME_REVEAL,
  type ChromeReveal,
} from "@/components/navbar/styleConstants"

export type HelpMenuVariant = "home" | "editor"

export interface HomeHelpMenuProps {
  variant?: HelpMenuVariant
  className?: string
  color?: string
  reveal?: ChromeReveal
}

export function HomeHelpMenu({
  variant = "home",
  className,
  color,
  reveal = "lg",
}: HomeHelpMenuProps) {
  const { openModal } = useModalContext()
  const { t } = useTranslation()
  const { labelClass, mq } = CHROME_REVEAL[reveal]
  const labelled = useMediaQuery(mq)

  const handleOpenHelp = () => {
    openModal("HowToUseModal", { variant })
  }

  return (
    <Tooltip disabled={labelled}>
      <TooltipTrigger
        render={
          <Button
            id="help-menu-button"
            variant="ghost"
            size="sm"
            aria-label={t.menu.help}
            onClick={handleOpenHelp}
            className={navbarButtonStyle(className)}
            style={color ? { color } : undefined}
          >
            <CircleHelpIcon className="size-4" aria-hidden />
            <span className={labelClass}>{t.menu.help}</span>
          </Button>
        }
      />
      <TooltipContent>{t.menu.help}</TooltipContent>
    </Tooltip>
  )
}
