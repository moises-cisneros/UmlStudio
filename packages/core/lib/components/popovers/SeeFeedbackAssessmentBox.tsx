import { useDiagramStore } from "@/store"
import { useShallow } from "zustand/shallow"
import { AssessmentScore } from "./AssessmentScore"
import { AssessmentHeader, PopoverSection } from "./PopoverLayout"
import { useLabels } from "@/i18n/useLabels"

export const SeeFeedbackAssessmentBox = ({
  type,
  typeLabel,
  name,
  elementId,
  divider = false,
}: {
  type: string
  typeLabel?: string
  name: string
  elementId: string
  divider?: boolean
}) => {
  const t = useLabels()
  const getAssessment = useDiagramStore(
    useShallow((state) => state.getAssessment)
  )
  const assessment = getAssessment(elementId)

  return (
    <PopoverSection divider={divider}>
      <AssessmentHeader type={typeLabel ?? type} name={name} />
      <AssessmentScore score={assessment?.score} />
      {assessment &&
        (assessment.feedback ? (
          <p data-slot="assessment-feedback">{assessment.feedback}</p>
        ) : (
          <p data-slot="assessment-feedback" data-empty="">
            {t.noComment}
          </p>
        ))}
    </PopoverSection>
  )
}
