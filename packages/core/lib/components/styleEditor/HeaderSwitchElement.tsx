import React from "react"
import { Tooltip } from "@/components/ui"
import { useLabels } from "@/i18n/useLabels"

interface Props {
  onClick: () => void
  isComponentHeaderShown: boolean
  stereotypeLabel: string
  stereotypeValue?: string
}
export const HeaderSwitchElement: React.FC<Props> = ({
  onClick,
  isComponentHeaderShown,
  stereotypeLabel,
  stereotypeValue,
}) => {
  const t = useLabels()
  const displayLabel = stereotypeValue?.trim() || stereotypeLabel
  const buttonLabel = `\u00ab${displayLabel}\u00bb`
  const accessibleLabel = t.stereotypeToggleLabel(displayLabel)
  const tooltipLabel = t.stereotypeToggleTooltip(
    isComponentHeaderShown,
    displayLabel
  )

  return (
    <Tooltip title={tooltipLabel}>
      <button
        type="button"
        className="umlstudio-stereotype-toggle"
        data-state={isComponentHeaderShown ? "on" : "off"}
        aria-pressed={isComponentHeaderShown}
        aria-label={accessibleLabel}
        onClick={onClick}
      >
        <span aria-hidden="true">{buttonLabel}</span>
      </button>
    </Tooltip>
  )
}
