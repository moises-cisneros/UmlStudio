import { FC, useMemo, SVGProps } from "react"
import { wrapTextInRect, type SvgFontSpec } from "@/utils/svgTextLayout"
import { FONT_FAMILY } from "@/fontStack"

type VerticalAnchor = "top" | "middle" | "bottom"
type TextAnchor = "start" | "middle" | "end"

type Props = Omit<SVGProps<SVGTextElement>, "x" | "y"> & {
  text: string
  x: number
  y: number
  maxWidth: number
  fontSize: number
  fontWeight?: string | number
  fontFamily?: string
  fontStyle?: string
  lineHeight?: number
  verticalAnchor?: VerticalAnchor
  textAnchor?: TextAnchor
  fill?: string
  maxLines?: number
}

const DEFAULT_FONT_FAMILY = FONT_FAMILY

export const MultilineText: FC<Props> = ({
  text,
  x,
  y,
  maxWidth,
  fontSize,
  fontWeight = 400,
  fontFamily = DEFAULT_FONT_FAMILY,
  fontStyle,
  lineHeight,
  verticalAnchor = "middle",
  textAnchor = "middle",
  fill = "var(--umlstudio-foreground, #000000)",
  maxLines,
  pointerEvents = "none",
  ...rest
}) => {
  const resolvedLineHeight = lineHeight ?? Math.round(fontSize * 1.2)

  const font: SvgFontSpec = useMemo(
    () => ({ fontSize, fontWeight, fontFamily, fontStyle }),
    [fontSize, fontWeight, fontFamily, fontStyle]
  )

  const wrapped = useMemo(
    () =>
      wrapTextInRect(text, maxWidth, font, {
        lineHeight: resolvedLineHeight,
        maxLines,
      }),
    [text, maxWidth, font, resolvedLineHeight, maxLines]
  )

  if (!text || wrapped.lines.length === 0) {
    return null
  }

  const displayLines =
    wrapped.overflow && wrapped.lines.length > 0
      ? wrapped.lines.map((line, i) =>
          i === wrapped.lines.length - 1 ? `${line.trimEnd()}…` : line
        )
      : wrapped.lines

  const n = displayLines.length

  let firstLineCenterY: number
  if (verticalAnchor === "top") {
    firstLineCenterY = y
  } else if (verticalAnchor === "bottom") {
    firstLineCenterY = y - (n - 1) * resolvedLineHeight
  } else {
    firstLineCenterY = y - ((n - 1) * resolvedLineHeight) / 2
  }

  const accessibleName = text.trim() ? text : undefined

  const textEl = (
    <text
      x={x}
      y={y}
      textAnchor={textAnchor}
      dominantBaseline="central"
      fontSize={fontSize}
      fontWeight={fontWeight}
      fontFamily={fontFamily}
      fontStyle={fontStyle}
      fill={fill}
      pointerEvents={pointerEvents}
      {...rest}
    >
            {displayLines.map((line, i) => (
        <tspan
          key={i}
          x={x}
          y={firstLineCenterY + i * resolvedLineHeight}
          dominantBaseline="central"
          aria-hidden="true"
        >
          {line}
        </tspan>
      ))}
    </text>
  )

  if (!accessibleName) {
    return textEl
  }

  return (
    <g role="img" aria-label={accessibleName}>
      {textEl}
    </g>
  )
}
