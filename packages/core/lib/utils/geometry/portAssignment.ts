import { Position, type Rect } from "@xyflow/system"
import { CANVAS } from "@/utils/geometry/routingConstants"
import { clamp, lexLess } from "@/utils/geometry/scalar"
import type { IPoint } from "@/edges/Connection"
import {
  balancedPortOffsets,
  polylineConflictCost,
  ROUTING_COST,
} from "@/utils/geometry/routingCost"
import {
  ALL_SIDES,
  OUTWARD_NORMAL,
  SIDE_ORDER,
  centerOf,
  isVerticalSide,
  sideAxisLength,
  canRunStraight,
  cornerMargin,
} from "@/utils/geometry/rectSides"

const GRID = CANVAS.SNAP_TO_GRID_PX

export const PORT_PITCH_PX = 3 * GRID

const CORNER_CLEARANCE_PX = 2 * GRID

const CROSSING_BEND_EQUIV =
  ROUTING_COST.edgeCrossing /
  (ROUTING_COST.bendInGridCells * CANVAS.SNAP_TO_GRID_PX)

const bendsForSide = (side: Position, rect: Rect, partner: Rect): number => {
  const c = centerOf(rect)
  const p = centerOf(partner)
  const n = OUTWARD_NORMAL[side]
  const along = n.x * (p.x - c.x) + n.y * (p.y - c.y)
  if (along <= 0) return 3
  return canRunStraight(isVerticalSide(side), rect, partner) ? 0 : 1
}

const combinedBends = (
  sU: Position,
  sV: Position,
  U: Rect,
  V: Rect
): number => {
  const cU = centerOf(U)
  const cV = centerOf(V)
  const dx = cV.x - cU.x
  const dy = cV.y - cU.y
  const nU = OUTWARD_NORMAL[sU]
  const nV = OUTWARD_NORMAL[sV]
  const alongU = nU.x * dx + nU.y * dy
  const alongV = -(nV.x * dx + nV.y * dy)
  if (alongU <= 0 && alongV <= 0) return 4
  if (alongU <= 0 || alongV <= 0) return 3
  if (nU.x === -nV.x && nU.y === -nV.y)
    return canRunStraight(isVerticalSide(sU), U, V) ? 0 : 2
  if (nU.x === nV.x && nU.y === nV.y) return 2
  return 1
}

const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

const sideMidpoint = (side: Position, rect: Rect): IPoint => {
  switch (side) {
    case Position.Top:
      return { x: rect.x + rect.width / 2, y: rect.y }
    case Position.Bottom:
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height }
    case Position.Left:
      return { x: rect.x, y: rect.y + rect.height / 2 }
    default:
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
  }
}

const segCutsRect = (a: IPoint, b: IPoint, r: Rect): boolean => {
  const lo = { x: r.x + 1, y: r.y + 1 }
  const hi = { x: r.x + r.width - 1, y: r.y + r.height - 1 }
  return (
    Math.min(a.x, b.x) < hi.x &&
    Math.max(a.x, b.x) > lo.x &&
    Math.min(a.y, b.y) < hi.y &&
    Math.max(a.y, b.y) > lo.y
  )
}

export const routeCutsAny = (
  route: readonly IPoint[],
  rects: readonly Rect[]
): number => {
  let n = 0
  for (const r of rects)
    for (let i = 0; i < route.length - 1; i++)
      if (segCutsRect(route[i], route[i + 1], r)) {
        n++
        break
      }
  return n
}

const pickLane = (
  anchor: number,
  betweenOther: number,
  dir: -1 | 0 | 1,
  edgeOf: (r: Rect) => [number, number],
  makeRoute: (lane: number) => IPoint[],
  rects: readonly Rect[]
): number => {
  const feasible = (c: number): boolean =>
    dir === 0
      ? c >= Math.min(anchor, betweenOther) &&
        c <= Math.max(anchor, betweenOther)
      : dir > 0
        ? c >= anchor
        : c <= anchor
  const cands = new Set<number>([anchor])
  if (dir === 0) cands.add((anchor + betweenOther) / 2)
  for (const r of rects)
    for (const e of edgeOf(r)) if (feasible(e)) cands.add(e)
  let best = anchor
  let bestHits = Infinity
  let bestDist = Infinity
  for (const c of [...cands].sort((p, q) => p - q)) {
    const hits = routeCutsAny(makeRoute(c), rects)
    const dist = Math.abs(c - anchor)
    if (hits < bestHits || (hits === bestHits && dist < bestDist)) {
      best = c
      bestHits = hits
      bestDist = dist
    }
  }
  return best
}

const laneConstraint = (
  nU: number,
  nV: number,
  aCoord: number,
  bCoord: number
): { anchor: number; other: number; dir: -1 | 0 | 1 } => {
  if (nU < 0 && nV < 0)
    return {
      anchor: Math.min(aCoord, bCoord),
      other: Math.max(aCoord, bCoord),
      dir: -1,
    }
  if (nU > 0 && nV > 0)
    return {
      anchor: Math.max(aCoord, bCoord),
      other: Math.min(aCoord, bCoord),
      dir: 1,
    }
  return { anchor: aCoord, other: bCoord, dir: 0 }
}

export const approxRoute = (
  sU: Position,
  sV: Position,
  U: Rect,
  V: Rect,
  obstacles: readonly Rect[] = []
): IPoint[] => {
  const a = sideMidpoint(sU, U)
  const b = sideMidpoint(sV, V)
  const uVert = isVerticalSide(sU)
  const vVert = isVerticalSide(sV)
  if (uVert !== vVert)
    return uVert ? [a, { x: b.x, y: a.y }, b] : [a, { x: a.x, y: b.y }, b]
  if (uVert) {
    if (a.y === b.y) return [a, b]
    const { anchor, other, dir } = laneConstraint(
      OUTWARD_NORMAL[sU].x,
      OUTWARD_NORMAL[sV].x,
      a.x,
      b.x
    )
    const laneX = pickLane(
      anchor,
      other,
      dir,
      (r) => [r.x - CORNER_CLEARANCE_PX, r.x + r.width + CORNER_CLEARANCE_PX],
      (x) => [a, { x, y: a.y }, { x, y: b.y }, b],
      obstacles
    )
    return [a, { x: laneX, y: a.y }, { x: laneX, y: b.y }, b]
  }
  if (a.x === b.x) return [a, b]
  const { anchor, other, dir } = laneConstraint(
    OUTWARD_NORMAL[sU].y,
    OUTWARD_NORMAL[sV].y,
    a.y,
    b.y
  )
  const laneY = pickLane(
    anchor,
    other,
    dir,
    (r) => [r.y - CORNER_CLEARANCE_PX, r.y + r.height + CORNER_CLEARANCE_PX],
    (y) => [a, { x: a.x, y }, { x: b.x, y }, b],
    obstacles
  )
  return [a, { x: a.x, y: laneY }, { x: b.x, y: laneY }, b]
}

export type SideEdge = {
  edgeId: string
  sourceNodeId: string
  targetNodeId: string
  sourceRect: Rect
  targetRect: Rect
  sourceBand: boolean
  targetBand: boolean
  sourceFixedSide?: Position
  targetFixedSide?: Position
}

export type ReservedSideEnd = {
  nodeId: string
  partnerNodeId: string
  side: Position
}

export const assignSides = (
  edges: readonly SideEdge[],
  nodeRects: ReadonlyMap<string, Rect> = new Map(),
  fourCenterNodes: ReadonlySet<string> = new Set(),
  reservedEnds: readonly ReservedSideEnd[] = [],
  reservedRoutes: readonly IPoint[][] = []
): Map<string, Position> => {
  const occ = new Map<string, Set<string>>()
  const occAdd = (node: string, side: Position, partner: string): void => {
    const key = `${node}|${side}`
    const set = occ.get(key)
    if (set) set.add(partner)
    else occ.set(key, new Set([partner]))
  }
  const occOthers = (node: string, side: Position, exclude: string): number => {
    const set = occ.get(`${node}|${side}`)
    if (!set) return 0
    return set.has(exclude) ? set.size - 1 : set.size
  }
  for (const end of reservedEnds)
    occAdd(end.nodeId, end.side, end.partnerNodeId)
  const singleSlotOcc = (
    node: string,
    side: Position,
    exclude: string
  ): number => (fourCenterNodes.has(node) ? occOthers(node, side, exclude) : 0)

  const hasStraight = (e: SideEdge): boolean =>
    ALL_SIDES.some((sU) =>
      ALL_SIDES.some(
        (sV) => combinedBends(sU, sV, e.sourceRect, e.targetRect) === 0
      )
    )
  const ordered = [...edges].sort((a, b) => {
    const sa = hasStraight(a) ? 0 : 1
    const sb = hasStraight(b) ? 0 : 1
    if (sa !== sb) return sa - sb
    const ak: Array<number | string> = [
      a.sourceRect.x,
      a.sourceRect.y,
      a.sourceRect.width,
      a.sourceRect.height,
      a.targetRect.x,
      a.targetRect.y,
      a.targetRect.width,
      a.targetRect.height,
      a.sourceNodeId,
      a.targetNodeId,
      a.edgeId,
    ]
    const bk: Array<number | string> = [
      b.sourceRect.x,
      b.sourceRect.y,
      b.sourceRect.width,
      b.sourceRect.height,
      b.targetRect.x,
      b.targetRect.y,
      b.targetRect.width,
      b.targetRect.height,
      b.sourceNodeId,
      b.targetNodeId,
      b.edgeId,
    ]
    for (let i = 0; i < ak.length; i++) {
      if (ak[i] === bk[i]) continue
      return ak[i] < bk[i] ? -1 : 1
    }
    return 0
  })

  const placed: IPoint[][] = reservedRoutes.map((route) => [...route])
  const routeConflictBendEquiv = (route: IPoint[]): number => {
    let crossings = 0
    let nonCrossingCost = 0
    placed.forEach((neighbor, index) => {
      const conflict = polylineConflictCost(
        route,
        [neighbor],
        ROUTING_COST.parallelCrowdingClearanceInGridCells * GRID
      )
      crossings += conflict.crossings
      if (index < reservedRoutes.length)
        nonCrossingCost +=
          conflict.overlapPx * ROUTING_COST.overlapPerPx +
          conflict.crowdingPx * ROUTING_COST.crowdingPerPx
    })
    return (
      CROSSING_BEND_EQUIV * crossings +
      nonCrossingCost / (ROUTING_COST.bendInGridCells * GRID)
    )
  }

  const nodesCrossed = (e: SideEdge, route: readonly IPoint[]): number => {
    let n = 0
    for (const [id, r] of nodeRects) {
      if (id === e.sourceNodeId || id === e.targetNodeId) continue
      const lo = { x: r.x + 1, y: r.y + 1 }
      const hi = { x: r.x + r.width - 1, y: r.y + r.height - 1 }
      for (let i = 0; i < route.length - 1; i++) {
        const a = route[i]
        const b = route[i + 1]
        const segLoX = Math.min(a.x, b.x)
        const segHiX = Math.max(a.x, b.x)
        const segLoY = Math.min(a.y, b.y)
        const segHiY = Math.max(a.y, b.y)
        if (segLoX < hi.x && segHiX > lo.x && segLoY < hi.y && segHiY > lo.y) {
          n++
          break
        }
      }
    }
    return n
  }

  const result = new Map<string, Position>()
  for (const e of ordered) {
    const { sourceRect: U, targetRect: V } = e
    const dx = centerOf(V).x - centerOf(U).x
    const dy = centerOf(V).y - centerOf(U).y
    const aimU = (s: Position): number =>
      Math.abs(OUTWARD_NORMAL[s].x * dx + OUTWARD_NORMAL[s].y * dy)
    const aimV = (s: Position): number =>
      Math.abs(OUTWARD_NORMAL[s].x * -dx + OUTWARD_NORMAL[s].y * -dy)

    const obstacles: Rect[] = []
    for (const [id, r] of nodeRects)
      if (id !== e.sourceNodeId && id !== e.targetNodeId) obstacles.push(r)

    if (e.sourceBand && e.targetBand) {
      let best: { sU: Position; sV: Position } | null = null
      let bestKey: number[] | null = null
      for (const sU of ALL_SIDES)
        for (const sV of ALL_SIDES) {
          const route = approxRoute(sU, sV, U, V, obstacles)
          const key = [
            nodesCrossed(e, route),
            singleSlotOcc(e.sourceNodeId, sU, e.targetNodeId) +
              singleSlotOcc(e.targetNodeId, sV, e.sourceNodeId),
            combinedBends(sU, sV, U, V) + routeConflictBendEquiv(route),
            -(aimU(sU) + aimV(sV)),
            occOthers(e.sourceNodeId, sU, e.targetNodeId) +
              occOthers(e.targetNodeId, sV, e.sourceNodeId),
            -aimU(sU),
            SIDE_ORDER[sU] + SIDE_ORDER[sV],
            SIDE_ORDER[sU],
          ]
          if (!bestKey || lexLess(key, bestKey)) {
            best = { sU, sV }
            bestKey = key
          }
        }
      result.set(endKey(e.edgeId, "source"), best!.sU)
      result.set(endKey(e.edgeId, "target"), best!.sV)

      occAdd(e.sourceNodeId, best!.sU, e.targetNodeId)
      occAdd(e.targetNodeId, best!.sV, e.sourceNodeId)
      placed.push(approxRoute(best!.sU, best!.sV, U, V, obstacles))
    } else if (e.sourceBand || e.targetBand) {
      const node = e.sourceBand ? e.sourceNodeId : e.targetNodeId
      const otherNode = e.sourceBand ? e.targetNodeId : e.sourceNodeId
      const aim = e.sourceBand ? aimU : aimV
      let best: Position | null = null
      let bestKey: number[] | null = null
      for (const s of ALL_SIDES) {
        const otherFixedSide = e.sourceBand
          ? e.targetFixedSide
          : e.sourceFixedSide
        let minB = Infinity
        if (otherFixedSide !== undefined) {
          const route = e.sourceBand
            ? approxRoute(s, otherFixedSide, U, V, obstacles)
            : approxRoute(otherFixedSide, s, U, V, obstacles)
          minB =
            (e.sourceBand
              ? combinedBends(s, otherFixedSide, U, V)
              : combinedBends(otherFixedSide, s, U, V)) +
            routeConflictBendEquiv(route)
        } else {
          for (const o of ALL_SIDES) {
            const route = e.sourceBand
              ? approxRoute(s, o, U, V, obstacles)
              : approxRoute(o, s, U, V, obstacles)
            const b =
              (e.sourceBand
                ? combinedBends(s, o, U, V)
                : combinedBends(o, s, U, V)) + routeConflictBendEquiv(route)
            if (b < minB) minB = b
          }
        }
        const key = [
          singleSlotOcc(node, s, otherNode),
          minB,
          -aim(s),
          occOthers(node, s, otherNode),
          SIDE_ORDER[s],
        ]
        if (!bestKey || lexLess(key, bestKey)) {
          best = s
          bestKey = key
        }
      }
      result.set(endKey(e.edgeId, e.sourceBand ? "source" : "target"), best!)

      occAdd(node, best!, otherNode)
    }
  }
  return result
}

export type SideMember = {
  edgeId: string
  end: "source" | "target"
  dx: number
  dy: number
}

export const alongSideKey = (
  side: Position,
  dx: number,
  dy: number
): number => {
  let X: number
  let Y: number
  switch (side) {
    case Position.Top:
      X = -dy
      Y = dx
      break
    case Position.Bottom:
      X = dy
      Y = dx
      break
    case Position.Left:
      X = -dx
      Y = dy
      break
    default:
      X = dx
      Y = dy
      break
  }
  const s = Math.abs(X) + Math.abs(Y)
  if (s === 0) return 0
  const f = Y / s
  if (X >= 0) return f
  return Y >= 0 ? 2 - f : -2 - f
}

const REACH_ORDER_SCALE_PX = 300

export const crossingOrderKey = (
  side: Position,
  dx: number,
  dy: number,
  tangentialHalfExtent: number
): number => {
  let X: number
  let Y: number
  switch (side) {
    case Position.Top:
      X = -dy
      Y = dx
      break
    case Position.Bottom:
      X = dy
      Y = dx
      break
    case Position.Left:
      X = -dx
      Y = dy
      break
    default:
      X = dx
      Y = dy
      break
  }
  const H = Math.max(tangentialHalfExtent, 1)
  const reach = Math.abs(X)
  const r = reach / (reach + REACH_ORDER_SCALE_PX)
  if (Y >= H) return 2 - r
  if (Y <= -H) return -2 + r
  return Y / H
}

export const orderSideMembers = (
  side: Position,
  members: readonly SideMember[]
): SideMember[] => {
  const keyed = members.map((m) => ({ m, k: alongSideKey(side, m.dx, m.dy) }))
  keyed.sort((a, b) =>
    a.k !== b.k
      ? a.k < b.k
        ? -1
        : 1
      : a.m.edgeId < b.m.edgeId
        ? -1
        : a.m.edgeId > b.m.edgeId
          ? 1
          : 0
  )
  return keyed.map((x) => x.m)
}

export type EndRef = {
  edgeId: string
  end: "source" | "target"
  nodeId: string
  rect: Rect
  side: Position
  partnerCenter: IPoint
  partnerNodeId: string
  partnerRect: Rect
  partnerSide?: Position
  immutableRatio?: number
  fourCenter?: boolean
}

const clockwiseSign = (side: Position): number =>
  side === Position.Top || side === Position.Right ? 1 : -1

const bundleNeedsMirror = (side: Position, partnerSide: Position): boolean =>
  clockwiseSign(side) === clockwiseSign(partnerSide)

export type AssignedPort = {
  side: Position
  ratio: number
}

export const endKey = (edgeId: string, end: "source" | "target"): string =>
  `${edgeId}|${end}`

const sharedStraightBand = (
  side: Position,
  rect: Rect,
  partner: Rect
): { lo: number; hi: number; myLo: number; myAxis: number } | null => {
  if (bendsForSide(side, rect, partner) !== 0) return null
  const tangentialX = !isVerticalSide(side)
  const myLo = tangentialX ? rect.x : rect.y
  const myAxis = tangentialX ? rect.width : rect.height
  const pLo = tangentialX ? partner.x : partner.y
  const pAxis = tangentialX ? partner.width : partner.height
  const overlapLo = Math.max(myLo, pLo)
  const overlapHi = Math.min(myLo + myAxis, pLo + pAxis)
  if (!canRunStraight(!tangentialX, rect, partner)) return null
  const margin = cornerMargin(myAxis, pAxis)
  return { lo: overlapLo + margin, hi: overlapHi - margin, myLo, myAxis }
}

const spreadCoords = (
  lo: number,
  hi: number,
  count: number,
  minGap: number
): number[] => {
  if (count <= 0) return []
  const centre = (lo + hi) / 2
  if (count === 1) return [centre]
  const balanced = balancedPortOffsets(count, hi - lo, GRID).map(
    (offset) => lo + offset
  )
  if (balanced[1] - balanced[0] >= minGap) return balanced
  const gap = minGap
  return Array.from(
    { length: count },
    (_, i) => centre + ((2 * i - (count - 1)) * gap) / 2
  )
}

const spreadCoordsWithinBounds = (
  lo: number,
  hi: number,
  bounds: readonly { lo: number; hi: number }[],
  minGap: number
): number[] => {
  if (bounds.length === 0) return []
  const ideal = spreadCoords(lo, hi, bounds.length, minGap)
  if (bounds.length === 1) return [clamp(ideal[0], bounds[0].lo, bounds[0].hi)]

  let feasibleGap = ideal[1] - ideal[0]
  for (let later = 1; later < bounds.length; later++)
    for (let earlier = 0; earlier < later; earlier++)
      feasibleGap = Math.min(
        feasibleGap,
        (bounds[later].hi - bounds[earlier].lo) / (later - earlier)
      )
  feasibleGap = Math.max(0, feasibleGap)

  const result = ideal.map((value, index) =>
    clamp(value, bounds[index].lo, bounds[index].hi)
  )
  for (let pass = 0; pass < bounds.length; pass++) {
    for (let i = 1; i < result.length; i++)
      result[i] = clamp(
        Math.max(result[i], result[i - 1] + feasibleGap),
        bounds[i].lo,
        bounds[i].hi
      )
    for (let i = result.length - 2; i >= 0; i--)
      result[i] = clamp(
        Math.min(result[i], result[i + 1] - feasibleGap),
        bounds[i].lo,
        bounds[i].hi
      )
  }
  return result
}

export const assignPorts = (
  ends: readonly EndRef[],
  pitchPx: number = PORT_PITCH_PX
): Map<string, AssignedPort> => {
  const groups = new Map<string, EndRef[]>()
  for (const e of ends) {
    const key = `${e.nodeId}|${e.side}`
    const g = groups.get(key)
    if (g) g.push(e)
    else groups.set(key, [e])
  }
  const result = new Map<string, AssignedPort>()
  for (const [, group] of groups) {
    const side = group[0].side
    const rect = group[0].rect
    const nodeId = group[0].nodeId
    if (group[0].fourCenter) {
      for (const e of group)
        result.set(endKey(e.edgeId, e.end), {
          side,
          ratio: e.immutableRatio ?? 0.5,
        })
      continue
    }

    const axis = sideAxisLength(side, rect)
    if (axis <= 0) {
      for (const e of group)
        result.set(endKey(e.edgeId, e.end), {
          side,
          ratio: e.immutableRatio ?? 0.5,
        })
      continue
    }
    const tangentialX = !isVerticalSide(side)
    const myLo = tangentialX ? rect.x : rect.y
    const margin = Math.min(CORNER_CLEARANCE_PX, axis * 0.3)

    type Seat = {
      edgeId: string
      end: "source" | "target"
      coord: number
      fixed: boolean
      immutable: boolean
      minCoord: number
      maxCoord: number
      partnerX: number
      partnerY: number
      partnerWidth: number
      partnerHeight: number
      partnerNodeId: string
      rot: number
    }
    const seats: Seat[] = []
    const tangentialHalfExtent = sideAxisLength(side, rect) / 2
    const rotOf = (e: EndRef): number => {
      const c = centerOf(e.rect)
      return crossingOrderKey(
        side,
        e.partnerCenter.x - c.x,
        e.partnerCenter.y - c.y,
        tangentialHalfExtent
      )
    }
    const byPartner = new Map<string, EndRef[]>()
    for (const e of group) {
      const g = byPartner.get(e.partnerNodeId)
      if (g) g.push(e)
      else byPartner.set(e.partnerNodeId, [e])
    }
    const lMembers: { e: EndRef; rot: number; rank: number }[] = []
    for (const [partnerId, members] of byPartner) {
      const band = sharedStraightBand(side, rect, members[0].partnerRect)
      if (band) {
        const ordered = [...members].sort((a, b) =>
          a.edgeId < b.edgeId ? -1 : a.edgeId > b.edgeId ? 1 : 0
        )
        const coords = spreadCoords(band.lo, band.hi, ordered.length, pitchPx)
        ordered.forEach((e, i) => {
          const immutableCoord =
            e.immutableRatio === undefined
              ? null
              : myLo + e.immutableRatio * axis
          seats.push({
            edgeId: e.edgeId,
            end: e.end,
            coord: immutableCoord ?? coords[i],
            fixed: true,
            immutable: immutableCoord !== null,
            minCoord: immutableCoord ?? band.lo,
            maxCoord: immutableCoord ?? band.hi,
            partnerX: e.partnerRect.x,
            partnerY: e.partnerRect.y,
            partnerWidth: e.partnerRect.width,
            partnerHeight: e.partnerRect.height,
            partnerNodeId: e.partnerNodeId,
            rot: rotOf(e),
          })
        })
        continue
      }
      const sm: SideMember[] = members.map((e) => ({
        edgeId: e.edgeId,
        end: e.end,
        dx: e.partnerCenter.x - centerOf(e.rect).x,
        dy: e.partnerCenter.y - centerOf(e.rect).y,
      }))
      let ordered = orderSideMembers(side, sm)
      const partnerSide = members[0].partnerSide
      if (
        members.length > 1 &&
        nodeId > partnerId &&
        partnerSide !== undefined &&
        bundleNeedsMirror(side, partnerSide)
      )
        ordered = [...ordered].reverse()
      const byKey = new Map(members.map((e) => [endKey(e.edgeId, e.end), e]))
      ordered.forEach((m, i) => {
        const e = byKey.get(endKey(m.edgeId, m.end))!
        lMembers.push({ e, rot: rotOf(e), rank: i })
      })
    }

    lMembers.sort(
      (a, b) =>
        a.rot - b.rot ||
        a.rank - b.rank ||
        a.e.partnerRect.x - b.e.partnerRect.x ||
        a.e.partnerRect.y - b.e.partnerRect.y ||
        a.e.partnerRect.width - b.e.partnerRect.width ||
        a.e.partnerRect.height - b.e.partnerRect.height ||
        cmpStr(a.e.partnerNodeId, b.e.partnerNodeId) ||
        cmpStr(a.e.edgeId, b.e.edgeId) ||
        cmpStr(a.e.end, b.e.end)
    )
    const lCoords = spreadCoords(myLo, myLo + axis, lMembers.length, pitchPx)
    lMembers.forEach(({ e, rot }, i) => {
      const immutableCoord =
        e.immutableRatio === undefined ? null : myLo + e.immutableRatio * axis
      seats.push({
        edgeId: e.edgeId,
        end: e.end,
        coord: immutableCoord ?? lCoords[i],
        fixed: immutableCoord !== null,
        immutable: immutableCoord !== null,
        minCoord: immutableCoord ?? myLo + margin,
        maxCoord: immutableCoord ?? myLo + axis - margin,
        partnerX: e.partnerRect.x,
        partnerY: e.partnerRect.y,
        partnerWidth: e.partnerRect.width,
        partnerHeight: e.partnerRect.height,
        partnerNodeId: e.partnerNodeId,
        rot,
      })
    })

    seats.sort(
      (a, b) =>
        a.rot - b.rot ||
        a.coord - b.coord ||
        a.partnerX - b.partnerX ||
        a.partnerY - b.partnerY ||
        a.partnerWidth - b.partnerWidth ||
        a.partnerHeight - b.partnerHeight ||
        cmpStr(a.partnerNodeId, b.partnerNodeId) ||
        cmpStr(a.edgeId, b.edgeId) ||
        cmpStr(a.end, b.end)
    )
    const lo = myLo + margin
    const hi = myLo + axis - margin
    const rebalancesStraightPartners =
      byPartner.size > 1 &&
      seats.length > 1 &&
      seats.every((seat) => seat.fixed)
    if (rebalancesStraightPartners) {
      const centred = spreadCoordsWithinBounds(
        lo,
        hi,
        seats.map((seat) => ({ lo: seat.minCoord, hi: seat.maxCoord })),
        pitchPx
      )
      seats.forEach((seat, index) => {
        seat.coord = centred[index]
      })
    }
    let unconstrainedGap =
      seats.length > 1 ? Math.min(pitchPx, (hi - lo) / (seats.length - 1)) : 0
    const immutableSeats = seats
      .map((seat, index) => ({ seat, index }))
      .filter(({ seat }) => seat.immutable)
    for (const { seat, index } of immutableSeats) {
      if (index > 0)
        unconstrainedGap = Math.min(
          unconstrainedGap,
          Math.max(0, (seat.coord - lo) / index)
        )
      const after = seats.length - 1 - index
      if (after > 0)
        unconstrainedGap = Math.min(
          unconstrainedGap,
          Math.max(0, (hi - seat.coord) / after)
        )
    }
    for (let later = 1; later < immutableSeats.length; later++)
      for (let earlier = 0; earlier < later; earlier++) {
        const left = immutableSeats[earlier]
        const right = immutableSeats[later]
        unconstrainedGap = Math.min(
          unconstrainedGap,
          Math.max(
            0,
            (right.seat.coord - left.seat.coord) / (right.index - left.index)
          )
        )
      }
    const gap = rebalancesStraightPartners
      ? Math.max(
          0,
          Math.min(
            unconstrainedGap,
            ...seats
              .slice(1)
              .map((seat, index) => seat.coord - seats[index].coord)
          )
        )
      : unconstrainedGap
    const pos = seats.map((s) =>
      s.immutable ? s.coord : clamp(s.coord, lo, hi)
    )
    for (let i = 1; i < pos.length; i++)
      if (!seats[i].fixed && pos[i] < pos[i - 1] + gap)
        pos[i] = pos[i - 1] + gap
    for (let i = pos.length - 2; i >= 0; i--)
      if (!seats[i].fixed && pos[i] > pos[i + 1] - gap)
        pos[i] = pos[i + 1] - gap
    const stillCrowded = pos.some((p, i) => i > 0 && p < pos[i - 1] + gap)
    if (stillCrowded) {
      for (let pass = 0; pass < seats.length; pass++) {
        for (let i = 1; i < pos.length; i++)
          if (!seats[i].immutable && pos[i] < pos[i - 1] + gap)
            pos[i] = Math.min(hi, pos[i - 1] + gap)
        for (let i = pos.length - 2; i >= 0; i--)
          if (!seats[i].immutable && pos[i] > pos[i + 1] - gap)
            pos[i] = Math.max(lo, pos[i + 1] - gap)
      }
    }
    seats.forEach((s, i) =>
      result.set(endKey(s.edgeId, s.end), {
        side,
        ratio: s.immutable
          ? group.find((end) => end.edgeId === s.edgeId && end.end === s.end)!
              .immutableRatio!
          : (clamp(pos[i], lo, hi) - myLo) / axis,
      })
    )
  }
  return result
}
