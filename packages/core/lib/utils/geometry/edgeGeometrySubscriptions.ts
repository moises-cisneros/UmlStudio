import type { IPoint } from "@/edges/Connection"

export type GeometryRect = {
  x: number
  y: number
  width: number
  height: number
}

export type SelectedRouteEntries = Array<string | IPoint[]>

export const polylineBounds = (points: readonly IPoint[]): GeometryRect => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return points.length === 0
    ? { x: 0, y: 0, width: 0, height: 0 }
    : { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

const mayIntersect = (a: GeometryRect, b: GeometryRect): boolean =>
  a.x <= b.x + b.width &&
  a.x + a.width >= b.x &&
  a.y <= b.y + b.height &&
  a.y + a.height >= b.y

const registryBoundsCache = new WeakMap<IPoint[], GeometryRect>()

const registryRouteBounds = (route: IPoint[]): GeometryRect => {
  const cached = registryBoundsCache.get(route)
  if (cached) return cached
  const result = polylineBounds(route)
  registryBoundsCache.set(route, result)
  return result
}

type DisplayedRouteChange = {
  id: string
  before: IPoint[] | undefined
  after: IPoint[] | undefined
}

const displayedRouteChangesCache = new WeakMap<
  Readonly<Record<string, IPoint[]>>,
  WeakMap<
    Readonly<Record<string, IPoint[]>>,
    WeakMap<Readonly<Record<string, IPoint[]>>, DisplayedRouteChange[]>
  >
>()

const displayedRouteChanges = (
  geometryById: Readonly<Record<string, IPoint[]>>,
  previousPreview: Readonly<Record<string, IPoint[]>>,
  nextPreview: Readonly<Record<string, IPoint[]>>
): DisplayedRouteChange[] => {
  let byPrevious = displayedRouteChangesCache.get(geometryById)
  if (!byPrevious) {
    byPrevious = new WeakMap()
    displayedRouteChangesCache.set(geometryById, byPrevious)
  }
  let byNext = byPrevious.get(previousPreview)
  if (!byNext) {
    byNext = new WeakMap()
    byPrevious.set(previousPreview, byNext)
  }
  const cached = byNext.get(nextPreview)
  if (cached) return cached

  const changes: DisplayedRouteChange[] = []
  for (const [id, exact] of Object.entries(geometryById)) {
    const before = previousPreview[id] ?? exact
    const after = nextPreview[id] ?? exact
    if (before !== after) changes.push({ id, before, after })
  }
  byNext.set(nextPreview, changes)
  return changes
}

export const selectRouteEntriesIntersectingRect = (
  geometryById: Readonly<Record<string, IPoint[]>>,
  query: GeometryRect,
  excludeId?: string
): SelectedRouteEntries => {
  const selected: SelectedRouteEntries = []
  for (const [id, route] of Object.entries(geometryById)) {
    if (
      id === excludeId ||
      route.length < 2 ||
      !mayIntersect(query, registryRouteBounds(route))
    )
      continue
    selected.push(id, route)
  }
  return selected
}

export const selectDisplayedRouteEntriesIntersectingRect = (
  geometryById: Readonly<Record<string, IPoint[]>>,
  previewById: Readonly<Record<string, IPoint[]>>,
  query: GeometryRect,
  excludeId?: string
): SelectedRouteEntries => {
  const selected: SelectedRouteEntries = []
  const append = (id: string, route: IPoint[]) => {
    if (
      id !== excludeId &&
      route.length >= 2 &&
      mayIntersect(query, registryRouteBounds(route))
    )
      selected.push(id, route)
  }
  for (const [id, exact] of Object.entries(geometryById))
    append(id, previewById[id] ?? exact)
  return selected
}

export const createRouteEntriesSelector = (
  query: GeometryRect,
  excludeId?: string
): ((
  geometryById: Readonly<Record<string, IPoint[]>>
) => SelectedRouteEntries) => {
  let previousGeometry: Readonly<Record<string, IPoint[]>> | undefined
  let previousSelection: SelectedRouteEntries = []
  return (geometryById) => {
    if (geometryById === previousGeometry) return previousSelection
    previousGeometry = geometryById
    previousSelection = selectRouteEntriesIntersectingRect(
      geometryById,
      query,
      excludeId
    )
    return previousSelection
  }
}

export const createDisplayedRouteEntriesSelector = (
  query: GeometryRect,
  excludeId?: string
): ((
  geometryById: Readonly<Record<string, IPoint[]>>,
  previewById: Readonly<Record<string, IPoint[]>>
) => SelectedRouteEntries) => {
  let previousGeometry: Readonly<Record<string, IPoint[]>> | undefined
  let previousPreview: Readonly<Record<string, IPoint[]>> | undefined
  let previousSelection: SelectedRouteEntries = []
  return (geometryById, previewById) => {
    if (geometryById === previousGeometry && previewById === previousPreview)
      return previousSelection
    if (geometryById === previousGeometry && previousPreview) {
      const relevantRouteChanged = displayedRouteChanges(
        geometryById,
        previousPreview,
        previewById
      ).some(
        ({ id, before, after }) =>
          id !== excludeId &&
          ((before && mayIntersect(query, registryRouteBounds(before))) ||
            (after && mayIntersect(query, registryRouteBounds(after))))
      )
      if (!relevantRouteChanged) {
        previousPreview = previewById
        return previousSelection
      }
    }
    previousGeometry = geometryById
    previousPreview = previewById
    previousSelection = selectDisplayedRouteEntriesIntersectingRect(
      geometryById,
      previewById,
      query,
      excludeId
    )
    return previousSelection
  }
}

export const selectedRoutesToRecord = (
  selected: readonly (string | IPoint[])[]
): Record<string, IPoint[]> => {
  const result: Record<string, IPoint[]> = {}
  for (let index = 0; index < selected.length; index += 2)
    result[selected[index] as string] = selected[index + 1] as IPoint[]
  return result
}
