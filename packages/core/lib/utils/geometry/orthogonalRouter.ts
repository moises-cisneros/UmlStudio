import { Position, type Rect } from "@xyflow/system"
import { CANVAS, EDGES } from "@/utils/geometry/routingConstants"
import type { IPoint } from "@/edges/Connection"
import { recordRouterSearch } from "@/sync/perfCounters"
import type { ObstacleRect } from "@/utils/geometry/obstacles"
import { ROUTING_COST, segmentCrowdingPx, validateEndpointCost } from "@/utils/geometry/routingCost"

const MAX_EXPANSIONS = 60_000

const MAX_CELLS = 40_000

const enum Heading {
  Up = 0,
  Right = 1,
  Down = 2,
  Left = 3,
}

const headingOf = (position: Position): Heading => {
  switch (position) {
    case Position.Top:
      return Heading.Up
    case Position.Right:
      return Heading.Right
    case Position.Bottom:
      return Heading.Down
    case Position.Left:
    default:
      return Heading.Left
  }
}

const opposite = (h: Heading): Heading => ((h + 2) % 4) as Heading

const NEXT_HEADINGS = new Uint8Array([
  Heading.Up,
  Heading.Right,
  Heading.Left,
  Heading.Up,
  Heading.Right,
  Heading.Down,
  Heading.Right,
  Heading.Down,
  Heading.Left,
  Heading.Up,
  Heading.Down,
  Heading.Left,
])

const MIN_BENDS_BY_HEADINGS_AND_DIRECTIONS = (() => {
  const table = new Uint8Array(4 * 4 * 16).fill(255)

  const visit = (
    start: Heading,
    current: Heading,
    visitedDirections: number,
    bends: number
  ): void => {
    const offset = (start * 4 + current) * 16
    for (let required = 0; required < 16; required++) {
      if ((visitedDirections & required) === required && bends < table[offset + required])
        table[offset + required] = bends
    }
    if (bends === 4) return

    for (let next = Heading.Up; next <= Heading.Left; next++) {
      if (next === current) continue
      visit(start, next, visitedDirections | (1 << next), bends + 1)
    }
  }

  for (let start = Heading.Up; start <= Heading.Left; start++) visit(start, start, 1 << start, 0)
  return table
})()

const BEND_PENALTY_IN_CELLS = ROUTING_COST.bendInGridCells
const EDGE_CROSSING_PENALTY = ROUTING_COST.edgeCrossing
const CROSSING_NEAR_CORNER_PENALTY = ROUTING_COST.crossingNearCorner
const CROSSING_CORNER_CLEARANCE = ROUTING_COST.crossingCornerClearance
const CROSSING_CORNER_CLEARANCE_SQUARED = CROSSING_CORNER_CLEARANCE * CROSSING_CORNER_CLEARANCE

const PARALLEL_CROWDING_CLEARANCE_CELLS = ROUTING_COST.parallelCrowdingClearanceInGridCells
const CROWDING_COST_PER_PX = ROUTING_COST.crowdingPerPx
const OVERLAP_COST_PER_PX = ROUTING_COST.overlapPerPx
const SOFT_CROSSING_COST_PER_PX = ROUTING_COST.softCrossingPerPx

const CLEARANCE_COST_PER_PX_AT_FULL_DEFICIT = ROUTING_COST.clearancePerPxAtFullDeficit
const HUGGING_COST_PER_PX = ROUTING_COST.huggingPerPx
const CHANNEL_IMBALANCE_TIE_BREAK_PER_PX = ROUTING_COST.channelImbalanceTieBreakPerPx

const clearanceAlongside = (
  a: IPoint,
  b: IPoint,
  rects: readonly ObstacleRect[],
  ideal: number
): { nearest: number; achievable: number } => {
  const horizontal = a.y === b.y
  const lo = horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y)
  const hi = horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y)

  const minOverlap = 2 * CANVAS.SNAP_TO_GRID_PX

  let lower = Infinity
  let upper = Infinity
  for (const r of rects) {
    const spanLo = horizontal ? r.x : r.y
    const spanHi = horizontal ? r.x + r.width : r.y + r.height
    if (Math.min(hi, spanHi) - Math.max(lo, spanLo) < minOverlap) continue

    const at = horizontal ? a.y : a.x
    const near = horizontal ? r.y : r.x
    const far = horizontal ? r.y + r.height : r.x + r.width
    if (at <= near) upper = Math.min(upper, near - at)
    else if (at >= far) lower = Math.min(lower, at - far)
  }

  const half = (lower + upper) / 2
  return {
    nearest: Math.min(lower, upper),
    achievable: Math.min(half, ideal),
  }
}

const along = (a: IPoint, b: IPoint, distance: number): IPoint =>
  a.x === b.x
    ? { x: a.x, y: a.y + Math.sign(b.y - a.y) * distance }
    : { x: a.x + Math.sign(b.x - a.x) * distance, y: a.y }

export const routeRunsTooCloseToBody = (
  points: readonly IPoint[],
  bodies: readonly ObstacleRect[],
  ideal: number,
  minimum: number,
  tolerance: number,
  exemptEndsPx = 0
): boolean => {
  if (bodies.length === 0) return false

  const lengths: number[] = []
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    const length = Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].y - points[i].y)
    lengths.push(length)
    total += length
  }

  let travelled = 0
  for (let i = 0; i < points.length - 1; i++) {
    const start = travelled
    travelled += lengths[i]
    const from = Math.max(0, exemptEndsPx - start)
    const to = Math.min(lengths[i], total - exemptEndsPx - start)
    if (to - from <= 0) continue

    const a = along(points[i], points[i + 1], from)
    const b = along(points[i], points[i + 1], to)
    const { nearest, achievable } = clearanceAlongside(a, b, bodies, ideal)

    if (nearest === Infinity) continue
    if (nearest === 0) return true
    if (nearest < achievable - tolerance) return true
    if (nearest < minimum && achievable >= minimum) return true
  }
  return false
}

export const straightPathClearsBodies = (
  points: readonly IPoint[],
  hardBodies: readonly ObstacleRect[]
): boolean =>
  !routeRunsTooCloseToBody(
    points,
    hardBodies,
    EDGES.NODE_CLEARANCE_PX,
    EDGES.MIN_NODE_CLEARANCE_PX,
    CANVAS.SNAP_TO_GRID_PX,
    EDGES.STUB_LENGTH
  )

type Segment = {
  x1: number
  y1: number
  x2: number
  y2: number
  startTerminal?: boolean
  endTerminal?: boolean
}

const toSegments = (polylines: readonly IPoint[][]): Segment[] => {
  const segs: Segment[] = []
  for (const line of polylines) {
    for (let i = 0; i < line.length - 1; i++) {
      segs.push({
        x1: line[i].x,
        y1: line[i].y,
        x2: line[i + 1].x,
        y2: line[i + 1].y,
        startTerminal: i === 0,
        endTerminal: i === line.length - 2,
      })
    }
  }
  return segs
}

type NeighborSegment = Segment

export const neighborsWithinReach = (
  sourcePoint: IPoint,
  targetPoints: readonly IPoint[],
  obstacles: readonly ObstacleRect[],
  neighborEdges: readonly IPoint[][]
): NeighborSegment[] => {
  const reach = 4 * CANVAS.SNAP_TO_GRID_PX + EDGES.NODE_CLEARANCE_PX
  const xs = [sourcePoint.x, ...targetPoints.map((p) => p.x)]
  const ys = [sourcePoint.y, ...targetPoints.map((p) => p.y)]
  const left = Math.min(...xs, ...obstacles.map((o) => o.x)) - reach
  const right = Math.max(...xs, ...obstacles.map((o) => o.x + o.width)) + reach
  const top = Math.min(...ys, ...obstacles.map((o) => o.y)) - reach
  const bottom = Math.max(...ys, ...obstacles.map((o) => o.y + o.height)) + reach
  const inside = (x: number, y: number): boolean =>
    x >= left && x <= right && y >= top && y <= bottom
  const clamp = (value: number, low: number, high: number): number =>
    Math.max(low, Math.min(high, value))
  return toSegments(neighborEdges).flatMap((segment) => {
    if (
      !(
        Math.min(segment.x1, segment.x2) <= right &&
        Math.max(segment.x1, segment.x2) >= left &&
        Math.min(segment.y1, segment.y2) <= bottom &&
        Math.max(segment.y1, segment.y2) >= top
      )
    )
      return []

    const startTerminal = segment.startTerminal && inside(segment.x1, segment.y1)
    const endTerminal = segment.endTerminal && inside(segment.x2, segment.y2)
    if (segment.y1 === segment.y2)
      return [
        {
          ...segment,
          x1: clamp(segment.x1, left, right),
          x2: clamp(segment.x2, left, right),
          startTerminal,
          endTerminal,
        },
      ]
    if (segment.x1 === segment.x2)
      return [
        {
          ...segment,
          y1: clamp(segment.y1, top, bottom),
          y2: clamp(segment.y2, top, bottom),
          startTerminal,
          endTerminal,
        },
      ]
    return [{ ...segment, startTerminal, endTerminal }]
  })
}

const sign = (n: number): number => (n > 0 ? 1 : n < 0 ? -1 : 0)

const orient = (px: number, py: number, qx: number, qy: number, rx: number, ry: number): number =>
  sign((qx - px) * (ry - py) - (qy - py) * (rx - px))

const segmentsCross = (a: Segment, b: Segment): boolean => {
  const straddles =
    orient(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1) * orient(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2) < 0
  if (!straddles) return false

  const from = orient(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1)
  const to = orient(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2)
  return (from < 0 && to >= 0) || (from > 0 && to <= 0)
}

const parallelGap = (a: Segment, b: Segment): number | null => {
  const aH = a.y1 === a.y2
  const bH = b.y1 === b.y2
  const aV = a.x1 === a.x2
  const bV = b.x1 === b.x2
  if (aH && bH) {
    const overlap =
      Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2)) -
      Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2))
    return overlap > 0 ? Math.abs(a.y1 - b.y1) : null
  }
  if (aV && bV) {
    const overlap =
      Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2)) -
      Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2))
    return overlap > 0 ? Math.abs(a.x1 - b.x1) : null
  }
  return null
}

const crossingPoint = (a: Segment, b: Segment): IPoint => {
  const determinantA = a.x1 * a.y2 - a.y1 * a.x2
  const determinantB = b.x1 * b.y2 - b.y1 * b.x2
  const denominator = (a.x1 - a.x2) * (b.y1 - b.y2) - (a.y1 - a.y2) * (b.x1 - b.x2)
  return {
    x: (determinantA * (b.x1 - b.x2) - (a.x1 - a.x2) * determinantB) / denominator,
    y: (determinantA * (b.y1 - b.y2) - (a.y1 - a.y2) * determinantB) / denominator,
  }
}

const distanceSquaredToEnds = (p: IPoint, s: Segment): number =>
  Math.min((p.x - s.x1) ** 2 + (p.y - s.y1) ** 2, (p.x - s.x2) ** 2 + (p.y - s.y2) ** 2)

const cornerCrowded = (x: number, y: number, n: NeighborIndex, clearance: number): boolean => {
  for (let i = 0; i < n.hy.length; i++) {
    const dx = Math.max(n.hxLo[i] - x, x - n.hxHi[i], 0)
    const dy = Math.abs(y - n.hy[i])
    if (dx + dy < clearance) return true
  }
  for (let i = 0; i < n.vx.length; i++) {
    const dy = Math.max(n.vyLo[i] - y, y - n.vyHi[i], 0)
    const dx = Math.abs(x - n.vx[i])
    if (dx + dy < clearance) return true
  }
  const clearanceSquared = clearance * clearance
  for (let i = 0; i < n.dx1.length; i++) {
    const ax = n.dx1[i]
    const ay = n.dy1[i]
    const vx = n.dx2[i] - ax
    const vy = n.dy2[i] - ay
    const lengthSquared = vx * vx + vy * vy
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / lengthSquared))
    const dx = x - (ax + t * vx)
    const dy = y - (ay + t * vy)
    if (dx * dx + dy * dy < clearanceSquared) return true
  }
  return false
}

type NeighborIndex = {
  hy: Float64Array
  hxLo: Float64Array
  hxHi: Float64Array
  vx: Float64Array
  vyLo: Float64Array
  vyHi: Float64Array
  dx1: Float64Array
  dy1: Float64Array
  dx2: Float64Array
  dy2: Float64Array
}

const indexNeighbors = (segments: readonly Segment[]): NeighborIndex => {
  const horizontal = segments.filter((s) => s.y1 === s.y2 && s.x1 !== s.x2)
  const vertical = segments.filter((s) => s.x1 === s.x2 && s.y1 !== s.y2)
  const diagonal = segments.filter((s) => s.x1 !== s.x2 && s.y1 !== s.y2)

  const index: NeighborIndex = {
    hy: new Float64Array(horizontal.length),
    hxLo: new Float64Array(horizontal.length),
    hxHi: new Float64Array(horizontal.length),
    vx: new Float64Array(vertical.length),
    vyLo: new Float64Array(vertical.length),
    vyHi: new Float64Array(vertical.length),
    dx1: new Float64Array(diagonal.length),
    dy1: new Float64Array(diagonal.length),
    dx2: new Float64Array(diagonal.length),
    dy2: new Float64Array(diagonal.length),
  }
  horizontal.forEach((s, i) => {
    index.hy[i] = s.y1
    index.hxLo[i] = Math.min(s.x1, s.x2)
    index.hxHi[i] = Math.max(s.x1, s.x2)
  })
  vertical.forEach((s, i) => {
    index.vx[i] = s.x1
    index.vyLo[i] = Math.min(s.y1, s.y2)
    index.vyHi[i] = Math.max(s.y1, s.y2)
  })
  diagonal.forEach((s, i) => {
    index.dx1[i] = s.x1
    index.dy1[i] = s.y1
    index.dx2[i] = s.x2
    index.dy2[i] = s.y2
  })
  return index
}

const edgePenaltyAt = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  n: NeighborIndex,
  crowdingClearance: number
): number => {
  const horizontal = ay === by
  let penalty = 0

  const fixed = horizontal ? ay : ax
  const lo = horizontal ? Math.min(ax, bx) : Math.min(ay, by)
  const hi = horizontal ? Math.max(ax, bx) : Math.max(ay, by)
  const pAt = horizontal ? n.hy : n.vx
  const pLo = horizontal ? n.hxLo : n.vyLo
  const pHi = horizontal ? n.hxHi : n.vyHi

  for (let i = 0; i < pAt.length; i++) {
    const shared = Math.min(hi, pHi[i]) - Math.max(lo, pLo[i])
    if (shared <= 0) continue
    const gap = Math.abs(fixed - pAt[i])
    if (gap === 0) penalty += OVERLAP_COST_PER_PX * shared
    else if (gap < crowdingClearance) penalty += CROWDING_COST_PER_PX * shared
  }

  const from = horizontal ? ax : ay
  const to = horizontal ? bx : by
  const cAt = horizontal ? n.vx : n.hy
  const cLo = horizontal ? n.vyLo : n.hxLo
  const cHi = horizontal ? n.vyHi : n.hxHi

  for (let i = 0; i < cAt.length; i++) {
    if (!(cLo[i] < fixed && fixed < cHi[i])) continue
    const line = cAt[i]
    const arrives = to > from ? from < line && line <= to : to <= line && line < from
    if (!arrives) continue

    penalty += EDGE_CROSSING_PENALTY

    const alongNeighbor = Math.min(Math.abs(fixed - cLo[i]), Math.abs(fixed - cHi[i]))
    if (alongNeighbor < CROSSING_CORNER_CLEARANCE) {
      penalty += CROSSING_NEAR_CORNER_PENALTY
    }
  }

  for (let i = 0; i < n.dx1.length; i++) {
    const dx1 = n.dx1[i]
    const dy1 = n.dy1[i]
    const dx2 = n.dx2[i]
    const dy2 = n.dy2[i]
    const straddles = orient(ax, ay, bx, by, dx1, dy1) * orient(ax, ay, bx, by, dx2, dy2) < 0
    if (!straddles) {
      penalty +=
        CROWDING_COST_PER_PX *
        segmentCrowdingPx(
          { x: ax, y: ay },
          { x: bx, y: by },
          { x: dx1, y: dy1 },
          { x: dx2, y: dy2 },
          crowdingClearance
        )
      continue
    }
    const fromSide = orient(dx1, dy1, dx2, dy2, ax, ay)
    const toSide = orient(dx1, dy1, dx2, dy2, bx, by)
    if (!((fromSide < 0 && toSide >= 0) || (fromSide > 0 && toSide <= 0))) {
      penalty +=
        CROWDING_COST_PER_PX *
        segmentCrowdingPx(
          { x: ax, y: ay },
          { x: bx, y: by },
          { x: dx1, y: dy1 },
          { x: dx2, y: dy2 },
          crowdingClearance
        )
      continue
    }

    penalty += EDGE_CROSSING_PENALTY
    const t = horizontal ? (ay - dy1) / (dy2 - dy1) : (ax - dx1) / (dx2 - dx1)
    const crossingX = dx1 + t * (dx2 - dx1)
    const crossingY = dy1 + t * (dy2 - dy1)
    const alongNeighborSquared = Math.min(
      (crossingX - dx1) ** 2 + (crossingY - dy1) ** 2,
      (crossingX - dx2) ** 2 + (crossingY - dy2) ** 2
    )
    if (alongNeighborSquared < CROSSING_CORNER_CLEARANCE_SQUARED)
      penalty += CROSSING_NEAR_CORNER_PENALTY
  }

  return penalty
}

export const routeConflictsWithNeighborEdges = (
  points: readonly IPoint[],
  neighborEdges: readonly IPoint[][]
): boolean => {
  const neighbors = toSegments(neighborEdges)
  if (neighbors.length === 0) return false
  const crowding = PARALLEL_CROWDING_CLEARANCE_CELLS * CANVAS.SNAP_TO_GRID_PX

  for (let i = 0; i < points.length - 1; i++) {
    const seg: Segment = {
      x1: points[i].x,
      y1: points[i].y,
      x2: points[i + 1].x,
      y2: points[i + 1].y,
    }
    for (const n of neighbors) {
      const gap = parallelGap(seg, n)
      if (gap !== null) {
        if (gap < crowding) return true
        continue
      }
      if (!segmentsCross(seg, n)) {
        if (
          segmentCrowdingPx(
            { x: seg.x1, y: seg.y1 },
            { x: seg.x2, y: seg.y2 },
            { x: n.x1, y: n.y1 },
            { x: n.x2, y: n.y2 },
            crowding
          ) > 0
        )
          return true
        continue
      }
      const at = crossingPoint(seg, n)
      if (
        distanceSquaredToEnds(at, seg) < CROSSING_CORNER_CLEARANCE_SQUARED ||
        distanceSquaredToEnds(at, n) < CROSSING_CORNER_CLEARANCE_SQUARED
      ) {
        return true
      }
    }
  }
  return false
}

const parallelOverlapLen = (a: Segment, b: Segment): number => {
  if (a.y1 === a.y2 && b.y1 === b.y2)
    return Math.max(
      0,
      Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2)) -
        Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2))
    )
  if (a.x1 === a.x2 && b.x1 === b.x2)
    return Math.max(
      0,
      Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2)) -
        Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2))
    )
  return 0
}

export const routeConflictScore = (
  points: readonly IPoint[],
  neighborEdges: readonly IPoint[][]
): { crossings: number; proximityPx: number } => {
  const neighbors = toSegments(neighborEdges)
  let crossings = 0
  let proximityPx = 0
  if (neighbors.length === 0) return { crossings, proximityPx }
  const crowding = PARALLEL_CROWDING_CLEARANCE_CELLS * CANVAS.SNAP_TO_GRID_PX
  for (let i = 0; i < points.length - 1; i++) {
    const seg: Segment = {
      x1: points[i].x,
      y1: points[i].y,
      x2: points[i + 1].x,
      y2: points[i + 1].y,
    }
    for (const n of neighbors) {
      const gap = parallelGap(seg, n)
      if (gap !== null) {
        if (gap < crowding)
          proximityPx += (parallelOverlapLen(seg, n) * (crowding - gap)) / crowding
      } else if (segmentsCross(seg, n)) crossings++
      else
        proximityPx += segmentCrowdingPx(
          { x: seg.x1, y: seg.y1 },
          { x: seg.x2, y: seg.y2 },
          { x: n.x1, y: n.y1 },
          { x: n.x2, y: n.y2 },
          crowding
        )
    }
  }
  return { crossings, proximityPx: Math.round(proximityPx) }
}

const collectLines = (
  exact: readonly number[],
  gridSnapped: readonly number[],
  grid: number
): number[] => {
  const snap = (v: number) => Math.round(v / grid) * grid
  const lines = new Set<number>()
  for (const v of exact) lines.add(v)
  for (const v of gridSnapped) lines.add(snap(v))
  return [...lines].sort((a, b) => a - b)
}

class MinHeap {
  private priorities: Float64Array
  private seqs: Float64Array
  private states: Int32Array
  private count = 0

  constructor(capacity: number) {
    const initial = Math.max(16, capacity)
    this.priorities = new Float64Array(initial)
    this.seqs = new Float64Array(initial)
    this.states = new Int32Array(initial)
  }

  private grow(): void {
    const grown = this.priorities.length * 2
    const priorities = new Float64Array(grown)
    const seqs = new Float64Array(grown)
    const states = new Int32Array(grown)
    priorities.set(this.priorities)
    seqs.set(this.seqs)
    states.set(this.states)
    this.priorities = priorities
    this.seqs = seqs
    this.states = states
  }

  private less(a: number, b: number): boolean {
    const pa = this.priorities[a]
    const pb = this.priorities[b]
    return pa < pb || (pa === pb && this.seqs[a] < this.seqs[b])
  }

  push(priority: number, seq: number, state: number): void {
    if (this.count === this.priorities.length) this.grow()
    let i = this.count++
    while (i > 0) {
      const parent = (i - 1) >> 2
      const parentPriority = this.priorities[parent]
      const parentSeq = this.seqs[parent]
      if (parentPriority < priority || (parentPriority === priority && parentSeq < seq)) break
      this.priorities[i] = parentPriority
      this.seqs[i] = parentSeq
      this.states[i] = this.states[parent]
      i = parent
    }
    this.priorities[i] = priority
    this.seqs[i] = seq
    this.states[i] = state
  }

  pop(): number {
    if (this.count === 0) return -1
    const top = this.states[0]
    this.count--
    if (this.count > 0) {
      const priority = this.priorities[this.count]
      const seq = this.seqs[this.count]
      const state = this.states[this.count]
      let i = 0
      for (;;) {
        const first = 4 * i + 1
        if (first >= this.count) break
        let child = first
        const end = Math.min(first + 4, this.count)
        for (let candidate = first + 1; candidate < end; candidate++)
          if (this.less(candidate, child)) child = candidate
        const childPriority = this.priorities[child]
        const childSeq = this.seqs[child]
        if (priority < childPriority || (priority === childPriority && seq < childSeq)) break
        this.priorities[i] = childPriority
        this.seqs[i] = childSeq
        this.states[i] = this.states[child]
        i = child
      }
      this.priorities[i] = priority
      this.seqs[i] = seq
      this.states[i] = state
    }
    return top
  }

  peekPriority(): number {
    return this.count === 0 ? Infinity : this.priorities[0]
  }

  get size(): number {
    return this.count
  }
}

export type RouteEndpointCandidate = {
  point: IPoint
  position: Position
  stubLength: number
  cost?: number
  forceStubTurn?: boolean
}

export type RouteTarget = RouteEndpointCandidate

export type CandidateRouteResult = {
  route: IPoint[]
  sourceIndex: number
  targetIndex: number
  cost: number
}

export const routeAroundObstaclesBetweenCandidates = (
  sources: readonly RouteEndpointCandidate[],
  targets: readonly RouteTarget[],
  obstacles: readonly ObstacleRect[],
  neighborEdges: readonly IPoint[][] = [],
  incumbentRoute?: readonly IPoint[],
  endpointRects?: Readonly<{ source: Rect; target: Rect }>
): CandidateRouteResult | null => {
  if (sources.length === 0 || targets.length === 0) return null
  const searchStartedAt =
    import.meta.env.DEV || import.meta.env.VITE_E2E === "true" ? performance.now() : 0
  let searchLoopStartedAt = 0
  let stepPricings = 0
  let heuristicEvaluations = 0
  let heapPushes = 0
  let boundPrunes = 0
  let searchCellCount = 0
  let usesIncumbentBound = false
  const recordSearch = (expansions: number, abandoned: boolean): void => {
    const elapsed =
      import.meta.env.DEV || import.meta.env.VITE_E2E === "true"
        ? performance.now() - searchStartedAt
        : 0
    const setup = searchLoopStartedAt > 0 ? searchLoopStartedAt - searchStartedAt : elapsed
    recordRouterSearch(
      expansions,
      abandoned,
      elapsed,
      setup,
      stepPricings,
      heuristicEvaluations,
      heapPushes,
      usesIncumbentBound,
      boundPrunes,
      searchCellCount
    )
  }
  const grid = CANVAS.SNAP_TO_GRID_PX
  const idealClearance = EDGES.NODE_CLEARANCE_PX
  const minClearance = EDGES.MIN_NODE_CLEARANCE_PX
  const bendPenalty = BEND_PENALTY_IN_CELLS * grid
  const crowdingClearance = PARALLEL_CROWDING_CLEARANCE_CELLS * grid
  const clearanceRate = CLEARANCE_COST_PER_PX_AT_FULL_DEFICIT / (idealClearance / grid)

  const compareCandidateValues = (ac: RouteEndpointCandidate, bc: RouteEndpointCandidate): number =>
    ac.point.x - bc.point.x ||
    ac.point.y - bc.point.y ||
    (ac.position < bc.position ? -1 : ac.position > bc.position ? 1 : 0) ||
    ac.stubLength - bc.stubLength ||
    validateEndpointCost(ac.cost) - validateEndpointCost(bc.cost) ||
    Number(ac.forceStubTurn ?? false) - Number(bc.forceStubTurn ?? false)
  const compareCandidates = (
    a: { candidate: RouteEndpointCandidate; inputIndex: number },
    b: { candidate: RouteEndpointCandidate; inputIndex: number }
  ): number => {
    return compareCandidateValues(a.candidate, b.candidate) || a.inputIndex - b.inputIndex
  }
  const canonicalSources = sources
    .map((candidate, inputIndex) => ({ candidate, inputIndex }))
    .sort(compareCandidates)
  const canonicalTargets = targets
    .map((candidate, inputIndex) => ({ candidate, inputIndex }))
    .sort(compareCandidates)

  const compareCollections = (
    a: readonly { candidate: RouteEndpointCandidate }[],
    b: readonly { candidate: RouteEndpointCandidate }[]
  ): number => {
    const length = Math.min(a.length, b.length)
    for (let i = 0; i < length; i++) {
      const compared = compareCandidateValues(a[i].candidate, b[i].candidate)
      if (compared !== 0) return compared
    }
    return a.length - b.length
  }
  if (
    canonicalSources.length === 1 &&
    canonicalTargets.length === 1 &&
    compareCollections(canonicalSources, canonicalTargets) > 0
  ) {
    const reversed = routeAroundObstaclesBetweenCandidates(
      targets,
      sources,
      obstacles,
      neighborEdges,
      incumbentRoute ? [...incumbentRoute].reverse() : undefined,
      endpointRects ? { source: endpointRects.target, target: endpointRects.source } : undefined
    )
    return reversed
      ? {
          route: [...reversed.route].reverse(),
          sourceIndex: reversed.targetIndex,
          targetIndex: reversed.sourceIndex,
          cost: reversed.cost,
        }
      : null
  }

  const sourceInfos = canonicalSources.map(({ candidate: s, inputIndex }) => {
    const heading = headingOf(s.position)
    return {
      inputIndex,
      point: s.point,
      heading,
      exit: advance(s.point, heading, s.stubLength),
      minExit: advance(s.point, heading, grid),
      cost: validateEndpointCost(s.cost),
      forceStubTurn: s.forceStubTurn ?? false,
    }
  })

  const targetInfos = canonicalTargets.map(({ candidate: t, inputIndex }) => {
    const heading = headingOf(t.position)
    return {
      inputIndex,
      point: t.point,
      requiredArrival: opposite(heading),
      exit: advance(t.point, heading, t.stubLength),
      minExit: advance(t.point, heading, grid),
      cost: validateEndpointCost(t.cost),
      forceStubTurn: t.forceStubTurn ?? false,
    }
  })
  const hard = obstacles.filter((o) => !o.soft)
  const soft = obstacles.filter((o) => o.soft)

  let lowerBound = Infinity
  for (const source of sourceInfos)
    for (const target of targetInfos)
      lowerBound = Math.min(
        lowerBound,
        source.cost +
          target.cost +
          Math.abs(source.point.x - target.point.x) +
          Math.abs(source.point.y - target.point.y)
      )

  const straightHeading = (a: IPoint, b: IPoint): Heading | null => {
    if (a.x === b.x) {
      if (a.y === b.y) return null
      return b.y > a.y ? Heading.Down : Heading.Up
    }
    if (a.y === b.y) return b.x > a.x ? Heading.Right : Heading.Left
    return null
  }
  const segmentEnters = (a: IPoint, b: IPoint, rect: ObstacleRect): boolean =>
    Math.min(a.x, b.x) < rect.x + rect.width &&
    Math.max(a.x, b.x) > rect.x &&
    Math.min(a.y, b.y) < rect.y + rect.height &&
    Math.max(a.y, b.y) > rect.y
  const sameRect = (left: ObstacleRect, right: Rect): boolean =>
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  const isEndpointBody = (rect: ObstacleRect): boolean =>
    endpointRects !== undefined &&
    (sameRect(rect, endpointRects.source) || sameRect(rect, endpointRects.target))
  const straightHard = hard.filter((rect) => !isEndpointBody(rect))

  for (let sourceRank = 0; sourceRank < sourceInfos.length; sourceRank++) {
    const source = sourceInfos[sourceRank]
    for (let targetRank = 0; targetRank < targetInfos.length; targetRank++) {
      const target = targetInfos[targetRank]
      const distance =
        Math.abs(source.point.x - target.point.x) + Math.abs(source.point.y - target.point.y)
      if (source.cost + target.cost + distance !== lowerBound) continue
      if (source.forceStubTurn || target.forceStubTurn) continue

      const heading = straightHeading(source.point, target.point)
      const coincident = distance === 0
      if (
        coincident
          ? source.heading !== target.requiredArrival
          : heading !== source.heading || heading !== target.requiredArrival
      )
        continue
      if (
        straightHard.some((rect) => segmentEnters(source.point, target.point, rect)) ||
        soft.some((rect) => segmentEnters(source.point, target.point, rect))
      )
        continue

      if (!coincident) {
        const { nearest, achievable } = clearanceAlongside(
          source.point,
          target.point,
          straightHard,
          idealClearance
        )
        if (nearest === 0 || (nearest !== Infinity && nearest < achievable)) continue
        const conflict = routeConflictScore([source.point, target.point], neighborEdges)
        if (conflict.crossings > 0 || conflict.proximityPx > 0) continue
      }

      return {
        route: coincident ? [source.point] : [source.point, target.point],
        sourceIndex: source.inputIndex,
        targetIndex: target.inputIndex,
        cost: lowerBound,
      }
    }
  }

  const targetCount = targetInfos.length
  const targetX = new Float64Array(targetCount)
  const targetY = new Float64Array(targetCount)
  const targetArrival = new Uint8Array(targetCount)
  const targetCost = new Float64Array(targetCount)
  let hasForcedTarget = false
  for (let i = 0; i < targetCount; i++) {
    const target = targetInfos[i]
    targetX[i] = target.point.x
    targetY[i] = target.point.y
    targetArrival[i] = target.requiredArrival
    targetCost[i] = target.cost
    hasForcedTarget ||= target.forceStubTurn
  }

  const neighborSegments = neighborsWithinReach(
    sourceInfos[0].point,
    [...sourceInfos.slice(1).map((s) => s.point), ...targetInfos.map((t) => t.point)],
    obstacles,
    neighborEdges
  )
  const neighborIndex = indexNeighbors(neighborSegments)
  const margin = 4 * grid
  const spanXs = [
    ...sourceInfos.flatMap((s) => [s.point.x, s.exit.x]),
    ...targetInfos.flatMap((t) => [t.point.x, t.exit.x]),
    ...obstacles.flatMap((o) => [o.x, o.x + o.width]),
  ]
  const spanYs = [
    ...sourceInfos.flatMap((s) => [s.point.y, s.exit.y]),
    ...targetInfos.flatMap((t) => [t.point.y, t.exit.y]),
    ...obstacles.flatMap((o) => [o.y, o.y + o.height]),
  ]
  const exactXs = [
    ...sourceInfos.flatMap((s) => [s.point.x, s.exit.x, s.minExit.x]),
    ...targetInfos.flatMap((t) => [t.point.x, t.exit.x, t.minExit.x]),
    Math.min(...spanXs) - margin,
    Math.max(...spanXs) + margin,
  ]
  const exactYs = [
    ...sourceInfos.flatMap((s) => [s.point.y, s.exit.y, s.minExit.y]),
    ...targetInfos.flatMap((t) => [t.point.y, t.exit.y, t.minExit.y]),
    Math.min(...spanYs) - margin,
    Math.max(...spanYs) + margin,
  ]
  const escapeLow = (at: number) => Math.floor((at - crowdingClearance) / grid) * grid
  const escapeHigh = (at: number) => Math.ceil((at + crowdingClearance) / grid) * grid
  const terminalDetourLanes = (
    start: number,
    end: number,
    startTerminal: boolean,
    endTerminal: boolean
  ): number[] => {
    const lanes: number[] = []
    if (startTerminal) lanes.push(start < end ? escapeLow(start) : escapeHigh(start))
    if (endTerminal) lanes.push(end < start ? escapeLow(end) : escapeHigh(end))
    return lanes
  }
  const neighborXs = neighborSegments.flatMap((s) => {
    if (s.x1 === s.x2) return [escapeLow(s.x1), escapeHigh(s.x1)]
    if (s.y1 === s.y2) {
      const lanes = [
        ...terminalDetourLanes(s.x1, s.x2, s.startTerminal ?? false, s.endTerminal ?? false),
      ]
      if (Math.abs(s.x2 - s.x1) >= 2 * CROSSING_CORNER_CLEARANCE + grid)
        lanes.push((s.x1 + s.x2) / 2)
      return lanes
    }
    return terminalDetourLanes(s.x1, s.x2, s.startTerminal ?? false, s.endTerminal ?? false)
  })
  const neighborYs = neighborSegments.flatMap((s) => {
    if (s.y1 === s.y2) return [escapeLow(s.y1), escapeHigh(s.y1)]
    if (s.x1 === s.x2) {
      const lanes = [
        ...terminalDetourLanes(s.y1, s.y2, s.startTerminal ?? false, s.endTerminal ?? false),
      ]
      if (Math.abs(s.y2 - s.y1) >= 2 * CROSSING_CORNER_CLEARANCE + grid)
        lanes.push((s.y1 + s.y2) / 2)
      return lanes
    }
    return terminalDetourLanes(s.y1, s.y2, s.startTerminal ?? false, s.endTerminal ?? false)
  })
  const snappedXs = [...obstacles.flatMap((o) => [o.x, o.x + o.width]), ...neighborXs]
  const snappedYs = [...obstacles.flatMap((o) => [o.y, o.y + o.height]), ...neighborYs]

  const clearanceLanes = (rects: readonly ObstacleRect[], axis: "x" | "y") =>
    rects.flatMap((o) =>
      axis === "x"
        ? [o.x - idealClearance, o.x + o.width + idealClearance]
        : [o.y - idealClearance, o.y + o.height + idealClearance]
    )

  const facingGapMids = (rects: readonly ObstacleRect[], axis: "x" | "y"): number[] => {
    const mids: number[] = []
    for (const a of rects) {
      for (const b of rects) {
        if (a === b) continue
        const aEnd = axis === "x" ? a.x + a.width : a.y + a.height
        const bStart = axis === "x" ? b.x : b.y
        const gap = bStart - aEnd
        if (gap <= 0 || gap >= 4 * idealClearance) continue

        const aLo = axis === "x" ? a.y : a.x
        const aHi = axis === "x" ? a.y + a.height : a.x + a.width
        const bLo = axis === "x" ? b.y : b.x
        const bHi = axis === "x" ? b.y + b.height : b.x + b.width
        if (Math.min(aHi, bHi) < Math.max(aLo, bLo)) continue

        const mid = (aEnd + bStart) / 2
        mids.push(Math.floor(mid / grid) * grid, Math.ceil(mid / grid) * grid)
      }
    }
    return mids
  }

  const xs = collectLines(
    exactXs,
    [...snappedXs, ...clearanceLanes(obstacles, "x"), ...facingGapMids(obstacles, "x")],
    grid
  )
  const ys = collectLines(
    exactYs,
    [...snappedYs, ...clearanceLanes(obstacles, "y"), ...facingGapMids(obstacles, "y")],
    grid
  )
  const xIndex = new Map(xs.map((v, i) => [v, i]))
  const yIndex = new Map(ys.map((v, i) => [v, i]))

  const nodeAt = (xi: number, yi: number): IPoint => ({ x: xs[xi], y: ys[yi] })
  const stride = ys.length
  const cellCount = xs.length * ys.length
  searchCellCount = cellCount
  if (cellCount > MAX_CELLS) {
    recordSearch(0, true)
    return null
  }
  const stateCount = cellCount * 4
  const stateId = (xi: number, yi: number, h: Heading): number => (xi * stride + yi) * 4 + h

  const targetInputByState = new Int32Array(stateCount).fill(-1)
  const targetCanonicalByState = new Int32Array(stateCount).fill(-1)
  const targetCostByState = new Float64Array(stateCount)
  const targetForceTurnByState = new Uint8Array(stateCount)
  const targetCellMask = new Uint8Array(cellCount)
  const sourceCellMask = new Uint8Array(cellCount)
  sourceInfos.forEach((source) => {
    const xi = xIndex.get(source.point.x)
    const yi = yIndex.get(source.point.y)
    if (xi !== undefined && yi !== undefined) sourceCellMask[xi * stride + yi] = 1
  })
  targetInfos.forEach((t, canonicalIndex) => {
    const cell = xIndex.get(t.point.x)! * stride + yIndex.get(t.point.y)!
    const state = cell * 4 + t.requiredArrival
    const existing = targetInputByState[state]
    if (
      existing === -1 ||
      t.cost < targetCostByState[state] ||
      (t.cost === targetCostByState[state] &&
        targetForceTurnByState[state] === 1 &&
        !t.forceStubTurn)
    ) {
      targetInputByState[state] = t.inputIndex
      targetCanonicalByState[state] = canonicalIndex
      targetCostByState[state] = t.cost
      targetForceTurnByState[state] = t.forceStubTurn ? 1 : 0
    }
    targetCellMask[cell] = 1
  })

  const relaxedCostTo = (
    x: number,
    y: number,
    heading: Heading,
    point: IPoint,
    arrival: Heading
  ): number => {
    const dx = point.x - x
    const dy = point.y - y
    let requiredDirections = 0
    if (dx > 0) requiredDirections |= 1 << Heading.Right
    else if (dx < 0) requiredDirections |= 1 << Heading.Left
    if (dy > 0) requiredDirections |= 1 << Heading.Down
    else if (dy < 0) requiredDirections |= 1 << Heading.Up

    const bends =
      MIN_BENDS_BY_HEADINGS_AND_DIRECTIONS[(heading * 4 + arrival) * 16 + requiredDirections]
    return Math.abs(dx) + Math.abs(dy) + bends * bendPenalty
  }
  const heuristicByState = new Float64Array(cellCount * 4).fill(NaN)
  const heuristicTargetRankByState = new Uint16Array(cellCount * 4)
  const heuristic = (xi: number, yi: number, heading: Heading): number => {
    const state = stateId(xi, yi, heading)
    const cached = heuristicByState[state]
    if (!Number.isNaN(cached)) return cached

    heuristicEvaluations++
    let best = Infinity
    let bestTargetRank = 0
    if (!hasForcedTarget) {
      const x = xs[xi]
      const y = ys[yi]
      for (let targetRank = 0; targetRank < targetCount; targetRank++) {
        const dx = targetX[targetRank] - x
        const dy = targetY[targetRank] - y
        let requiredDirections = 0
        if (dx > 0) requiredDirections |= 1 << Heading.Right
        else if (dx < 0) requiredDirections |= 1 << Heading.Left
        if (dy > 0) requiredDirections |= 1 << Heading.Down
        else if (dy < 0) requiredDirections |= 1 << Heading.Up
        const bends =
          MIN_BENDS_BY_HEADINGS_AND_DIRECTIONS[
            (heading * 4 + targetArrival[targetRank]) * 16 + requiredDirections
          ]
        const cost = Math.abs(dx) + Math.abs(dy) + bends * bendPenalty + targetCost[targetRank]
        if (cost < best) {
          best = cost
          bestTargetRank = targetRank
        }
      }
      heuristicByState[state] = best
      heuristicTargetRankByState[state] = bestTargetRank
      return best
    }
    for (let targetRank = 0; targetRank < targetInfos.length; targetRank++) {
      const target = targetInfos[targetRank]
      let pathCost: number
      if (
        target.forceStubTurn &&
        !(
          xs[xi] === target.point.x &&
          ys[yi] === target.point.y &&
          heading === target.requiredArrival
        )
      ) {
        pathCost = Infinity
        for (let arrival = Heading.Up; arrival <= Heading.Left; arrival++) {
          if (arrival === target.requiredArrival) continue
          pathCost = Math.min(
            pathCost,
            relaxedCostTo(xs[xi], ys[yi], heading, target.exit, arrival) +
              bendPenalty +
              Math.abs(target.exit.x - target.point.x) +
              Math.abs(target.exit.y - target.point.y)
          )
        }
      } else {
        pathCost = relaxedCostTo(xs[xi], ys[yi], heading, target.point, target.requiredArrival)
      }

      const cost = pathCost + target.cost
      if (cost < best) {
        best = cost
        bestTargetRank = targetRank
      }
    }
    heuristicByState[state] = best
    heuristicTargetRankByState[state] = bestTargetRank
    return best
  }

  const BLOCKED = -1
  const UNPRICED = -2
  const stepCost = new Float64Array(cellCount * 4).fill(UNPRICED)
  const symmetricStepCost = new Float64Array(cellCount * 2).fill(UNPRICED)

  const UNKNOWN_CORNER = -1
  const cornerCrowding = new Int8Array(cellCount).fill(UNKNOWN_CORNER)

  const bodyCount = hard.length
  const bodyX1 = new Float64Array(bodyCount)
  const bodyY1 = new Float64Array(bodyCount)
  const bodyX2 = new Float64Array(bodyCount)
  const bodyY2 = new Float64Array(bodyCount)
  hard.forEach((rect, i) => {
    bodyX1[i] = rect.x
    bodyY1[i] = rect.y
    bodyX2[i] = rect.x + rect.width
    bodyY2[i] = rect.y + rect.height
  })

  const priceStep = (xi: number, yi: number, nxi: number, nyi: number, nh: Heading): number => {
    const slot = (xi * stride + yi) * 4 + nh
    const cached = stepCost[slot]
    if (cached !== UNPRICED) return cached
    stepPricings++

    const ax = xs[xi]
    const ay = ys[yi]
    const bx = xs[nxi]
    const by = ys[nyi]

    const horizontal = ay === by
    const left = ax < bx ? ax : bx
    const right = ax < bx ? bx : ax
    const top = ay < by ? ay : by
    const bottom = ay < by ? by : ay

    const baseCell = horizontal ? Math.min(xi, nxi) * stride + yi : xi * stride + Math.min(yi, nyi)
    const baseSlot = baseCell * 2 + (horizontal ? 0 : 1)
    let baseCost = symmetricStepCost[baseSlot]

    if (baseCost === UNPRICED) {
      let nearestLo = Infinity
      let nearestHi = Infinity
      let touchesBodyBoundary = false
      for (let i = 0; i < bodyCount; i++) {
        if (left < bodyX2[i] && right > bodyX1[i] && top < bodyY2[i] && bottom > bodyY1[i]) {
          symmetricStepCost[baseSlot] = BLOCKED
          stepCost[slot] = BLOCKED
          return BLOCKED
        }
        const boundaryOverlap = horizontal
          ? Math.min(right, bodyX2[i]) - Math.max(left, bodyX1[i])
          : Math.min(bottom, bodyY2[i]) - Math.max(top, bodyY1[i])
        const crossesOtherAxis = horizontal
          ? ay >= bodyY1[i] && ay <= bodyY2[i]
          : ax >= bodyX1[i] && ax <= bodyX2[i]
        if (boundaryOverlap === 0 && crossesOtherAxis) touchesBodyBoundary = true

        const spanLo = horizontal ? bodyX1[i] : bodyY1[i]
        const spanHi = horizontal ? bodyX2[i] : bodyY2[i]
        const lo = horizontal ? left : top
        const hi = horizontal ? right : bottom
        if (hi <= spanLo || lo >= spanHi) continue

        const at = horizontal ? ay : ax
        const near = horizontal ? bodyY1[i] : bodyX1[i]
        const far = horizontal ? bodyY2[i] : bodyX2[i]
        if (at <= near) {
          const gap = near - at
          if (gap < nearestHi) nearestHi = gap
        } else {
          const gap = at - far
          if (gap < nearestLo) nearestLo = gap
        }
      }

      const length = horizontal ? right - left : bottom - top

      let softCost = 0
      for (const rect of soft) {
        if (
          left < rect.x + rect.width &&
          right > rect.x &&
          top < rect.y + rect.height &&
          bottom > rect.y
        ) {
          const inside = horizontal
            ? Math.min(right, rect.x + rect.width) - Math.max(left, rect.x)
            : Math.min(bottom, rect.y + rect.height) - Math.max(top, rect.y)
          softCost += SOFT_CROSSING_COST_PER_PX * inside
        }
      }

      let proximity = 0
      const nearest = nearestLo < nearestHi ? nearestLo : nearestHi
      if (nearest !== Infinity) {
        const half = (nearestLo + nearestHi) / 2
        const achievable = half < idealClearance ? half : idealClearance

        const deficitCells = Math.max(0, Math.ceil((achievable - nearest) / grid))
        if (deficitCells > 0) proximity += deficitCells * clearanceRate * length

        const drawnOnBody = nearest === 0
        const hugsWithRoomToSpare = nearest < minClearance && achievable >= minClearance
        if (drawnOnBody || hugsWithRoomToSpare) {
          proximity += HUGGING_COST_PER_PX * length
        }

        if (
          nearestLo !== Infinity &&
          nearestHi !== Infinity &&
          nearestLo + nearestHi < 4 * idealClearance
        ) {
          const imbalance = Math.abs(nearestLo - nearestHi) / (nearestLo + nearestHi)
          proximity += CHANNEL_IMBALANCE_TIE_BREAK_PER_PX * imbalance * length
        }
      }

      baseCost =
        length + softCost + proximity + (touchesBodyBoundary ? HUGGING_COST_PER_PX * length : 0)
      symmetricStepCost[baseSlot] = baseCost
    }

    if (baseCost === BLOCKED) {
      stepCost[slot] = BLOCKED
      return BLOCKED
    }
    const cost = baseCost + edgePenaltyAt(ax, ay, bx, by, neighborIndex, crowdingClearance)

    stepCost[slot] = cost
    return cost
  }

  const incumbentUpperBound = (() => {
    if (!incumbentRoute || incumbentRoute.length === 0) return Infinity
    const route = incumbentRoute.filter(
      (point, index) =>
        index === 0 ||
        point.x !== incumbentRoute[index - 1].x ||
        point.y !== incumbentRoute[index - 1].y
    )
    if (route.length === 0) return Infinity

    const headingBetween = (a: IPoint, b: IPoint): Heading | null => {
      if (a.x === b.x) return a.y < b.y ? Heading.Down : a.y > b.y ? Heading.Up : null
      if (a.y === b.y) return a.x < b.x ? Heading.Right : Heading.Left
      return null
    }
    const samePoint = (a: IPoint, b: IPoint): boolean => a.x === b.x && a.y === b.y
    const firstHeading = route.length > 1 ? headingBetween(route[0], route[1]) : null
    const lastHeading =
      route.length > 1 ? headingBetween(route[route.length - 2], route[route.length - 1]) : null
    let best = Infinity

    for (const source of sourceInfos) {
      if (!samePoint(route[0], source.point)) continue
      if (firstHeading !== null && firstHeading !== source.heading) continue
      if (source.forceStubTurn && (route.length < 3 || !samePoint(route[1], source.exit))) continue

      for (const target of targetInfos) {
        if (!samePoint(route[route.length - 1], target.point)) continue
        if (route.length === 1) {
          if (source.heading !== target.requiredArrival) continue
          best = Math.min(best, source.cost + target.cost)
          continue
        }
        if (lastHeading !== target.requiredArrival) continue
        if (
          target.forceStubTurn &&
          (route.length < 3 || !samePoint(route[route.length - 2], target.exit))
        )
          continue

        let total = source.cost
        let priorHeading: Heading | null = null
        let valid = true
        for (let segmentIndex = 0; segmentIndex < route.length - 1; segmentIndex++) {
          const from = route[segmentIndex]
          const to = route[segmentIndex + 1]
          const heading = headingBetween(from, to)
          const fromXi = xIndex.get(from.x)
          const fromYi = yIndex.get(from.y)
          const toXi = xIndex.get(to.x)
          const toYi = yIndex.get(to.y)
          if (
            heading === null ||
            fromXi === undefined ||
            fromYi === undefined ||
            toXi === undefined ||
            toYi === undefined ||
            (priorHeading !== null && heading === opposite(priorHeading))
          ) {
            valid = false
            break
          }

          if (priorHeading !== null && heading !== priorHeading) {
            total += bendPenalty
            const cornerCell = fromXi * stride + fromYi
            let crowded = cornerCrowding[cornerCell]
            if (crowded === UNKNOWN_CORNER) {
              crowded = cornerCrowded(from.x, from.y, neighborIndex, CROSSING_CORNER_CLEARANCE)
                ? 1
                : 0
              cornerCrowding[cornerCell] = crowded
            }
            if (crowded === 1) total += CROSSING_NEAR_CORNER_PENALTY
          }

          let xi = fromXi
          let yi = fromYi
          while (xi !== toXi || yi !== toYi) {
            const nxi = heading === Heading.Left ? xi - 1 : heading === Heading.Right ? xi + 1 : xi
            const nyi = heading === Heading.Up ? yi - 1 : heading === Heading.Down ? yi + 1 : yi
            if (nxi < 0 || nxi >= xs.length || nyi < 0 || nyi >= ys.length) {
              valid = false
              break
            }
            const step = priceStep(xi, yi, nxi, nyi, heading)
            if (step === BLOCKED) {
              valid = false
              break
            }
            total += step
            xi = nxi
            yi = nyi

            const atRouteEnd = segmentIndex === route.length - 2 && xi === toXi && yi === toYi
            const cell = xi * stride + yi
            if (
              sourceCellMask[cell] === 1 ||
              (targetCellMask[cell] === 1 &&
                (!atRouteEnd ||
                  stateId(xi, yi, heading) !== stateId(toXi, toYi, target.requiredArrival)))
            ) {
              valid = false
              break
            }
          }
          if (!valid) break
          priorHeading = heading
        }
        if (valid) best = Math.min(best, total + target.cost)
      }
    }
    return best
  })()
  usesIncumbentBound = incumbentUpperBound !== Infinity

  const gScore = new Float64Array(stateCount).fill(NaN)
  const cameFrom = new Int32Array(stateCount).fill(-1)
  const sourceOf = new Int32Array(stateCount).fill(-1)
  const sourceRankOf = new Int32Array(stateCount).fill(-1)
  const closed = new Uint8Array(stateCount)
  const frontier = new MinHeap(Math.min(stateCount, 1024))
  let seq = 0

  const sourceStateMask = new Uint8Array(stateCount)
  sourceInfos.forEach((source, canonicalIndex) => {
    const xi = xIndex.get(source.point.x)!
    const yi = yIndex.get(source.point.y)!
    const cell = xi * stride + yi
    const state = stateId(xi, yi, source.heading)
    sourceCellMask[cell] = 1
    sourceStateMask[state] = 1
    const known = gScore[state]
    if (!Number.isNaN(known) && known <= source.cost) return
    gScore[state] = source.cost
    sourceOf[state] = source.inputIndex
    sourceRankOf[state] = canonicalIndex

    let sourceHeuristic = heuristic(xi, yi, source.heading)
    if (targetInputByState[state] === -1) {
      const nxi =
        source.heading === Heading.Left ? xi - 1 : source.heading === Heading.Right ? xi + 1 : xi
      const nyi =
        source.heading === Heading.Up ? yi - 1 : source.heading === Heading.Down ? yi + 1 : yi
      if (nxi < 0 || nxi >= xs.length || nyi < 0 || nyi >= ys.length) return
      const firstStep = priceStep(xi, yi, nxi, nyi, source.heading)
      if (firstStep === BLOCKED) return
      sourceHeuristic = firstStep + heuristic(nxi, nyi, source.heading)
    }
    const priority = source.cost + sourceHeuristic
    if (priority > incumbentUpperBound) {
      boundPrunes++
      return
    }
    frontier.push(priority, seq++, state)
    heapPushes++
  })

  const unpack = (state: number): { xi: number; yi: number; h: Heading } => {
    const h = (state & 3) as Heading
    const cell = (state - h) / 4
    return { xi: Math.floor(cell / stride), yi: cell % stride, h }
  }

  let expansions = 0
  let bestGoal: {
    state: number
    total: number
    sourceRank: number
    targetInputIndex: number
    targetCanonicalIndex: number
  } | null = null
  if (import.meta.env.DEV || import.meta.env.VITE_E2E === "true")
    searchLoopStartedAt = performance.now()

  while (
    frontier.size > 0 &&
    frontier.peekPriority() <= incumbentUpperBound &&
    (!bestGoal ||
      frontier.peekPriority() < bestGoal.total ||
      (frontier.peekPriority() === bestGoal.total &&
        (bestGoal.sourceRank > 0 || bestGoal.targetCanonicalIndex > 0)))
  ) {
    const current = frontier.pop()
    if (closed[current]) continue

    const h = (current & 3) as Heading
    const cell = (current - h) / 4
    const xi = (cell / stride) | 0
    const yi = cell - xi * stride

    if (bestGoal && gScore[current] + heuristic(xi, yi, h) === bestGoal.total) {
      const sourceRank = sourceRankOf[current]
      const targetRank = heuristicTargetRankByState[current]
      if (
        sourceRank > bestGoal.sourceRank ||
        (sourceRank === bestGoal.sourceRank && targetRank >= bestGoal.targetCanonicalIndex)
      )
        continue
    }

    closed[current] = 1

    if (++expansions > MAX_EXPANSIONS) {
      recordSearch(expansions, true)
      return null
    }

    const targetInputIndex = targetInputByState[current]
    if (targetInputIndex !== -1) {
      const total = gScore[current] + targetCostByState[current]
      const sourceRank = sourceRankOf[current]
      const targetCanonicalIndex = targetCanonicalByState[current]
      if (
        !bestGoal ||
        total < bestGoal.total ||
        (total === bestGoal.total &&
          (sourceRank < bestGoal.sourceRank ||
            (sourceRank === bestGoal.sourceRank &&
              targetCanonicalIndex < bestGoal.targetCanonicalIndex)))
      ) {
        bestGoal = {
          state: current,
          total,
          sourceRank,
          targetInputIndex,
          targetCanonicalIndex,
        }
      }
      continue
    }

    const g = gScore[current]
    const leavingSource = sourceStateMask[current] === 1 && cameFrom[current] === -1
    const rootSource = sourceInfos[sourceRankOf[current]]
    const rootForcesStubTurn = rootSource?.forceStubTurn ?? false
    const atSourceStubExit =
      rootForcesStubTurn && xs[xi] === rootSource.exit.x && ys[yi] === rootSource.exit.y

    const directionCount = leavingSource ? 1 : 3
    const directionOffset = h * 3
    for (let directionIndex = 0; directionIndex < directionCount; directionIndex++) {
      const nh = (leavingSource ? h : NEXT_HEADINGS[directionOffset + directionIndex]) as Heading

      const nxi = nh === Heading.Left ? xi - 1 : nh === Heading.Right ? xi + 1 : xi
      const nyi = nh === Heading.Up ? yi - 1 : nh === Heading.Down ? yi + 1 : yi
      if (nxi < 0 || nxi >= xs.length || nyi < 0 || nyi >= ys.length) continue

      const nextCell = nxi * stride + nyi
      if (sourceCellMask[nextCell] === 1) continue
      const neighbourState = stateId(nxi, nyi, nh)
      if (closed[neighbourState]) continue
      const targetHere = targetInputByState[neighbourState]
      if (targetCellMask[nextCell] === 1 && targetHere === -1) continue
      if (targetForceTurnByState[neighbourState] === 1) {
        const targetInfo = targetInfos[targetCanonicalByState[neighbourState]]
        const atStubExit = xs[xi] === targetInfo.exit.x && ys[yi] === targetInfo.exit.y
        if (!atStubExit || nh === h) continue
      }

      if (atSourceStubExit && nh === h) continue

      const step = priceStep(xi, yi, nxi, nyi, nh)
      if (step === BLOCKED) continue

      let bend = 0
      if (nh !== h) {
        bend = bendPenalty
        const cell = xi * stride + yi
        let crowded = cornerCrowding[cell]
        if (crowded === UNKNOWN_CORNER) {
          crowded = cornerCrowded(xs[xi], ys[yi], neighborIndex, CROSSING_CORNER_CLEARANCE) ? 1 : 0
          cornerCrowding[cell] = crowded
        }
        if (crowded === 1) bend += CROSSING_NEAR_CORNER_PENALTY
      }
      const tentative = g + step + bend

      const known = gScore[neighbourState]
      const unvisited = Number.isNaN(known)
      const improvesCanonicalSource =
        !unvisited && tentative === known && sourceRankOf[current] < sourceRankOf[neighbourState]
      if (!unvisited && tentative > known) continue
      if (!unvisited && tentative === known && !improvesCanonicalSource) continue

      const priority = tentative + heuristic(nxi, nyi, nh)
      if (priority > incumbentUpperBound) {
        boundPrunes++
        continue
      }
      gScore[neighbourState] = tentative
      cameFrom[neighbourState] = current
      sourceOf[neighbourState] = sourceOf[current]
      sourceRankOf[neighbourState] = sourceRankOf[current]
      frontier.push(priority, seq++, neighbourState)
      heapPushes++
    }
  }

  if (bestGoal) {
    const raw: IPoint[] = []
    let state = bestGoal.state
    let remaining = stateCount
    while (state !== -1) {
      if (remaining-- === 0) {
        recordSearch(expansions, true)
        return null
      }
      const p = unpack(state)
      raw.push(nodeAt(p.xi, p.yi))
      state = cameFrom[state]
    }
    raw.reverse()
    recordSearch(expansions, false)
    return {
      route: simplifyCollinear(raw),
      sourceIndex: sourceOf[bestGoal.state],
      targetIndex: bestGoal.targetInputIndex,
      cost: bestGoal.total,
    }
  }

  if (incumbentUpperBound !== Infinity)
    return routeAroundObstaclesBetweenCandidates(sources, targets, obstacles, neighborEdges)

  recordSearch(expansions, false)
  return null
}

export const routeAroundObstaclesToTargets = (
  sourcePoint: IPoint,
  sourcePosition: Position,
  sourceStubLength: number,
  targets: readonly RouteTarget[],
  obstacles: readonly ObstacleRect[],
  neighborEdges: readonly IPoint[][] = []
): { route: IPoint[]; targetIndex: number } | null => {
  const result = routeAroundObstaclesBetweenCandidates(
    [
      {
        point: sourcePoint,
        position: sourcePosition,
        stubLength: sourceStubLength,
      },
    ],
    targets,
    obstacles,
    neighborEdges
  )
  return result ? { route: result.route, targetIndex: result.targetIndex } : null
}

export const routeAroundObstacles = (
  sourcePoint: IPoint,
  targetPoint: IPoint,
  sourcePosition: Position,
  targetPosition: Position,
  obstacles: readonly ObstacleRect[],
  sourceStubLength: number,
  targetStubLength: number,
  neighborEdges: readonly IPoint[][] = []
): IPoint[] | null => {
  const result = routeAroundObstaclesToTargets(
    sourcePoint,
    sourcePosition,
    sourceStubLength,
    [
      {
        point: targetPoint,
        position: targetPosition,
        stubLength: targetStubLength,
      },
    ],
    obstacles,
    neighborEdges
  )
  return result ? result.route : null
}

const simplifyCollinear = (points: IPoint[]): IPoint[] => {
  if (points.length < 3) return points
  const result: IPoint[] = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1]
    const curr = points[i]
    const next = points[i + 1]
    const passThroughX =
      prev.x === curr.x && curr.x === next.x && (prev.y - curr.y) * (next.y - curr.y) < 0
    const passThroughY =
      prev.y === curr.y && curr.y === next.y && (prev.x - curr.x) * (next.x - curr.x) < 0
    if (!passThroughX && !passThroughY) result.push(curr)
  }
  result.push(points[points.length - 1])
  return result
}

const advance = (point: IPoint, heading: Heading, distance: number): IPoint => {
  switch (heading) {
    case Heading.Up:
      return { x: point.x, y: point.y - distance }
    case Heading.Right:
      return { x: point.x + distance, y: point.y }
    case Heading.Down:
      return { x: point.x, y: point.y + distance }
    case Heading.Left:
    default:
      return { x: point.x - distance, y: point.y }
  }
}
