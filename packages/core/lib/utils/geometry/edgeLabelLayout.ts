import { IPoint } from "@/edges/Connection"
import { EDGES } from "@/utils/geometry/routingConstants"
import { clamp, lexLess } from "@/utils/geometry/scalar"
import { collapseCollinearPoints, getSegmentOrientation } from "./bendHandles"
import { getAxisAlignedSegments } from "@/utils/edgeUtils"

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface MidSegment {
  point: IPoint
  isHorizontal: boolean
  segmentIndex: number
  start: IPoint
  end: IPoint
}

export type LabelSide = "above" | "below" | "left" | "right"

export interface PlacedLabel {
  x: number
  y: number
  textAnchor: "start" | "middle" | "end"
  dominantBaseline: "auto" | "middle" | "hanging"
  side: LabelSide
}

const round = (value: number): number => Math.round(value)

export function getMidSegment(
  renderPoints: IPoint[],
  fallbackSource: IPoint,
  fallbackTarget: IPoint
): MidSegment {
  const points = collapseCollinearPoints(renderPoints)

  if (points.length < 2) {
    const dx = fallbackTarget.x - fallbackSource.x
    const dy = fallbackTarget.y - fallbackSource.y
    return {
      point: {
        x: round((fallbackSource.x + fallbackTarget.x) / 2),
        y: round((fallbackSource.y + fallbackTarget.y) / 2),
      },
      isHorizontal: Math.abs(dx) >= Math.abs(dy),
      segmentIndex: 0,
      start: fallbackSource,
      end: fallbackTarget,
    }
  }

  const lengths: number[] = []
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    const length =
      Math.abs(points[i + 1].x - points[i].x) +
      Math.abs(points[i + 1].y - points[i].y)
    lengths.push(length)
    total += length
  }

  if (total === 0) {
    return {
      point: { x: round(points[0].x), y: round(points[0].y) },
      isHorizontal: getSegmentOrientation(points, 0) === "H",
      segmentIndex: 0,
      start: points[0],
      end: points[points.length - 1],
    }
  }

  const half = total / 2
  let running = 0
  let index = lengths.length - 1
  for (let i = 0; i < lengths.length; i++) {
    if (running + lengths[i] >= half) {
      index = i
      break
    }
    running += lengths[i]
  }

  const t = (half - running) / lengths[index]
  const start = points[index]
  const end = points[index + 1]

  return {
    point: {
      x: round(start.x + (end.x - start.x) * t),
      y: round(start.y + (end.y - start.y) * t),
    },
    isHorizontal: getSegmentOrientation(points, index) === "H",
    segmentIndex: index,
    start,
    end,
  }
}

export function getStraightMidSegment(
  renderPoints: IPoint[],
  fallbackSource: IPoint,
  fallbackTarget: IPoint
): MidSegment {
  const usable = renderPoints
    .slice(1)
    .map((end, index) => {
      const start = renderPoints[index]
      return {
        start,
        end,
        segmentIndex: index,
        length: Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2),
      }
    })
    .filter((segment) => segment.length > 0)
  if (usable.length === 0)
    return getMidSegment(
      [fallbackSource, fallbackTarget],
      fallbackSource,
      fallbackTarget
    )

  const total = usable.reduce((sum, segment) => sum + segment.length, 0)
  const half = total / 2
  let running = 0
  let selected = usable[usable.length - 1]
  for (const segment of usable) {
    if (running + segment.length >= half) {
      selected = segment
      break
    }
    running += segment.length
  }
  const t = (half - running) / selected.length
  const dx = selected.end.x - selected.start.x
  const dy = selected.end.y - selected.start.y
  return {
    point: {
      x: round(selected.start.x + dx * t),
      y: round(selected.start.y + dy * t),
    },
    isHorizontal: Math.abs(dx) >= Math.abs(dy),
    segmentIndex: selected.segmentIndex,
    start: selected.start,
    end: selected.end,
  }
}

const rectsIntersect = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y

export function estimateLabelWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.6
}

export function candidateBox(
  point: IPoint,
  side: LabelSide,
  w: number,
  h: number
): Rect {
  const gap = EDGES.LABEL_GAP
  switch (side) {
    case "above":
      return { x: point.x - w / 2, y: point.y - gap - h, width: w, height: h }
    case "below":
      return { x: point.x - w / 2, y: point.y + gap, width: w, height: h }
    case "left":
      return { x: point.x - gap - w, y: point.y - h / 2, width: w, height: h }
    case "right":
      return { x: point.x + gap, y: point.y - h / 2, width: w, height: h }
  }
}

const segmentCrossesBox = (
  seg: {
    orientation: "horizontal" | "vertical"
    fixed: number
    min: number
    max: number
  },
  box: Rect
): boolean => {
  const onAcross =
    seg.orientation === "horizontal"
      ? seg.fixed >= box.y && seg.fixed <= box.y + box.height
      : seg.fixed >= box.x && seg.fixed <= box.x + box.width
  const lo = seg.orientation === "horizontal" ? box.x : box.y
  const hi =
    seg.orientation === "horizontal" ? box.x + box.width : box.y + box.height
  return onAcross && seg.max >= lo && seg.min <= hi
}

const placeOnSide = (
  mid: Pick<MidSegment, "point">,
  side: LabelSide
): PlacedLabel => {
  const gap = EDGES.LABEL_GAP
  const { x, y } = mid.point
  switch (side) {
    case "above":
      return {
        x,
        y: y - gap,
        textAnchor: "middle",
        dominantBaseline: "auto",
        side,
      }
    case "below":
      return {
        x,
        y: y + gap,
        textAnchor: "middle",
        dominantBaseline: "hanging",
        side,
      }
    case "left":
      return {
        x: x - gap,
        y,
        textAnchor: "end",
        dominantBaseline: "middle",
        side,
      }
    case "right":
      return {
        x: x + gap,
        y,
        textAnchor: "start",
        dominantBaseline: "middle",
        side,
      }
  }
}

const countNodeHits = (box: Rect, nodeRects: Rect[]): number =>
  nodeRects.reduce(
    (hits, rect) => (rectsIntersect(box, rect) ? hits + 1 : hits),
    0
  )

const countNeighborHits = (box: Rect, polylines: IPoint[][]): number => {
  let hits = 0
  for (const polyline of polylines) {
    if (
      getAxisAlignedSegments(polyline).some((seg) =>
        segmentCrossesBox(seg, box)
      )
    )
      hits++
  }
  return hits
}

const countOwnSegmentHits = (
  box: Rect,
  segments: ReturnType<typeof getAxisAlignedSegments>,
  hostIndex: number
): number =>
  segments.reduce(
    (hits, seg) =>
      seg.index !== hostIndex && segmentCrossesBox(seg, box) ? hits + 1 : hits,
    0
  )

const bounds = (polyline: IPoint[]): Rect => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of polyline) {
    if (point.x < minX) minX = point.x
    if (point.x > maxX) maxX = point.x
    if (point.y < minY) minY = point.y
    if (point.y > maxY) maxY = point.y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function collectNeighborPolylines(
  geometryById: Record<string, IPoint[]>,
  selfId: string,
  center: IPoint,
  radius: number
): IPoint[][] {
  const query: Rect = {
    x: center.x - radius,
    y: center.y - radius,
    width: radius * 2,
    height: radius * 2,
  }
  const result: IPoint[][] = []
  for (const [id, polyline] of Object.entries(geometryById)) {
    if (id === selfId || polyline.length < 2) continue
    if (rectsIntersect(query, bounds(polyline))) result.push(polyline)
  }
  return result
}

export interface MiddleLabelInput {
  renderPoints: IPoint[]
  labelText: string
  fontSize: number
  measuredWidth?: number
  nodeRects?: Rect[]
  neighborGeometry?: IPoint[][]
}

const LABEL_CLEARANCE = 5
const MAX_ARM_SAMPLES = 20

const distance = (a: IPoint, b: IPoint): number =>
  Math.hypot(a.x - b.x, a.y - b.y)

const inflate = (r: Rect, m: number): Rect => ({
  x: r.x - m,
  y: r.y - m,
  width: r.width + 2 * m,
  height: r.height + 2 * m,
})

export function computeMiddleLabelLayout(input: MiddleLabelInput): PlacedLabel {
  const { renderPoints, labelText, fontSize, neighborGeometry } = input
  const nodeRects = input.nodeRects ?? []
  const neighbors = neighborGeometry ?? []
  const points = collapseCollinearPoints(renderPoints)
  const arc = getMidSegment(
    points,
    points[0] ?? { x: 0, y: 0 },
    points[points.length - 1] ?? { x: 0, y: 0 }
  ).point

  const w = input.measuredWidth ?? estimateLabelWidth(labelText, fontSize)
  const h = EDGES.LABEL_LINE_HEIGHT
  const segments = getAxisAlignedSegments(points)
  if (segments.length === 0) {
    return placeOnSide({ point: arc }, "above")
  }

  let best: { point: IPoint; side: LabelSide } | null = null
  let bestCost: number[] | null = null

  for (const seg of segments) {
    const isHorizontal = seg.orientation === "horizontal"
    const along = isHorizontal ? w : h
    const lo = seg.min + along / 2
    const hi = seg.max - along / 2
    const target = isHorizontal ? arc.x : arc.y

    const coords = new Set<number>()
    if (lo <= hi) {
      coords.add(clamp(target, lo, hi))
      coords.add(lo)
      coords.add(hi)
      const span = hi - lo
      const step = Math.max(
        EDGES.LABEL_LINE_HEIGHT,
        along / 2,
        span / MAX_ARM_SAMPLES
      )
      for (let c = lo; c <= hi; c += step) coords.add(c)
    } else {
      coords.add((seg.min + seg.max) / 2)
    }
    const fits = lo <= hi

    const sides: LabelSide[] = isHorizontal
      ? ["above", "below"]
      : ["right", "left"]
    for (const coord of coords) {
      const anchor: IPoint = isHorizontal
        ? { x: coord, y: seg.fixed }
        : { x: seg.fixed, y: coord }
      for (const side of sides) {
        const box = inflate(candidateBox(anchor, side, w, h), LABEL_CLEARANCE)
        const cost: [number, number, number, number, number] = [
          countNodeHits(box, nodeRects),
          countOwnSegmentHits(box, segments, seg.index) +
            countNeighborHits(box, neighbors),
          fits ? 0 : 1,
          Math.round(distance(anchor, arc)),
          side === sides[0] ? 0 : 1,
        ]
        if (bestCost === null || lexLess(cost, bestCost)) {
          bestCost = cost
          best = { point: anchor, side }
        }
      }
    }
  }

  return placeOnSide({ point: best!.point }, best!.side)
}

