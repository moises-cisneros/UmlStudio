import { Position, type Rect } from "@xyflow/system"
import { CANVAS, EDGES } from "@/utils/geometry/routingConstants"
import type { IPoint } from "@/edges/Connection"
import { getEdgeAnchorPoint } from "@/utils/connectionModes"
import { getNodeConnectionRect } from "@/utils/geometry/nodeGeometry"
import { type FreeformEdgeAnchor } from "@/utils/edgeUtils"
import { routeStepEdge } from "@/utils/geometry/edgeRoute"
import { clamp, lexLess } from "@/utils/geometry/scalar"
import {
  routeAroundObstaclesBetweenCandidates,
  routeConflictScore,
  type RouteEndpointCandidate,
} from "@/utils/geometry/orthogonalRouter"
import type { ObstacleRect } from "@/utils/geometry/obstacles"
import {
  endpointPlacementCost,
  endpointPreferenceCost,
  polylineConflictCost,
  ROUTING_COST,
  weightedRoutingCost,
} from "@/utils/geometry/routingCost"
import type { ResolvedEdgeEndpoints } from "@/utils/geometry/edgeGeometrySolver"
import {
  OPPOSITE_SIDE,
  OUTWARD_NORMAL,
  SIDE_ORDER,
  centerOf,
  facingSide,
  isVerticalSide,
  sideAxisLength,
  canRunStraight,
  cornerMargin,
} from "@/utils/geometry/rectSides"

const GRID = CANVAS.SNAP_TO_GRID_PX
const NO_OBSTACLES: readonly ObstacleRect[] = []
const NO_NEIGHBORS: readonly IPoint[][] = []

type AnchorChoice = {
  anchor: FreeformEdgeAnchor
  point: IPoint
  position: Position
}

const candidateSides = (rect: Rect, toward: IPoint): Position[] => {
  const primary = facingSide(rect, toward)
  const perpendicular = isVerticalSide(primary)
    ? [Position.Top, Position.Bottom]
    : [Position.Left, Position.Right]
  return [primary, ...perpendicular, OPPOSITE_SIDE[primary]]
}

const ratioAt = (alongTargetPx: number, axisLength: number): number => {
  if (axisLength <= 0) return 0.5
  const margin = Math.min(2 * GRID, axisLength * 0.3)
  let offset = clamp(alongTargetPx, margin, axisLength - margin)
  offset = Math.round(offset / GRID) * GRID
  return clamp(offset, margin, axisLength - margin) / axisLength
}

const alignedRatio = (side: Position, rect: Rect, toward: IPoint): number =>
  ratioAt(
    isVerticalSide(side) ? toward.y - rect.y : toward.x - rect.x,
    sideAxisLength(side, rect)
  )

const toAnchorChoice = (
  nodeType: string | undefined,
  rect: Rect,
  anchor: FreeformEdgeAnchor
): AnchorChoice => {
  const { point, position } = getEdgeAnchorPoint(nodeType, rect, anchor)
  return { anchor, point, position }
}

const generateCandidates = (
  nodeType: string | undefined,
  rect: Rect,
  toward: IPoint
): AnchorChoice[] => {
  const connectionRect = getNodeConnectionRect(nodeType, rect)
  const seen = new Set<string>()
  const choices: AnchorChoice[] = []
  const pushRatio = (side: Position, ratio: number) => {
    const key = `${side}:${Math.round(ratio * 1000)}`
    if (seen.has(key)) return
    seen.add(key)
    choices.push(toAnchorChoice(nodeType, rect, { side, ratio }))
  }
  for (const side of candidateSides(connectionRect, toward)) {
    pushRatio(side, alignedRatio(side, connectionRect, toward))
    pushRatio(
      side,
      ratioAt(
        sideAxisLength(side, connectionRect) / 2,
        sideAxisLength(side, connectionRect)
      )
    )
  }
  return choices
}

const straightAlignedPair = (
  sourceRect: Rect,
  targetRect: Rect,
  sourceType: string | undefined,
  targetType: string | undefined
): { source: AnchorChoice; target: AnchorChoice } | null => {
  const sourceConnectionRect = getNodeConnectionRect(sourceType, sourceRect)
  const targetConnectionRect = getNodeConnectionRect(targetType, targetRect)
  const sSide = facingSide(sourceConnectionRect, centerOf(targetConnectionRect))
  const tSide = facingSide(targetConnectionRect, centerOf(sourceConnectionRect))
  if (OPPOSITE_SIDE[sSide] !== tSide) return null

  const vertical = isVerticalSide(sSide)
  const sLo = vertical ? sourceConnectionRect.y : sourceConnectionRect.x
  const sHi = vertical
    ? sourceConnectionRect.y + sourceConnectionRect.height
    : sourceConnectionRect.x + sourceConnectionRect.width
  const tLo = vertical ? targetConnectionRect.y : targetConnectionRect.x
  const tHi = vertical
    ? targetConnectionRect.y + targetConnectionRect.height
    : targetConnectionRect.x + targetConnectionRect.width
  const sAxis = vertical
    ? sourceConnectionRect.height
    : sourceConnectionRect.width
  const tAxis = vertical
    ? targetConnectionRect.height
    : targetConnectionRect.width
  if (!canRunStraight(vertical, sourceConnectionRect, targetConnectionRect))
    return null
  const margin = cornerMargin(sAxis, tAxis)
  const lo = Math.max(sLo, tLo) + margin
  const hi = Math.min(sHi, tHi) - margin

  const midpointOfCenters = ((sLo + sHi) / 2 + (tLo + tHi) / 2) / 2
  const snapped = Math.round(clamp(midpointOfCenters, lo, hi) / GRID) * GRID
  const v = clamp(snapped, lo, hi)
  return {
    source: toAnchorChoice(sourceType, sourceRect, {
      side: sSide,
      ratio: (v - sLo) / sAxis,
    }),
    target: toAnchorChoice(targetType, targetRect, {
      side: tSide,
      ratio: (v - tLo) / tAxis,
    }),
  }
}

const alignedToPinned = (
  freeType: string | undefined,
  freeRect: Rect,
  pinnedPoint: IPoint,
  pinnedSide: Position
): AnchorChoice | null => {
  const connectionRect = getNodeConnectionRect(freeType, freeRect)
  const freeSide = OPPOSITE_SIDE[pinnedSide]
  const vertical = isVerticalSide(freeSide)
  const axisLen = sideAxisLength(freeSide, connectionRect)
  if (axisLen <= 0) return null
  const lo = vertical ? connectionRect.y : connectionRect.x
  const coord = vertical ? pinnedPoint.y : pinnedPoint.x
  const margin = Math.min(2 * GRID, axisLen * 0.3)
  if (coord < lo + margin || coord > lo + axisLen - margin) return null
  return toAnchorChoice(freeType, freeRect, {
    side: freeSide,
    ratio: (coord - lo) / axisLen,
  })
}

const routeLength = (route: readonly IPoint[]): number => {
  let total = 0
  for (let i = 1; i < route.length; i++) {
    total += Math.abs(route[i].x - route[i - 1].x)
    total += Math.abs(route[i].y - route[i - 1].y)
  }
  return total
}

const segToRectDist = (a: IPoint, b: IPoint, r: Rect): number => {
  const dx = Math.max(
    0,
    Math.min(a.x, b.x) - (r.x + r.width),
    r.x - Math.max(a.x, b.x)
  )
  const dy = Math.max(
    0,
    Math.min(a.y, b.y) - (r.y + r.height),
    r.y - Math.max(a.y, b.y)
  )
  return dx + dy
}

const hugPenaltyPx = (
  route: readonly IPoint[],
  sourceRect: Rect,
  targetRect: Rect
): number => {
  let total = 0
  const lastSeg = route.length - 2
  for (let i = 0; i <= lastSeg; i++) {
    const a = route[i]
    const b = route[i + 1]
    const toSource = i === 0 ? Infinity : segToRectDist(a, b, sourceRect)
    const toTarget = i === lastSeg ? Infinity : segToRectDist(a, b, targetRect)
    const clearance = Math.min(toSource, toTarget)
    if (clearance < EDGES.MIN_NODE_CLEARANCE_PX)
      total += EDGES.MIN_NODE_CLEARANCE_PX - clearance
  }
  return total
}

const routeThroughNodes = (
  route: readonly IPoint[],
  rects: readonly Rect[]
): number => {
  let n = 0
  for (const r of rects) {
    const loX = r.x + 1
    const hiX = r.x + r.width - 1
    const loY = r.y + 1
    const hiY = r.y + r.height - 1
    for (let i = 0; i < route.length - 1; i++) {
      const a = route[i]
      const b = route[i + 1]
      if (
        Math.min(a.x, b.x) < hiX &&
        Math.max(a.x, b.x) > loX &&
        Math.min(a.y, b.y) < hiY &&
        Math.max(a.y, b.y) > loY
      ) {
        n++
        break
      }
    }
  }
  return n
}

const thirdPartyGrazePx = (
  route: readonly IPoint[],
  rects: readonly Rect[]
): number => {
  if (rects.length === 0) return 0
  let total = 0
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i]
    const b = route[i + 1]
    for (const rect of rects) {
      const dist = segToRectDist(a, b, rect)
      if (dist < EDGES.NODE_CLEARANCE_PX)
        total += EDGES.NODE_CLEARANCE_PX - dist
    }
  }
  return total
}

const offFacingCount = (
  source: AnchorChoice,
  target: AnchorChoice,
  sourceFacing: Position | null,
  targetFacing: Position | null
): number =>
  (sourceFacing !== null && source.position !== sourceFacing ? 1 : 0) +
  (targetFacing !== null && target.position !== targetFacing ? 1 : 0)

const sideAim = (side: Position, from: Rect, to: Rect): number => {
  const a = centerOf(from)
  const b = centerOf(to)
  const n = OUTWARD_NORMAL[side]
  return n.x * (b.x - a.x) + n.y * (b.y - a.y)
}

const scoreKey = (
  route: readonly IPoint[],
  source: AnchorChoice,
  target: AnchorChoice,
  sourceRect: Rect,
  targetRect: Rect,
  sourceFacing: Position | null,
  targetFacing: Position | null,
  thirdParty: readonly Rect[],
  committed: readonly IPoint[][],
  sourcePreferred?: FreeformEdgeAnchor,
  targetPreferred?: FreeformEdgeAnchor
): number[] => {
  const bends = Math.max(0, route.length - 2)
  const ds = Math.round(1000 * Math.abs(source.anchor.ratio - 0.5))
  const dt = Math.round(1000 * Math.abs(target.anchor.ratio - 0.5))
  const placement =
    endpointPlacementCost(
      source.anchor,
      sideAxisLength(source.anchor.side, sourceRect),
      GRID
    ) +
    endpointPlacementCost(
      target.anchor,
      sideAxisLength(target.anchor.side, targetRect),
      GRID
    )
  const preference =
    endpointPreferenceCost(
      source.anchor,
      sourcePreferred,
      sideAxisLength(source.anchor.side, sourceRect),
      GRID
    ) +
    endpointPreferenceCost(
      target.anchor,
      targetPreferred,
      sideAxisLength(target.anchor.side, targetRect),
      GRID
    )
  const hug = Math.round(hugPenaltyPx(route, sourceRect, targetRect) / GRID)
  const graze =
    bends === 0 ? Math.round(thirdPartyGrazePx(route, thirdParty) / GRID) : 0
  const through = routeThroughNodes(route, thirdParty)
  const conflict =
    committed.length === 0
      ? { crossings: 0, proximityPx: 0 }
      : routeConflictScore(route, committed)
  const generalConflict = polylineConflictCost(
    route,
    committed,
    ROUTING_COST.parallelCrowdingClearanceInGridCells * GRID
  )
  const lengthPx = routeLength(route)
  const weightedCost =
    weightedRoutingCost(
      {
        lengthPx,
        bends,
        crossings: conflict.crossings,
        overlapPx: generalConflict.overlapPx,
        crowdingPx: generalConflict.crowdingPx,
      },
      GRID
    ) +
    placement +
    preference +
    hug * ROUTING_COST.huggingPerPx +
    graze * ROUTING_COST.huggingPerPx +
    through * ROUTING_COST.edgeCrossing
  const length = Math.round(lengthPx / GRID)
  return [
    weightedCost,
    offFacingCount(source, target, sourceFacing, targetFacing),
    length,
    Math.max(ds, dt),
    -(
      sideAim(source.position, sourceRect, targetRect) +
      sideAim(target.position, targetRect, sourceRect)
    ),
    SIDE_ORDER[source.position],
    SIDE_ORDER[target.position],
    Math.round(source.anchor.ratio * 1000),
    Math.round(target.anchor.ratio * 1000),
  ]
}

const toRouteParams = (
  endpoints: ResolvedEdgeEndpoints,
  obstacles: readonly ObstacleRect[],
  neighborEdges: readonly IPoint[][],
  enableStraightPath: boolean
) => ({
  enableStraightPath,
  adjustedSource: endpoints.adjustedSource,
  adjustedTarget: endpoints.adjustedTarget,
  sourcePosition: endpoints.sourcePosition,
  targetPosition: endpoints.targetPosition,
  padding: endpoints.padding,
  rounded: endpoints.rounded,
  sourceAbsolutePosition: endpoints.sourceAbsolutePosition,
  targetAbsolutePosition: endpoints.targetAbsolutePosition,
  sourceSize: endpoints.sourceSize,
  targetSize: endpoints.targetSize,
  obstacles,
  neighborEdges,
})

export const routeChosenAnchors = (
  endpoints: ResolvedEdgeEndpoints,
  obstacles: readonly ObstacleRect[],
  neighborEdges: readonly IPoint[][],
  enableStraightPath: boolean
): IPoint[] =>
  routeStepEdge(
    toRouteParams(endpoints, obstacles, neighborEdges, enableStraightPath)
  )

export type ResolveWithAnchors = (overrides: {
  sourceAnchor?: FreeformEdgeAnchor
  targetAnchor?: FreeformEdgeAnchor
}) => ResolvedEdgeEndpoints | null

export type AutoAnchorInput = {
  sourceRect: Rect
  targetRect: Rect
  sourceType?: string
  targetType?: string
  sourceCustom?: FreeformEdgeAnchor
  targetCustom?: FreeformEdgeAnchor
  sourcePreferred?: FreeformEdgeAnchor
  targetPreferred?: FreeformEdgeAnchor
  resolve: ResolveWithAnchors
  obstacles: readonly ObstacleRect[]
  thirdPartyObstacles?: readonly ObstacleRect[]
  neighborEdges: readonly IPoint[][]
  enableStraightPath: boolean
  incumbentRoute?: readonly IPoint[]
}

export type AutoAnchorResult = {
  endpoints: ResolvedEdgeEndpoints
  route: IPoint[]
  sourceAnchor?: FreeformEdgeAnchor
  targetAnchor?: FreeformEdgeAnchor
}

export const selectEdgeAnchors = (
  input: AutoAnchorInput
): AutoAnchorResult | null => {
  const thirdParty = input.thirdPartyObstacles ?? NO_OBSTACLES
  const sourceConnectionRect = getNodeConnectionRect(
    input.sourceType,
    input.sourceRect
  )
  const targetConnectionRect = getNodeConnectionRect(
    input.targetType,
    input.targetRect
  )

  const sourceFacing = null
  const targetFacing = null
  const sourceOptions = input.sourceCustom
    ? [toAnchorChoice(input.sourceType, input.sourceRect, input.sourceCustom)]
    : generateCandidates(
        input.sourceType,
        input.sourceRect,
        centerOf(targetConnectionRect)
      )
  const targetOptions = input.targetCustom
    ? [toAnchorChoice(input.targetType, input.targetRect, input.targetCustom)]
    : generateCandidates(
        input.targetType,
        input.targetRect,
        centerOf(sourceConnectionRect)
      )

  const addPreferred = (
    options: AnchorChoice[],
    preferred: FreeformEdgeAnchor | undefined,
    type: string | undefined,
    rect: Rect
  ): void => {
    if (!preferred) return
    const add = (anchor: FreeformEdgeAnchor): void => {
      const key = `${anchor.side}:${Math.round(anchor.ratio * 1000)}`
      if (
        options.some(
          (option) =>
            `${option.anchor.side}:${Math.round(option.anchor.ratio * 1000)}` ===
            key
        )
      )
        return
      options.push(toAnchorChoice(type, rect, anchor))
    }
    add(preferred)
    add({ side: preferred.side, ratio: 1 - preferred.ratio })
  }
  if (!input.sourceCustom)
    addPreferred(
      sourceOptions,
      input.sourcePreferred,
      input.sourceType,
      input.sourceRect
    )
  if (!input.targetCustom)
    addPreferred(
      targetOptions,
      input.targetPreferred,
      input.targetType,
      input.targetRect
    )

  const straight =
    !input.sourceCustom && !input.targetCustom
      ? straightAlignedPair(
          input.sourceRect,
          input.targetRect,
          input.sourceType,
          input.targetType
        )
      : null
  if (straight) {
    sourceOptions.push(straight.source)
    targetOptions.push(straight.target)
  }

  const addChoice = (options: AnchorChoice[], choice: AnchorChoice | null) => {
    if (!choice) return
    const key = `${choice.anchor.side}:${Math.round(choice.anchor.ratio * 1000)}`
    if (
      !options.some(
        (option) =>
          `${option.anchor.side}:${Math.round(option.anchor.ratio * 1000)}` ===
          key
      )
    )
      options.push(choice)
  }

  if (!input.sourceCustom && input.targetPreferred) {
    const preferred = toAnchorChoice(
      input.targetType,
      input.targetRect,
      input.targetPreferred
    )
    addChoice(
      sourceOptions,
      alignedToPinned(
        input.sourceType,
        input.sourceRect,
        preferred.point,
        preferred.position
      )
    )
  }
  if (!input.targetCustom && input.sourcePreferred) {
    const preferred = toAnchorChoice(
      input.sourceType,
      input.sourceRect,
      input.sourcePreferred
    )
    addChoice(
      targetOptions,
      alignedToPinned(
        input.targetType,
        input.targetRect,
        preferred.point,
        preferred.position
      )
    )
  }

  if (input.sourceCustom && !input.targetCustom) {
    const aligned = alignedToPinned(
      input.targetType,
      input.targetRect,
      sourceOptions[0].point,
      sourceOptions[0].position
    )
    if (aligned) targetOptions.push(aligned)
  } else if (input.targetCustom && !input.sourceCustom) {
    const aligned = alignedToPinned(
      input.sourceType,
      input.sourceRect,
      targetOptions[0].point,
      targetOptions[0].position
    )
    if (aligned) sourceOptions.push(aligned)
  }

  const combineEndpoints = (
    source: ResolvedEdgeEndpoints,
    target: ResolvedEdgeEndpoints
  ): ResolvedEdgeEndpoints => ({
    adjustedSource: source.adjustedSource,
    adjustedTarget: target.adjustedTarget,
    sourcePosition: source.sourcePosition,
    targetPosition: target.targetPosition,
    rounded: {
      sourceX: source.rounded.sourceX,
      sourceY: source.rounded.sourceY,
      targetX: target.rounded.targetX,
      targetY: target.rounded.targetY,
    },
    sourceAbsolutePosition: source.sourceAbsolutePosition,
    targetAbsolutePosition: target.targetAbsolutePosition,
    sourceSize: source.sourceSize,
    targetSize: target.targetSize,
    padding: source.padding,
  })
  const resolvedSources: Array<ResolvedEdgeEndpoints | undefined> = new Array(
    sourceOptions.length
  )
  const resolvedTargets: Array<ResolvedEdgeEndpoints | undefined> = new Array(
    targetOptions.length
  )
  const sourceCandidates: Array<RouteEndpointCandidate | undefined> = new Array(
    sourceOptions.length
  )
  const targetCandidates: Array<RouteEndpointCandidate | undefined> = new Array(
    targetOptions.length
  )
  const forceStubTurn = (anchor: FreeformEdgeAnchor, rect: Rect): boolean => {
    const axis = sideAxisLength(anchor.side, rect)
    return (
      Math.min(anchor.ratio * axis, (1 - anchor.ratio) * axis) <=
      EDGES.MIN_NODE_CLEARANCE_PX
    )
  }
  const balancedPinnedStubLengths = (() => {
    if (!input.sourceCustom || !input.targetCustom) return null
    const source = sourceOptions[0]
    const target = targetOptions[0]
    const sourcePoint = source.point
    const targetPoint = target.point
    const vertical =
      (source.position === Position.Top &&
        target.position === Position.Bottom &&
        sourcePoint.y > targetPoint.y) ||
      (source.position === Position.Bottom &&
        target.position === Position.Top &&
        sourcePoint.y < targetPoint.y)
    const horizontal =
      (source.position === Position.Left &&
        target.position === Position.Right &&
        sourcePoint.x > targetPoint.x) ||
      (source.position === Position.Right &&
        target.position === Position.Left &&
        sourcePoint.x < targetPoint.x)
    if (!vertical && !horizontal) return null

    const sourceCoordinate = vertical ? sourcePoint.y : sourcePoint.x
    const targetCoordinate = vertical ? targetPoint.y : targetPoint.x
    const lane =
      Math.round((sourceCoordinate + targetCoordinate) / 2 / GRID) * GRID
    const sourceLength = Math.abs(sourceCoordinate - lane)
    const targetLength = Math.abs(targetCoordinate - lane)
    if (sourceLength < GRID || targetLength < GRID) return null
    return {
      sourceLength,
      targetLength,
      requiresTurn: vertical
        ? sourcePoint.x !== targetPoint.x
        : sourcePoint.y !== targetPoint.y,
    }
  })()
  const referenceSource = sourceOptions[0]
  const referenceTarget = targetOptions[0]
  for (let sourceIndex = 0; sourceIndex < sourceOptions.length; sourceIndex++) {
    const source = sourceOptions[sourceIndex]
    const endpoints = input.resolve({
      sourceAnchor: source.anchor,
      targetAnchor: referenceTarget.anchor,
    })
    if (!endpoints) continue
    resolvedSources[sourceIndex] = endpoints
    sourceCandidates[sourceIndex] = {
      point: endpoints.adjustedSource,
      position: endpoints.sourcePosition,
      stubLength: balancedPinnedStubLengths?.sourceLength ?? EDGES.STUB_LENGTH,
      cost: input.sourceCustom
        ? 0
        : endpointPlacementCost(
            source.anchor,
            sideAxisLength(source.anchor.side, sourceConnectionRect),
            GRID
          ) +
          endpointPreferenceCost(
            source.anchor,
            input.sourcePreferred,
            sideAxisLength(source.anchor.side, sourceConnectionRect),
            GRID
          ),
      forceStubTurn:
        (Boolean(input.sourceCustom) &&
          forceStubTurn(source.anchor, sourceConnectionRect)) ||
        (balancedPinnedStubLengths?.requiresTurn ?? false),
    }
  }
  for (let targetIndex = 0; targetIndex < targetOptions.length; targetIndex++) {
    const target = targetOptions[targetIndex]
    const endpoints = input.resolve({
      sourceAnchor: referenceSource.anchor,
      targetAnchor: target.anchor,
    })
    if (!endpoints) continue
    resolvedTargets[targetIndex] = endpoints
    targetCandidates[targetIndex] = {
      point: endpoints.adjustedTarget,
      position: endpoints.targetPosition,
      stubLength: balancedPinnedStubLengths?.targetLength ?? EDGES.STUB_LENGTH,
      cost: input.targetCustom
        ? 0
        : endpointPlacementCost(
            target.anchor,
            sideAxisLength(target.anchor.side, targetConnectionRect),
            GRID
          ) +
          endpointPreferenceCost(
            target.anchor,
            input.targetPreferred,
            sideAxisLength(target.anchor.side, targetConnectionRect),
            GRID
          ),
      forceStubTurn:
        (Boolean(input.targetCustom) &&
          forceStubTurn(target.anchor, targetConnectionRect)) ||
        (balancedPinnedStubLengths?.requiresTurn ?? false),
    }
  }

  const sourceMap: number[] = []
  const targetMap: number[] = []
  const jointSources = sourceCandidates.flatMap((candidate, index) => {
    if (!candidate) return []
    sourceMap.push(index)
    return [candidate]
  })
  const jointTargets = targetCandidates.flatMap((candidate, index) => {
    if (!candidate) return []
    targetMap.push(index)
    return [candidate]
  })
  const joint = routeAroundObstaclesBetweenCandidates(
    jointSources,
    jointTargets,
    input.obstacles,
    input.neighborEdges,
    input.incumbentRoute,
    { source: input.sourceRect, target: input.targetRect }
  )
  if (joint) {
    const sourceIndex = sourceMap[joint.sourceIndex]
    const targetIndex = targetMap[joint.targetIndex]
    const resolvedSource = resolvedSources[sourceIndex]
    const resolvedTarget = resolvedTargets[targetIndex]
    if (resolvedSource && resolvedTarget) {
      return {
        endpoints: combineEndpoints(resolvedSource, resolvedTarget),
        route: joint.route,
        sourceAnchor: input.sourceCustom
          ? undefined
          : sourceOptions[sourceIndex].anchor,
        targetAnchor: input.targetCustom
          ? undefined
          : targetOptions[targetIndex].anchor,
      }
    }
  }

  let best: {
    endpoints: ResolvedEdgeEndpoints
    idealRoute: IPoint[]
    source: AnchorChoice
    target: AnchorChoice
    key: number[]
  } | null = null

  for (let sourceIndex = 0; sourceIndex < sourceOptions.length; sourceIndex++) {
    const source = sourceOptions[sourceIndex]
    for (
      let targetIndex = 0;
      targetIndex < targetOptions.length;
      targetIndex++
    ) {
      const target = targetOptions[targetIndex]
      const resolvedSource = resolvedSources[sourceIndex]
      const resolvedTarget = resolvedTargets[targetIndex]
      if (!resolvedSource || !resolvedTarget) continue
      const endpoints = combineEndpoints(resolvedSource, resolvedTarget)
      const idealRoute = routeStepEdge(
        toRouteParams(
          endpoints,
          NO_OBSTACLES,
          NO_NEIGHBORS,
          input.enableStraightPath
        )
      )
      const key = scoreKey(
        idealRoute,
        source,
        target,
        sourceConnectionRect,
        targetConnectionRect,
        sourceFacing,
        targetFacing,
        thirdParty,
        input.neighborEdges,
        input.sourcePreferred,
        input.targetPreferred
      )
      if (!best || lexLess(key, best.key)) {
        best = { endpoints, idealRoute, source, target, key }
      }
    }
  }

  if (!best) return null
  const sourceAnchor = input.sourceCustom ? undefined : best.source.anchor
  const targetAnchor = input.targetCustom ? undefined : best.target.anchor
  const route =
    input.obstacles.length === 0 && input.neighborEdges.length === 0
      ? best.idealRoute
      : routeChosenAnchors(
          best.endpoints,
          input.obstacles,
          input.neighborEdges,
          input.enableStraightPath
        )
  return { endpoints: best.endpoints, route, sourceAnchor, targetAnchor }
}
