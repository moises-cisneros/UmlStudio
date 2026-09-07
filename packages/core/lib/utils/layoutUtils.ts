import { CANVAS } from "@/constants"
import { DefaultNodeProps } from "@/types"

export const calculateMinWidth = (
  maxTextWidth: number,
  padding: number
): number => {
  const minWidth = maxTextWidth + 2 * padding
  const minWidthWithSnapToGrid =
    Math.ceil(minWidth / CANVAS.EXTRA_SPACE_FOR_EXTENSION) *
    CANVAS.EXTRA_SPACE_FOR_EXTENSION
  return minWidthWithSnapToGrid
}

export const calculateMinHeight = (
  headerHeight: number,
  attributesCount: number,
  methodsCount: number,
  attributeHeight: number,
  methodHeight: number
): number => {
  const minHeight =
    headerHeight +
    attributesCount * attributeHeight +
    methodsCount * methodHeight
  const minHeightWithSnapToGrid =
    Math.ceil(minHeight / CANVAS.EXTRA_SPACE_FOR_EXTENSION) *
    CANVAS.EXTRA_SPACE_FOR_EXTENSION
  return minHeightWithSnapToGrid
}

const STROKE_VAR = "var(--umlstudio-foreground, #000000)"
const FILL_VAR = "var(--umlstudio-background, #ffffff)"

export const getCustomColorsFromData = (data: DefaultNodeProps) => {
  const strokeColor = data.strokeColor || STROKE_VAR
  const fillColor = data.fillColor || FILL_VAR
  const textColor = data.textColor || STROKE_VAR
  return { strokeColor, fillColor, textColor }
}

export const getCustomColorsFromDataForEdge = (data?: {
  strokeColor?: string
  textColor?: string
}) => {
  const strokeColor = data?.strokeColor || STROKE_VAR
  const textColor = data?.textColor || STROKE_VAR
  return { strokeColor, textColor }
}
