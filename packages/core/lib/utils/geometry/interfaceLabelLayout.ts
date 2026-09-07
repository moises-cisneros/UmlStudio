export type CardinalSide = "top" | "right" | "bottom" | "left"

export type InterfaceLabelSide =
  | CardinalSide
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"

interface InterfaceEdgeLike {
  id?: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

interface Pt {
  x: number
  y: number
}
interface RectLike {
  x: number
  y: number
  width: number
  height: number
}

const sideOfPoint = (p: Pt, rect: RectLike): CardinalSide => {
  const halfW = rect.width / 2 || 1
  const halfH = rect.height / 2 || 1
  const dx = (p.x - (rect.x + halfW)) / halfW
  const dy = (p.y - (rect.y + halfH)) / halfH
  return Math.abs(dx) >= Math.abs(dy)
    ? dx >= 0
      ? "right"
      : "left"
    : dy >= 0
      ? "bottom"
      : "top"
}

const sideFromHandle = (
  handle: string | null | undefined
): CardinalSide | null => {
  switch (handle) {
    case "top":
    case "right":
    case "bottom":
    case "left":
      return handle
    default:
      return null
  }
}

export function getOccupiedInterfaceSides(
  edges: ReadonlyArray<InterfaceEdgeLike>,
  nodeId: string,
  geometry?: {
    rect: RectLike
    routeById: Readonly<Record<string, ReadonlyArray<Pt>>>
  }
): Set<CardinalSide> {
  const occupied = new Set<CardinalSide>()
  const derivedSide = (
    edge: InterfaceEdgeLike,
    end: "source" | "target"
  ): CardinalSide | null => {
    if (!geometry || edge.id === undefined) return null
    const route = geometry.routeById[edge.id]
    if (!route || route.length < 2) return null
    const p = end === "source" ? route[0] : route[route.length - 1]
    return sideOfPoint(p, geometry.rect)
  }
  for (const edge of edges) {
    const isSource = edge.source === nodeId
    const isTarget = edge.target === nodeId
    if (!isSource && !isTarget) continue
    if (isSource) {
      const side =
        derivedSide(edge, "source") ?? sideFromHandle(edge.sourceHandle)
      if (side) occupied.add(side)
    }
    if (isTarget) {
      const side =
        derivedSide(edge, "target") ?? sideFromHandle(edge.targetHandle)
      if (side) occupied.add(side)
    }
  }
  return occupied
}

export function pickInterfaceLabelSide(
  occupied: ReadonlySet<CardinalSide>,
  opts?: { badgeTopRight?: boolean }
): InterfaceLabelSide {
  const cardinals: CardinalSide[] = opts?.badgeTopRight
    ? ["bottom", "left", "top", "right"]
    : ["bottom", "top", "left", "right"]
  for (const side of cardinals) {
    if (!occupied.has(side)) return side
  }
  return opts?.badgeTopRight ? "bottom-left" : "bottom-right"
}

export function computeInterfaceLabelSide(
  edges: ReadonlyArray<InterfaceEdgeLike>,
  nodeId: string,
  opts?: {
    badgeTopRight?: boolean
    geometry?: {
      rect: RectLike
      routeById: Readonly<Record<string, ReadonlyArray<Pt>>>
    }
  }
): InterfaceLabelSide {
  return pickInterfaceLabelSide(
    getOccupiedInterfaceSides(edges, nodeId, opts?.geometry),
    opts
  )
}
