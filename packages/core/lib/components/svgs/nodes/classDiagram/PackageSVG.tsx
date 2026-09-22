import { MultilineText } from "@/components/svgs/nodes/MultilineText"
import { maxLinesForHeight } from "@/utils/svgTextLayout"
import { LAYOUT } from "@/constants"
import { useDiagramStore } from "@/store"
import { useShallow } from "zustand/shallow"
import AssessmentIcon from "../../AssessmentIcon"
import { SVGComponentProps } from "@/types/SVG"
import { DefaultNodeProps } from "@/types"
import { PACKAGE_TAB_HEIGHT } from "@/utils/geometry/nodeGeometry"

export type PackageSVGProps = SVGComponentProps & {
  data: DefaultNodeProps
}

const padding = 5

export const PackageSVG: React.FC<PackageSVGProps> = ({
  id,
  width,
  height,
  data,
  svgAttributes,
  SIDEBAR_PREVIEW_SCALE,
  showAssessmentResults = false,
}) => {
  const { name } = data
  const assessments = useDiagramStore(useShallow((state) => state.assessments))
  const nodeScore = assessments[id]?.score

  const scaledWidth = width * (SIDEBAR_PREVIEW_SCALE ?? 1)
  const scaledHeight = height * (SIDEBAR_PREVIEW_SCALE ?? 1)

  const strokeColor = data.strokeColor || "var(--umlstudio-foreground, #000000)"
  const fillColor = data.fillColor || "var(--umlstudio-background, white)"
  const textColor = data.textColor || "var(--umlstudio-foreground, #000000)"

  return (
    <svg
      width={scaledWidth}
      height={scaledHeight}
      viewBox={`0 0 ${width} ${height}`}
      overflow="visible"
      {...svgAttributes}
    >
      <g>
        <rect
          x={0}
          y={0}
          width={40}
          height={PACKAGE_TAB_HEIGHT}
          strokeWidth={LAYOUT.LINE_WIDTH}
          stroke={strokeColor}
          fill={fillColor}
        />

        <rect
          x={0}
          y={PACKAGE_TAB_HEIGHT}
          width={width}
          height={height - PACKAGE_TAB_HEIGHT}
          strokeWidth={LAYOUT.LINE_WIDTH}
          stroke={strokeColor}
          fill={fillColor}
        />

        <MultilineText
          text={name}
          x={width / 2}
          y={PACKAGE_TAB_HEIGHT + padding + 7}
          maxWidth={width - 24}
          fontSize={LAYOUT.NAME_FONT_SIZE}
          fontWeight="600"
          fill={textColor}
          verticalAnchor="top"
          maxLines={maxLinesForHeight(
            height - PACKAGE_TAB_HEIGHT - padding - 16,
            LAYOUT.NAME_LINE_HEIGHT
          )}
        />
      </g>

      {showAssessmentResults && <AssessmentIcon x={width - 15} y={-5} score={nodeScore} />}
    </svg>
  )
}
