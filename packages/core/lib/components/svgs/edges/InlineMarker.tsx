import {
  MARKERS,
  MARKER_CONFIGS,
  STROKE_COLOR,
} from "@/constants"
import {
  getPathEndInfo as getPathEndInfoFromParser,
  getPathStartInfo as getPathStartInfoFromParser,
  extractMarkerId as extractMarkerIdFromParser,
} from "@/utils/pathParsing"

export interface MarkerProps {
  endPoint: { x: number; y: number }
  direction: number
  markerId: string
  strokeColor?: string
  interfaceGeometry?: InterfaceGeometry
}

export interface InterfaceGeometry {
  radius: number
}

const isMarkerId = (id: string): id is keyof typeof MARKER_CONFIGS =>
  id in MARKER_CONFIGS

const THEME_BACKGROUND_COLOR = "var(--umlstudio-background, #ffffff)"

export function getMarkerHalfHeight(markerId: keyof typeof MARKER_CONFIGS) {
  const config = MARKER_CONFIGS[markerId]
  return (config.size * config.heightFactor) / 2
}

export const extractMarkerId = extractMarkerIdFromParser

export function getPathEndInfo(pathD: string): {
  endPoint: { x: number; y: number }
  direction: number
} | null {
  const result = getPathEndInfoFromParser(pathD)
  if (!result) return null
  return {
    endPoint: result.endPoint,
    direction: result.direction,
  }
}

export function getPathStartInfo(pathD: string): {
  startPoint: { x: number; y: number }
  direction: number
} | null {
  const result = getPathStartInfoFromParser(pathD)
  if (!result) return null
  return {
    startPoint: result.startPoint,
    direction: result.direction,
  }
}

export function InlineMarker({
  endPoint,
  direction,
  markerId,
  strokeColor = STROKE_COLOR,
}: MarkerProps) {
  if (!isMarkerId(markerId)) return null
  const config = MARKER_CONFIGS[markerId]

  const { type, filled, size } = config
  const cos = Math.cos(direction)
  const sin = Math.sin(direction)

  const transform = (x: number, y: number) => ({
    x: Math.round(endPoint.x + x * cos - y * sin),
    y: Math.round(endPoint.y + x * sin + y * cos),
  })

  switch (type) {
    case "triangle": {
      const strokeW = MARKERS.STROKE_WIDTH.triangle
      const length = size * (config.widthFactor ?? 1)
      const height = size * (config.heightFactor ?? 1)
      const tipOffset = 0
      const tip = transform(tipOffset, 0)
      const left = transform(tipOffset - length, -height / 2)
      const right = transform(tipOffset - length, height / 2)
      return (
        <path
          d={`M${tip.x},${tip.y} L${left.x},${left.y} L${right.x},${right.y} Z`}
          fill={filled ? strokeColor : THEME_BACKGROUND_COLOR}
          stroke={strokeColor}
          strokeWidth={strokeW}
          data-inline-marker-filled={filled ? "true" : undefined}
          data-inline-marker="true"
        />
      )
    }

    case "arrow": {
      const strokeW = MARKERS.STROKE_WIDTH.arrow
      const length = size * (config.widthFactor ?? 1)
      const height = size * (config.heightFactor ?? 0.7)

      if (filled) {
        const tipOffset = 0
        const tip = transform(tipOffset, 0)
        const left = transform(tipOffset - length, -height / 2)
        const right = transform(tipOffset - length, height / 2)
        return (
          <path
            d={`M${left.x},${left.y} L${tip.x},${tip.y} L${right.x},${right.y} Z`}
            fill={strokeColor}
            stroke={strokeColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeLinejoin="round"
            data-inline-marker-filled="true"
            data-inline-marker="true"
          />
        )
      }
      const tipOffset = 0
      const tip = transform(tipOffset, 0)
      const left = transform(tipOffset - length, -height / 2)
      const right = transform(tipOffset - length, height / 2)
      return (
        <path
          d={`M${left.x},${left.y} L${tip.x},${tip.y} L${right.x},${right.y}`}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeLinejoin="round"
          data-inline-marker="true"
        />
      )
    }

    case "rhombus": {
      const strokeW = MARKERS.STROKE_WIDTH.rhombus
      const w = size * (config.widthFactor ?? 1)
      const h = size * (config.heightFactor ?? 1)
      const tipOffset = 0
      const front = transform(tipOffset, 0)
      const right = transform(tipOffset - w / 2, h / 2)
      const back = transform(tipOffset - w, 0)
      const left = transform(tipOffset - w / 2, -h / 2)
      return (
        <path
          d={`M${front.x},${front.y} L${right.x},${right.y} L${back.x},${back.y} L${left.x},${left.y} Z`}
          fill={filled ? strokeColor : THEME_BACKGROUND_COLOR}
          stroke={strokeColor}
          strokeWidth={strokeW}
          data-inline-marker-filled={filled ? "true" : undefined}
          data-inline-marker="true"
        />
      )
    }

    default:
      return null
  }
}

export function EdgeInlineMarkers({
  pathD,
  markerEnd,
  markerStart,
  strokeColor = STROKE_COLOR,
  targetInterfaceGeometry,
}: {
  pathD: string
  markerEnd?: string
  markerStart?: string
  strokeColor?: string
  targetInterfaceGeometry?: InterfaceGeometry
}) {
  const endMarkerId = extractMarkerId(markerEnd)
  const startMarkerId = extractMarkerId(markerStart)

  return (
    <g pointerEvents="none">
      {endMarkerId &&
        (() => {
          const endInfo = getPathEndInfo(pathD)
          if (!endInfo) return null
          return (
            <InlineMarker
              endPoint={endInfo.endPoint}
              direction={endInfo.direction}
              markerId={endMarkerId}
              strokeColor={strokeColor}
              interfaceGeometry={targetInterfaceGeometry}
            />
          )
        })()}

      {startMarkerId &&
        (() => {
          const startInfo = getPathStartInfo(pathD)
          if (!startInfo) return null
          return (
            <InlineMarker
              endPoint={startInfo.startPoint}
              direction={startInfo.direction}
              markerId={startMarkerId}
              strokeColor={strokeColor}
            />
          )
        })()}
    </g>
  )
}
