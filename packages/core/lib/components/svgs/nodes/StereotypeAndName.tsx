import { FC, useMemo } from "react"
import { CustomText } from "./CustomText"
import { MultilineText } from "./MultilineText"
import { LAYOUT } from "@/constants"
import { maxLinesForHeight, wrapTextInRect } from "@/utils/svgTextLayout"
import { stereotypeLabel } from "@/utils/stereotypeLabel"

type VerticalAnchor = "center" | "top"

type Props = {
  name: string
  stereotype?: string
  showStereotype: boolean
  width: number
  height: number
  sideReserve?: number
  verticalAnchor?: VerticalAnchor
  topAnchorY?: number
  nameTextDecoration?: React.SVGProps<SVGTextElement>["textDecoration"]
  fontWeight?: string | number
  fill?: string
}

export const StereotypeAndName: FC<Props> = ({
  name,
  stereotype,
  showStereotype,
  width,
  height,
  sideReserve,
  verticalAnchor = "center",
  topAnchorY = 30,
  nameTextDecoration,
  fontWeight = "bold",
  fill,
}) => {
  const resolvedSideReserve = sideReserve ?? LAYOUT.DEFAULT_PADDING * 2
  const centerX = width / 2
  const nameMaxWidth = Math.max(1, width - resolvedSideReserve)

  const nameMaxLines =
    verticalAnchor === "top"
      ? maxLinesForHeight(height - topAnchorY - LAYOUT.NAME_LINE_HEIGHT, LAYOUT.NAME_LINE_HEIGHT)
      : showStereotype
        ? maxLinesForHeight(
            height - LAYOUT.STEREOTYPE_LINE_HEIGHT - LAYOUT.STEREOTYPE_NAME_GAP - 8,
            LAYOUT.NAME_LINE_HEIGHT
          )
        : maxLinesForHeight(height - 16, LAYOUT.NAME_LINE_HEIGHT)

  const nameLineCount = useMemo(() => {
    if (!name) return 0
    const wrapped = wrapTextInRect(
      name,
      nameMaxWidth,
      { fontSize: LAYOUT.NAME_FONT_SIZE, fontWeight },
      { lineHeight: LAYOUT.NAME_LINE_HEIGHT, maxLines: nameMaxLines }
    )
    return Math.max(1, wrapped.lines.length)
  }, [name, nameMaxWidth, nameMaxLines, fontWeight])

  const { stereotypeCenterY, nameFirstLineCenterY } = (() => {
    if (verticalAnchor === "top") {
      return {
        stereotypeCenterY: topAnchorY - LAYOUT.STEREOTYPE_LINE_HEIGHT / 2,
        nameFirstLineCenterY: showStereotype
          ? topAnchorY + LAYOUT.STEREOTYPE_LINE_HEIGHT - LAYOUT.STEREOTYPE_NAME_GAP
          : topAnchorY,
      }
    }
    const groupHeight = showStereotype
      ? LAYOUT.STEREOTYPE_LINE_HEIGHT +
        LAYOUT.STEREOTYPE_NAME_GAP +
        nameLineCount * LAYOUT.NAME_LINE_HEIGHT
      : nameLineCount * LAYOUT.NAME_LINE_HEIGHT
    const groupTop = height / 2 - groupHeight / 2
    return {
      stereotypeCenterY: groupTop + LAYOUT.STEREOTYPE_LINE_HEIGHT / 2,
      nameFirstLineCenterY: showStereotype
        ? groupTop +
          LAYOUT.STEREOTYPE_LINE_HEIGHT +
          LAYOUT.STEREOTYPE_NAME_GAP +
          LAYOUT.NAME_LINE_HEIGHT / 2
        : groupTop + LAYOUT.NAME_LINE_HEIGHT / 2,
    }
  })()

  return (
    <>
      {showStereotype && stereotype && stereotype.length > 0 && (
        <CustomText
          x={centerX}
          y={stereotypeCenterY}
          textAnchor="middle"
          fontWeight={String(fontWeight)}
          dominantBaseline="central"
          fill={fill}
          fontSize="0.8em"
        >
          {stereotypeLabel(stereotype)}
        </CustomText>
      )}
      <MultilineText
        text={name}
        x={centerX}
        y={nameFirstLineCenterY}
        maxWidth={nameMaxWidth}
        fontSize={LAYOUT.NAME_FONT_SIZE}
        lineHeight={LAYOUT.NAME_LINE_HEIGHT}
        fontWeight={fontWeight}
        fill={fill}
        verticalAnchor="top"
        maxLines={nameMaxLines}
        textDecoration={nameTextDecoration}
      />
    </>
  )
}
