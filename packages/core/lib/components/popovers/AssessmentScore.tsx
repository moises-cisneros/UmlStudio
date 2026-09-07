import React from "react"
import { Check, TriangleAlert, X } from "lucide-react"
import { useLabels } from "@/i18n/useLabels"

type AssessmentTone = "positive" | "negative" | "zero" | "ungraded"

const ICON_SIZE = 14

const toneFor = (score?: number): AssessmentTone => {
  if (score === undefined) return "ungraded"
  if (score > 0) return "positive"
  if (score < 0) return "negative"
  return "zero"
}

const iconFor: Record<AssessmentTone, typeof Check> = {
  positive: Check,
  negative: X,
  zero: TriangleAlert,
  ungraded: TriangleAlert,
}

export const AssessmentScore: React.FC<{ score?: number }> = ({ score }) => {
  const t = useLabels()
  const tone = toneFor(score)
  const Icon = iconFor[tone]
  const label =
    score === undefined ? t.notGraded : score > 0 ? `+${score}` : `${score}`

  return (
    <span data-slot="assessment-score" data-tone={tone}>
      <Icon width={ICON_SIZE} height={ICON_SIZE} aria-hidden="true" />
      {label}
    </span>
  )
}
