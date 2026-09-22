import {
  layoutNextLineRange,
  layoutWithLines,
  materializeLineRange,
  measureNaturalWidth,
  prepareWithSegments,
  type LayoutCursor,
  type LayoutLine,
  type PreparedTextWithSegments,
} from "@chenglou/pretext"
import { FONT_FAMILY } from "@/fontStack"

const DEFAULT_FONT_FAMILY = FONT_FAMILY

export type SvgFontSpec = {
  fontSize: number
  fontWeight?: string | number
  fontFamily?: string
  fontStyle?: string
}

export const toCanvasFont = (spec: SvgFontSpec): string => {
  const weight = spec.fontWeight ?? 400
  const style = spec.fontStyle ?? "normal"
  const family = spec.fontFamily ?? DEFAULT_FONT_FAMILY
  return `${style} ${weight} ${spec.fontSize}px ${family}`
}

const prepareCache = new Map<string, PreparedTextWithSegments>()
const PREPARE_CACHE_LIMIT = 256

export type WhiteSpaceMode = "normal" | "pre-wrap"

const getPrepared = (
  text: string,
  font: string,
  whiteSpace: WhiteSpaceMode
): PreparedTextWithSegments => {
  const key = `${whiteSpace}${font}${text}`
  const cached = prepareCache.get(key)
  if (cached) {
    prepareCache.delete(key)
    prepareCache.set(key, cached)
    return cached
  }
  const prepared = prepareWithSegments(text, font, { whiteSpace })
  if (prepareCache.size >= PREPARE_CACHE_LIMIT) {
    const firstKey = prepareCache.keys().next().value
    if (firstKey !== undefined) prepareCache.delete(firstKey)
  }
  prepareCache.set(key, prepared)
  return prepared
}

export const clearPrepareCache = (): void => {
  prepareCache.clear()
}

export const maxLinesForHeight = (availableHeight: number, lineHeight: number): number =>
  Math.max(1, Math.floor(availableHeight / lineHeight))

if (typeof document !== "undefined" && (document as Document & { fonts?: FontFaceSet }).fonts) {
  void (document as Document & { fonts: FontFaceSet }).fonts.ready
    .then(clearPrepareCache)
    .catch(() => {})
}

export type WrappedText = {
  lines: string[]
  maxLineWidth: number
  overflow: boolean
}

export const wrapTextInRect = (
  text: string,
  maxWidth: number,
  font: SvgFontSpec | string,
  options: {
    maxLines?: number
    lineHeight?: number
    whiteSpace?: WhiteSpaceMode
  } = {}
): WrappedText => {
  const trimmed = text ?? ""
  if (!trimmed) {
    return { lines: [], maxLineWidth: 0, overflow: false }
  }
  const fontString = typeof font === "string" ? font : toCanvasFont(font)
  const lineHeight =
    options.lineHeight ?? (typeof font === "string" ? 16 : Math.round(font.fontSize * 1.2))
  const whiteSpace = options.whiteSpace ?? "pre-wrap"
  const sanitizedWidth = Math.max(1, maxWidth)
  try {
    const prepared = getPrepared(trimmed, fontString, whiteSpace)
    const result = layoutWithLines(prepared, sanitizedWidth, lineHeight)
    let lines = result.lines.map((line) => line.text)
    let maxLineWidth = result.lines.reduce((w, l) => Math.max(w, l.width), 0)
    let overflow = false
    if (options.maxLines !== undefined && lines.length > options.maxLines) {
      lines = lines.slice(0, options.maxLines)
      const trimmedLines = result.lines.slice(0, options.maxLines)
      maxLineWidth = trimmedLines.reduce((w, l) => Math.max(w, l.width), 0)
      overflow = true
    }
    return { lines, maxLineWidth, overflow }
  } catch {
    const fallbackLines = whiteSpace === "pre-wrap" ? trimmed.split(/\r?\n/) : [trimmed]
    return {
      lines: fallbackLines,
      maxLineWidth: sanitizedWidth,
      overflow: false,
    }
  }
}

export type ShapeLayout = {
  lines: { text: string; width: number }[]
  lineHeight: number
  lineOffsets: number[]
  blockHeight: number
  overflow: boolean
}

type ShapeOptions = {
  paddingX?: number
  paddingY?: number
  maxLines?: number
  whiteSpace?: WhiteSpaceMode
}

type ShapeWidthFn = (y: number, ry: number, rx: number) => number

const ellipseWidthAtY: ShapeWidthFn = (y, ry, rx) => {
  const bound = Math.min(Math.abs(y), ry)
  const ratio = bound / ry
  const factor = Math.sqrt(Math.max(0, 1 - ratio * ratio))
  return 2 * rx * factor
}

const diamondWidthAtY: ShapeWidthFn = (y, ry, rx) => {
  const bound = Math.min(Math.abs(y), ry)
  const factor = 1 - bound / ry
  return 2 * rx * Math.max(0, factor)
}

const HORIZONTAL_ELLIPSIS = "…"

const layoutTextInShape = (
  text: string,
  width: number,
  height: number,
  font: SvgFontSpec | string,
  lineHeight: number,
  widthAt: ShapeWidthFn,
  options: ShapeOptions
): ShapeLayout => {
  const fontString = typeof font === "string" ? font : toCanvasFont(font)
  const paddingX = options.paddingX ?? 0
  const paddingY = options.paddingY ?? 0
  const maxLinesCap = options.maxLines ?? 32
  const whiteSpace = options.whiteSpace ?? "pre-wrap"

  const emptyLayout: ShapeLayout = {
    lines: [],
    lineHeight,
    lineOffsets: [],
    blockHeight: 0,
    overflow: false,
  }
  const fallbackLayout = (t: string): ShapeLayout => {
    const rawLines = whiteSpace === "pre-wrap" ? t.split(/\r?\n/) : [t]
    const innerWidth = Math.max(0, width - 2 * paddingX)
    const n = rawLines.length
    const top = -(n * lineHeight) / 2
    return {
      lines: rawLines.map((line) => ({ text: line, width: innerWidth })),
      lineHeight,
      lineOffsets: rawLines.map((_, i) => top + (i + 0.5) * lineHeight),
      blockHeight: n * lineHeight,
      overflow: false,
    }
  }

  const trimmed = text ?? ""
  if (!trimmed) return emptyLayout

  const rx = Math.max(0, width / 2 - paddingX)
  const ry = Math.max(0, height / 2 - paddingY)
  if (rx <= 0 || ry <= 0) return emptyLayout

  let prepared
  try {
    prepared = getPrepared(trimmed, fontString, whiteSpace)
  } catch {
    return fallbackLayout(trimmed)
  }

  const verticalCap = Math.max(1, Math.floor((2 * ry) / lineHeight))
  const maxLines = Math.min(verticalCap, maxLinesCap)

  const isCursorAtEnd = (cursor: LayoutCursor): boolean => {
    const next = layoutNextLineRange(prepared, cursor, rx * 2)
    return next === null
  }

  const centerOffsets = (n: number): number[] => {
    const top = -(n * lineHeight) / 2
    return Array.from({ length: n }, (_, i) => top + (i + 0.5) * lineHeight)
  }

  let bestLines: LayoutLine[] | null = null

  for (let n = 1; n <= maxLines; n++) {
    const blockHeight = n * lineHeight
    const topY = -blockHeight / 2

    const widths: number[] = new Array(n)
    for (let i = 0; i < n; i++) {
      const lineTop = topY + i * lineHeight
      const lineBottom = lineTop + lineHeight
      const edge = Math.max(Math.abs(lineTop), Math.abs(lineBottom))
      widths[i] = widthAt(edge, ry, rx)
    }

    if (widths.some((w) => w <= 0)) break

    let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
    const lines: LayoutLine[] = []
    for (let i = 0; i < n; i++) {
      const range = layoutNextLineRange(prepared, cursor, widths[i])
      if (range === null) break
      lines.push(materializeLineRange(prepared, range))
      cursor = range.end
    }

    const fits = lines.length < n || isCursorAtEnd(cursor)
    if (fits) {
      return {
        lines: lines.map((l) => ({ text: l.text, width: l.width })),
        lineHeight,
        lineOffsets: centerOffsets(lines.length),
        blockHeight: lines.length * lineHeight,
        overflow: false,
      }
    }

    bestLines = lines
  }

  if (bestLines && bestLines.length > 0) {
    const rendered = bestLines.map((l) => ({ text: l.text, width: l.width }))
    const last = rendered[rendered.length - 1]
    last.text = `${last.text.trimEnd()}${HORIZONTAL_ELLIPSIS}`
    return {
      lines: rendered,
      lineHeight,
      lineOffsets: centerOffsets(bestLines.length),
      blockHeight: bestLines.length * lineHeight,
      overflow: true,
    }
  }

  const fallbackWidth = Math.min(measureNaturalWidth(prepared), rx * 2)
  const fallback = layoutNextLineRange(
    prepared,
    { segmentIndex: 0, graphemeIndex: 0 },
    fallbackWidth
  )
  if (!fallback) return emptyLayout
  const materialized = materializeLineRange(prepared, fallback)
  return {
    lines: [{ text: materialized.text, width: materialized.width }],
    lineHeight,
    lineOffsets: [0],
    blockHeight: lineHeight,
    overflow: !isCursorAtEnd(fallback.end),
  }
}

export const layoutTextInEllipse = (
  text: string,
  width: number,
  height: number,
  font: SvgFontSpec | string,
  lineHeight: number,
  options: ShapeOptions = {}
): ShapeLayout => layoutTextInShape(text, width, height, font, lineHeight, ellipseWidthAtY, options)

export const layoutTextInDiamond = (
  text: string,
  width: number,
  height: number,
  font: SvgFontSpec | string,
  lineHeight: number,
  options: ShapeOptions = {}
): ShapeLayout => layoutTextInShape(text, width, height, font, lineHeight, diamondWidthAtY, options)
