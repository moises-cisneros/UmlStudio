import { useCallback, useMemo, useEffect, useLayoutEffect, useRef, useState } from "react"
import { Position, useReactFlow, useStore, type Edge, type Node } from "@xyflow/react"
import { EDGES, INTERFACE } from "@/constants"
import { adjustSourceCoordinates, adjustTargetCoordinates, getPositionOnCanvas } from "@/utils"
import { IPoint, tryFindStraightPath } from "../edges/Connection"
import { useDiagramStore, useMetadataStore, useEdgeGeometryStore } from "@/store/context"
import { useShallow } from "zustand/shallow"
import {
  getEdgeMarkerStyles,
  getMarkerSegmentPath,
  preserveOrthogonalEdgePoints,
  getBendLaneBounds,
  normalizeOrthogonalEdgePoints,
  resolveOrthogonalEdgeReleasePoints,
  isInvalidOrthogonalEdgeRelease,
  getSideHandleIdForPosition,
  getEndpointSideFromSegment,
  getTargetConnectionPointPadding,
  isFreeformEdgeAnchor,
  roundAnchorPointOutward,
  type FreeformEdgeAnchor,
} from "@/utils/edgeUtils"
import {
  getEdgeAnchorFromPoint,
  getEdgeAnchorPoint,
  pickNearestConnectable,
} from "@/utils/connectionModes"
import {
  FREEFORM_ENDPOINT_SNAP_RADIUS_PX,
  useFreeformEndpointNode,
} from "./useFreeformEndpointNode"
import {
  type BendHandle,
  applyInnerSegmentBend,
  applyTerminalSegmentBend,
  getBendableSegments,
  computeToolbarPosition,
} from "@/utils/geometry/bendHandles"
import {
  getMidSegment,
  collectNeighborPolylines,
  type Rect,
} from "@/utils/geometry/edgeLabelLayout"
import { useEdgeState } from "../edges/GenericEdge"
import { useDiagramModifiable } from "./useDiagramModifiable"
import { useEdgeLineJumps, buildEdgePath } from "./useEdgeLineJumps"
import {
  resolveEdgeGeometryNodes,
  createNearbySettledNodeGeometrySelector,
  selectEdgeNodeSubscription,
} from "@/utils/geometry/edgeNodeSubscription"
import {
  createRouteEntriesSelector,
  selectedRoutesToRecord,
} from "@/utils/geometry/edgeGeometrySubscriptions"
import { recordEdgeRender } from "@/sync/perfCounters"

interface UseStepPathEdgeProps {
  id: string
  type: string
  source: string
  target: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: Position
  targetPosition: Position
  sourceHandleId?: string | null
  targetHandleId?: string | null
  data?: {
    points?: IPoint[]
    sourceAnchor?: FreeformEdgeAnchor
    targetAnchor?: FreeformEdgeAnchor
  }
  allowMidpointDragging?: boolean
  detachedTargetMarkerType?: string
}

export interface StepPathEdgeData {
  activePoints: IPoint[]
  pathMiddlePosition: IPoint
  toolbarPosition: IPoint
  isMiddlePathHorizontal: boolean
  sourcePoint: IPoint
  targetPoint: IPoint
  nodeRects: Rect[]
  midSegmentStart: IPoint
  midSegmentEnd: IPoint
  neighborGeometry: IPoint[][]
}

type EndpointType = "source" | "target"

type EndpointDragCommit = {
  endpoint: EndpointType
  nodeId: string
  nodeType?: string
  handleId: string
  anchor: FreeformEdgeAnchor
  points: IPoint[]
  sourceEndpoint: IPoint
  targetEndpoint: IPoint
  sourcePosition: Position
  targetPosition: Position
  sourceRect: Rect
  targetRect: Rect
  committedPoints: IPoint[]
  predictedEdge: Edge
}

const arePointsEqual = (a: IPoint[], b: IPoint[]): boolean =>
  a.length === b.length &&
  a.every((point, index) => point.x === b[index].x && point.y === b[index].y)

const isInterfaceNodeType = (nodeType?: string): boolean =>
  nodeType === "componentInterface" || nodeType === "deploymentInterface"

const getInterfaceMarkerGeometry = (nodeType: string | undefined, rect: Rect | null) =>
  rect && isInterfaceNodeType(nodeType)
    ? {
        radius: rect.width / 2,
      }
    : undefined

export const useStepPathEdge = ({
  id,
  type,
  source,
  target,
  sourceX: reactFlowSourceX,
  sourceY: reactFlowSourceY,
  targetX: reactFlowTargetX,
  targetY: reactFlowTargetY,
  sourcePosition: reactFlowSourcePosition,
  targetPosition: reactFlowTargetPosition,
  sourceHandleId,
  targetHandleId,
  data,
  allowMidpointDragging = true,
  detachedTargetMarkerType,
}: UseStepPathEdgeProps) => {
  recordEdgeRender()
  const draggingHandleRef = useRef<BendHandle | null>(null)
  const dragOffsetRef = useRef<IPoint>({ x: 0, y: 0 })
  const pathRef = useRef<SVGPathElement | null>(null)
  const finalPointsRef = useRef<IPoint[]>([])
  const dragPointsRef = useRef<IPoint[]>([])
  const lastValidDragRef = useRef<IPoint[]>([])
  const endpointDragCommitRef = useRef<EndpointDragCommit | null>(null)
  const activePointerCancelRef = useRef<(() => void) | null>(null)
  const activePointerTeardownRef = useRef<(() => void) | null>(null)

  const isDiagramModifiable = useDiagramModifiable()
  const setLiveEdgeOverride = useMetadataStore((state) => state.setLiveEdgeOverride)
  const centralRoute = useEdgeGeometryStore(
    (state) => state.previewById[id] ?? state.geometryById[id]
  )
  const { getIntersectingNodes, getNode, getNodes, screenToFlowPosition } = useReactFlow()

  const [draggingHandle, setDraggingHandle] = useState<BendHandle | null>(null)
  const [dragPreviewPoints, setDragPreviewPoints] = useState<IPoint[] | null>(null)
  const [dragPreviewPositions, setDragPreviewPositions] = useState<{
    sourcePosition: Position
    targetPosition: Position
  } | null>(null)
  const [endpointPreviewCommit, setEndpointPreviewCommit] = useState<EndpointDragCommit | null>(
    null
  )
  const [isTargetEndpointDetached, setIsTargetEndpointDetached] = useState(false)

  useEffect(
    () => () => {
      activePointerTeardownRef.current?.()
    },
    []
  )

  const { customPoints, setCustomPoints } = useEdgeState(data?.points)
  const sourceAnchor = data?.sourceAnchor
  const targetAnchor = data?.targetAnchor
  const shouldSubscribeToNodeGeometry =
    isFreeformEdgeAnchor(sourceAnchor) || isFreeformEdgeAnchor(targetAnchor)
  const setEdges = useDiagramStore((state) => state.setEdges)
  const endpointNodeGeometry = useDiagramStore(
    useShallow((state) => {
      if (!shouldSubscribeToNodeGeometry) return undefined

      const storeSourceNode = state.nodes.find((node) => node.id === source)
      const storeTargetNode = state.nodes.find((node) => node.id === target)
      const storeSourcePosition = storeSourceNode
        ? getPositionOnCanvas(storeSourceNode, state.nodes)
        : null
      const storeTargetPosition = storeTargetNode
        ? getPositionOnCanvas(storeTargetNode, state.nodes)
        : null

      return {
        sourceNodePositionX: storeSourcePosition?.x,
        sourceNodePositionY: storeSourcePosition?.y,
        sourceNodeWidth: storeSourceNode?.width ?? storeSourceNode?.measured?.width,
        sourceNodeHeight: storeSourceNode?.height ?? storeSourceNode?.measured?.height,
        targetNodePositionX: storeTargetPosition?.x,
        targetNodePositionY: storeTargetPosition?.y,
        targetNodeWidth: storeTargetNode?.width ?? storeTargetNode?.measured?.width,
        targetNodeHeight: storeTargetNode?.height ?? storeTargetNode?.measured?.height,
      }
    })
  )
  const {
    sourceNodePositionX,
    sourceNodePositionY,
    sourceNodeWidth,
    sourceNodeHeight,
    targetNodePositionX,
    targetNodePositionY,
    targetNodeWidth,
    targetNodeHeight,
  } = endpointNodeGeometry ?? {}

  const edgeMarkerStyles = getEdgeMarkerStyles(type)
  const { markerPadding, markerStart, strokeDashArray, offset = 0 } = edgeMarkerStyles
  const markerEnd =
    isTargetEndpointDetached && detachedTargetMarkerType
      ? getEdgeMarkerStyles(detachedTargetMarkerType).markerEnd
      : edgeMarkerStyles.markerEnd
  const padding = markerPadding ?? EDGES.MARKER_PADDING
  const subscribedNodes = useStore((state) =>
    selectEdgeNodeSubscription(state.nodes, shouldSubscribeToNodeGeometry)
  )
  const allNodes = resolveEdgeGeometryNodes(
    subscribedNodes,
    getNodes,
    shouldSubscribeToNodeGeometry
  ) as Node[]
  const sourceNode = allNodes.find((node) => node.id === source) ?? getNode(source)
  const targetNode = allNodes.find((node) => node.id === target) ?? getNode(target)

  const sourceAbsolutePosition = useMemo(() => {
    if (sourceNode) return getPositionOnCanvas(sourceNode, allNodes)
    if (sourceNodePositionX != null && sourceNodePositionY != null) {
      return { x: sourceNodePositionX, y: sourceNodePositionY }
    }
    return { x: reactFlowSourceX, y: reactFlowSourceY }
  }, [
    sourceNode,
    allNodes,
    sourceNodePositionX,
    sourceNodePositionY,
    reactFlowSourceX,
    reactFlowSourceY,
  ])

  const targetAbsolutePosition = useMemo(() => {
    if (targetNode) return getPositionOnCanvas(targetNode, allNodes)
    if (targetNodePositionX != null && targetNodePositionY != null) {
      return { x: targetNodePositionX, y: targetNodePositionY }
    }
    return { x: reactFlowTargetX, y: reactFlowTargetY }
  }, [
    targetNode,
    allNodes,
    targetNodePositionX,
    targetNodePositionY,
    reactFlowTargetX,
    reactFlowTargetY,
  ])

  const sourceRect = useMemo(
    () =>
      sourceNode
        ? {
            x: sourceAbsolutePosition.x,
            y: sourceAbsolutePosition.y,
            width: sourceNode.width ?? sourceNodeWidth ?? 0,
            height: sourceNode.height ?? sourceNodeHeight ?? 0,
          }
        : null,
    [
      sourceAbsolutePosition.x,
      sourceAbsolutePosition.y,
      sourceNode,
      sourceNodeWidth,
      sourceNodeHeight,
    ]
  )
  const targetRect = useMemo(
    () =>
      targetNode
        ? {
            x: targetAbsolutePosition.x,
            y: targetAbsolutePosition.y,
            width: targetNode.width ?? targetNodeWidth ?? 0,
            height: targetNode.height ?? targetNodeHeight ?? 0,
          }
        : null,
    [
      targetAbsolutePosition.x,
      targetAbsolutePosition.y,
      targetNode,
      targetNodeWidth,
      targetNodeHeight,
    ]
  )
  const committedTargetInterfaceGeometry = getInterfaceMarkerGeometry(targetNode?.type, targetRect)
  const resolvedSourceAnchor = useMemo(
    () =>
      sourceRect && isFreeformEdgeAnchor(sourceAnchor)
        ? getEdgeAnchorPoint(sourceNode?.type, sourceRect, sourceAnchor)
        : null,
    [sourceAnchor, sourceRect, sourceNode?.type]
  )
  const resolvedTargetAnchor = useMemo(
    () =>
      targetRect && isFreeformEdgeAnchor(targetAnchor)
        ? getEdgeAnchorPoint(targetNode?.type, targetRect, targetAnchor)
        : null,
    [targetAnchor, targetRect, targetNode?.type]
  )

  const sourceX = resolvedSourceAnchor?.point.x ?? reactFlowSourceX
  const sourceY = resolvedSourceAnchor?.point.y ?? reactFlowSourceY
  const targetX = resolvedTargetAnchor?.point.x ?? reactFlowTargetX
  const targetY = resolvedTargetAnchor?.point.y ?? reactFlowTargetY
  const baseSourcePosition = resolvedSourceAnchor?.position ?? reactFlowSourcePosition
  const baseTargetPosition = resolvedTargetAnchor?.position ?? reactFlowTargetPosition
  const sourceConnectionPointPadding = resolvedSourceAnchor
    ? 0
    : EDGES.SOURCE_CONNECTION_POINT_PADDING
  const targetConnectionPointPadding = getTargetConnectionPointPadding(
    padding,
    resolvedTargetAnchor !== null
  )

  const roundedSource = resolvedSourceAnchor
    ? roundAnchorPointOutward(resolvedSourceAnchor.point, baseSourcePosition)
    : { x: Math.round(sourceX), y: Math.round(sourceY) }
  const roundedTarget = resolvedTargetAnchor
    ? roundAnchorPointOutward(resolvedTargetAnchor.point, baseTargetPosition)
    : { x: Math.round(targetX), y: Math.round(targetY) }
  const roundedSourceX = roundedSource.x
  const roundedSourceY = roundedSource.y
  const roundedTargetX = roundedTarget.x
  const roundedTargetY = roundedTarget.y

  const baseAdjustedTarget = adjustTargetCoordinates(
    roundedTargetX,
    roundedTargetY,
    baseTargetPosition,
    targetConnectionPointPadding
  )
  const baseAdjustedSource = adjustSourceCoordinates(
    roundedSourceX,
    roundedSourceY,
    baseSourcePosition,
    sourceConnectionPointPadding
  )

  const routeEndpoints = centralRoute && centralRoute.length >= 2 ? centralRoute : null
  const sourcePosition = routeEndpoints
    ? getEndpointSideFromSegment(routeEndpoints[0], routeEndpoints[1])
    : baseSourcePosition
  const targetPosition = routeEndpoints
    ? getEndpointSideFromSegment(
        routeEndpoints[routeEndpoints.length - 1],
        routeEndpoints[routeEndpoints.length - 2]
      )
    : baseTargetPosition
  const adjustedSourceCoordinates = routeEndpoints
    ? { sourceX: routeEndpoints[0].x, sourceY: routeEndpoints[0].y }
    : baseAdjustedSource
  const adjustedTargetCoordinates = routeEndpoints
    ? {
        targetX: routeEndpoints[routeEndpoints.length - 1].x,
        targetY: routeEndpoints[routeEndpoints.length - 1].y,
      }
    : baseAdjustedTarget
  const hasStoredManualPoints = Boolean(data?.points && data.points.length > 0)
  const hasLocalManualPoints = customPoints.length > 0
  const hasManualPoints = hasStoredManualPoints
  const shouldPreferComputedPath = (centralRoute?.length ?? 0) === 2 && !hasManualPoints

  const centralFallback = useMemo<IPoint[]>(
    () => [
      {
        x: adjustedSourceCoordinates.sourceX,
        y: adjustedSourceCoordinates.sourceY,
      },
      {
        x: adjustedTargetCoordinates.targetX,
        y: adjustedTargetCoordinates.targetY,
      },
    ],
    [
      adjustedSourceCoordinates.sourceX,
      adjustedSourceCoordinates.sourceY,
      adjustedTargetCoordinates.targetX,
      adjustedTargetCoordinates.targetY,
    ]
  )

  const activePoints = centralRoute ?? centralFallback

  useEffect(() => {
    if (dragPreviewPoints !== null) return

    if (
      centralRoute &&
      centralRoute.length >= 2 &&
      (centralRoute[0].x !== baseAdjustedSource.sourceX ||
        centralRoute[0].y !== baseAdjustedSource.sourceY ||
        centralRoute[centralRoute.length - 1].x !== baseAdjustedTarget.targetX ||
        centralRoute[centralRoute.length - 1].y !== baseAdjustedTarget.targetY)
    )
      return

    if (!centralRoute) return

    if (shouldPreferComputedPath) {
      if (hasLocalManualPoints) {
        setCustomPoints([])
      }
      if (hasStoredManualPoints) {
        setEdges((edges) =>
          edges.map((edge) =>
            edge.id === id ? { ...edge, data: { ...edge.data, points: [] } } : edge
          )
        )
      }
      return
    }

    if (!hasManualPoints) return

    const storedPoints = data?.points && data.points.length > 0 ? data.points : customPoints

    const pointsToStore = normalizeOrthogonalEdgePoints(
      activePoints,
      {
        x: adjustedSourceCoordinates.sourceX,
        y: adjustedSourceCoordinates.sourceY,
      },
      {
        x: adjustedTargetCoordinates.targetX,
        y: adjustedTargetCoordinates.targetY,
      },
      sourcePosition,
      targetPosition
    )

    if (arePointsEqual(storedPoints, pointsToStore)) return

    setCustomPoints(pointsToStore)
    setEdges((edges) =>
      edges.map((edge) =>
        edge.id === id
          ? {
              ...edge,
              data: { ...edge.data, points: pointsToStore },
            }
          : edge
      )
    )
  }, [
    activePoints,
    baseAdjustedSource.sourceX,
    baseAdjustedSource.sourceY,
    baseAdjustedTarget.targetX,
    baseAdjustedTarget.targetY,
    centralRoute,
    customPoints,
    data?.points,
    dragPreviewPoints,
    hasLocalManualPoints,
    hasManualPoints,
    hasStoredManualPoints,
    id,
    setCustomPoints,
    setEdges,
    shouldPreferComputedPath,
    adjustedSourceCoordinates.sourceX,
    adjustedSourceCoordinates.sourceY,
    adjustedTargetCoordinates.targetX,
    adjustedTargetCoordinates.targetY,
    sourcePosition,
    targetPosition,
  ])

  const predictedCommit = endpointPreviewCommit
  const isPredictedEndpointPreview = dragPreviewPoints !== null && predictedCommit !== null
  const centralPreviewMatchesCommit =
    isPredictedEndpointPreview &&
    centralRoute !== undefined &&
    centralRoute.length >= 2 &&
    (predictedCommit.endpoint === "source"
      ? centralRoute[0].x === predictedCommit.sourceEndpoint.x &&
        centralRoute[0].y === predictedCommit.sourceEndpoint.y
      : centralRoute[centralRoute.length - 1].x === predictedCommit.targetEndpoint.x &&
        centralRoute[centralRoute.length - 1].y === predictedCommit.targetEndpoint.y)
  const renderPoints = centralPreviewMatchesCommit
    ? centralRoute
    : (dragPreviewPoints ?? activePoints)
  const renderSourcePosition = dragPreviewPositions?.sourcePosition ?? sourcePosition
  const renderTargetPosition = dragPreviewPositions?.targetPosition ?? targetPosition
  const targetInterfaceGeometry =
    endpointPreviewCommit?.endpoint === "target"
      ? (getInterfaceMarkerGeometry(
          endpointPreviewCommit?.nodeType,
          endpointPreviewCommit?.targetRect ?? null
        ) ?? {
          radius: INTERFACE.RADIUS,
        })
      : committedTargetInterfaceGeometry

  const lineJumps = useEdgeLineJumps(id, renderPoints, true)

  useLayoutEffect(() => {
    if (dragPreviewPoints === null) return
    setLiveEdgeOverride({
      edgeId: id,
      points: dragPreviewPoints,
      edge: endpointPreviewCommit?.predictedEdge,
      strategy: endpointPreviewCommit ? "predicted" : "authoritative",
    })
    return () => setLiveEdgeOverride(null)
  }, [dragPreviewPoints, endpointPreviewCommit, id, setLiveEdgeOverride])

  const currentPath = useMemo(
    () => buildEdgePath(renderPoints, lineJumps),
    [renderPoints, lineJumps]
  )

  const markerSegmentPath = useMemo(
    () => getMarkerSegmentPath(renderPoints, offset, renderTargetPosition),
    [renderPoints, offset, renderTargetPosition]
  )

  const overlayPath = useMemo(() => {
    return `${currentPath} ${markerSegmentPath}`
  }, [currentPath, markerSegmentPath])

  const bendHandles = useMemo(() => {
    if (!allowMidpointDragging) return []
    return getBendableSegments(renderPoints, EDGES.BEND_HANDLE_SAFE_AREA_PX)
  }, [renderPoints, allowMidpointDragging])

  const canEditEndpoint = true

  const midSegment = useMemo(
    () =>
      getMidSegment(
        renderPoints,
        renderPoints[0] ?? { x: sourceX, y: sourceY },
        renderPoints[renderPoints.length - 1] ?? { x: targetX, y: targetY }
      ),
    [renderPoints, sourceX, sourceY, targetX, targetY]
  )
  const pathMiddlePosition = midSegment.point
  const isMiddlePathHorizontal = midSegment.isHorizontal

  const edgeBounds = useMemo(() => {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity
    for (const pt of renderPoints) {
      if (pt.x < minX) minX = pt.x
      if (pt.x > maxX) maxX = pt.x
      if (pt.y < minY) minY = pt.y
      if (pt.y > maxY) maxY = pt.y
    }
    return { minX, minY, maxX, maxY }
  }, [renderPoints])

  const LABEL_REACH = 220

  const labelNeighborSearch = useMemo(() => {
    const center = {
      x: (edgeBounds.minX + edgeBounds.maxX) / 2,
      y: (edgeBounds.minY + edgeBounds.maxY) / 2,
    }
    const radius =
      Math.max(edgeBounds.maxX - edgeBounds.minX, edgeBounds.maxY - edgeBounds.minY) / 2 +
      LABEL_REACH
    return {
      center,
      radius,
      query: {
        x: center.x - radius,
        y: center.y - radius,
        width: radius * 2,
        height: radius * 2,
      },
    }
  }, [edgeBounds])
  const selectNeighborRoutes = useMemo(
    () => createRouteEntriesSelector(labelNeighborSearch.query, id),
    [labelNeighborSearch.query, id]
  )
  const selectedNeighborRouteEntries = useEdgeGeometryStore(
    useShallow((state) => selectNeighborRoutes(state.geometryById))
  )
  const neighborGeometry = useMemo(() => {
    return collectNeighborPolylines(
      selectedRoutesToRecord(selectedNeighborRouteEntries),
      id,
      labelNeighborSearch.center,
      labelNeighborSearch.radius
    )
  }, [selectedNeighborRouteEntries, id, labelNeighborSearch])

  const selectNearbySettledNodes = useMemo(
    () => createNearbySettledNodeGeometrySelector(edgeBounds, LABEL_REACH),
    [edgeBounds]
  )
  const nearbyNodeGeometry = useEdgeGeometryStore(
    useShallow((state) => selectNearbySettledNodes(state.settledNodeGeometry))
  )
  const nearbyNodeRects = useMemo<Rect[]>(() => {
    const rects: Rect[] = []
    for (let index = 0; index < nearbyNodeGeometry.length; index += 4)
      rects.push({
        x: nearbyNodeGeometry[index],
        y: nearbyNodeGeometry[index + 1],
        width: nearbyNodeGeometry[index + 2],
        height: nearbyNodeGeometry[index + 3],
      })
    return rects
  }, [nearbyNodeGeometry])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent, handle: BendHandle) => {
      if (!allowMidpointDragging || !event.isPrimary || event.button !== 0) return

      event.preventDefault()
      event.stopPropagation()
      activePointerCancelRef.current?.()
      const pointerId = event.pointerId
      const pointerTarget = event.currentTarget
      pointerTarget.setPointerCapture(pointerId)

      draggingHandleRef.current = handle
      setDraggingHandle(handle)

      const initialFlowPos = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      dragOffsetRef.current = {
        x: initialFlowPos.x - handle.position.x,
        y: initialFlowPos.y - handle.position.y,
      }
      const dragBaseline = [...activePoints]
      if (dragBaseline.length >= 2) {
        dragBaseline[0] = {
          x: adjustedSourceCoordinates.sourceX,
          y: adjustedSourceCoordinates.sourceY,
        }
        dragBaseline[dragBaseline.length - 1] = {
          x: adjustedTargetCoordinates.targetX,
          y: adjustedTargetCoordinates.targetY,
        }
      }
      dragPointsRef.current = dragBaseline
      finalPointsRef.current = [...dragBaseline]
      lastValidDragRef.current = [...dragBaseline]
      const dragSourcePoint = {
        x: adjustedSourceCoordinates.sourceX,
        y: adjustedSourceCoordinates.sourceY,
      }
      const dragTargetPoint = {
        x: adjustedTargetCoordinates.targetX,
        y: adjustedTargetCoordinates.targetY,
      }

      const laneBounds = getBendLaneBounds(
        dragBaseline,
        handle.segmentIndex,
        handle.orientation,
        dragSourcePoint,
        dragTargetPoint,
        sourcePosition,
        targetPosition
      )

      const handlePointerMove = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return
        const activeHandle = draggingHandleRef.current
        if (!activeHandle) return

        const flowPos = screenToFlowPosition({
          x: e.clientX,
          y: e.clientY,
        })

        const rawX = flowPos.x - dragOffsetRef.current.x
        const rawY = flowPos.y - dragOffsetRef.current.y

        const grid = EDGES.BEND_SNAP_GRID_PX
        const toLane = (value: number, origin: number): number =>
          Math.min(
            Math.max(origin + Math.round((value - origin) / grid) * grid, laneBounds.min),
            laneBounds.max
          )

        const delta: IPoint =
          activeHandle.orientation === "H"
            ? {
                x: 0,
                y: toLane(rawY, activeHandle.position.y) - activeHandle.position.y,
              }
            : {
                x: toLane(rawX, activeHandle.position.x) - activeHandle.position.x,
                y: 0,
              }

        const basePoints = dragPointsRef.current
        const newPoints =
          activeHandle.kind === "inner"
            ? applyInnerSegmentBend(
                basePoints,
                activeHandle.segmentIndex,
                delta,
                EDGES.BEND_SNAP_GRID_PX
              )
            : applyTerminalSegmentBend(
                basePoints,
                activeHandle,
                delta,
                sourcePosition,
                targetPosition,
                EDGES.STUB_LENGTH,
                EDGES.BEND_SNAP_GRID_PX
              )
        finalPointsRef.current = newPoints
        if (
          !isInvalidOrthogonalEdgeRelease(
            newPoints,
            dragSourcePoint,
            dragTargetPoint,
            sourcePosition,
            targetPosition
          )
        ) {
          lastValidDragRef.current = newPoints
        }

        setDragPreviewPoints(newPoints)
      }

      const ownerDocument = event.currentTarget.ownerDocument
      const teardownPointerGesture = () => {
        ownerDocument.removeEventListener("pointermove", handlePointerMove)
        ownerDocument.removeEventListener("pointerup", handlePointerUp)
        ownerDocument.removeEventListener("pointercancel", handlePointerCancel)
        if (pointerTarget.hasPointerCapture(pointerId))
          pointerTarget.releasePointerCapture(pointerId)
        if (activePointerTeardownRef.current === teardownPointerGesture) {
          activePointerTeardownRef.current = null
          activePointerCancelRef.current = null
        }
      }

      const restoreWithoutCommit = () => {
        setDragPreviewPoints(null)
        draggingHandleRef.current = null
        setDraggingHandle(null)
      }

      const handlePointerCancel = (e?: PointerEvent) => {
        if (e && e.pointerId !== pointerId) return
        restoreWithoutCommit()
        teardownPointerGesture()
      }

      const handlePointerUp = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return
        setDragPreviewPoints(null)

        const pathChanged = !arePointsEqual(finalPointsRef.current, dragPointsRef.current)

        if (pathChanged) {
          const sourcePoint = {
            x: adjustedSourceCoordinates.sourceX,
            y: adjustedSourceCoordinates.sourceY,
          }
          const targetPoint = {
            x: adjustedTargetCoordinates.targetX,
            y: adjustedTargetCoordinates.targetY,
          }
          const normalizedPoints = resolveOrthogonalEdgeReleasePoints(
            finalPointsRef.current,
            lastValidDragRef.current,
            sourcePoint,
            targetPoint,
            sourcePosition,
            targetPosition
          )

          setCustomPoints(normalizedPoints)
          setEdges((eds) =>
            eds.map((e) => {
              if (e.id !== id) return e

              const nextData: Record<string, unknown> = {
                ...e.data,
                points: normalizedPoints,
              }
              if (!isFreeformEdgeAnchor(sourceAnchor) && sourceRect) {
                const pinnedSource = getEdgeAnchorFromPoint(
                  sourceNode?.type,
                  sourcePoint,
                  sourceRect
                )
                if (pinnedSource) nextData.sourceAnchor = pinnedSource
              }
              if (!isFreeformEdgeAnchor(targetAnchor) && targetRect) {
                const pinnedTarget = getEdgeAnchorFromPoint(
                  targetNode?.type,
                  targetPoint,
                  targetRect
                )
                if (pinnedTarget) nextData.targetAnchor = pinnedTarget
              }

              return { ...e, data: nextData }
            })
          )
        }
        draggingHandleRef.current = null
        setDraggingHandle(null)
        teardownPointerGesture()
      }

      activePointerCancelRef.current = handlePointerCancel
      activePointerTeardownRef.current = teardownPointerGesture
      ownerDocument.addEventListener("pointermove", handlePointerMove)
      ownerDocument.addEventListener("pointerup", handlePointerUp)
      ownerDocument.addEventListener("pointercancel", handlePointerCancel)
    },
    [
      activePoints,
      id,
      setEdges,
      allowMidpointDragging,
      screenToFlowPosition,
      setCustomPoints,
      targetPosition,
      sourcePosition,
      adjustedSourceCoordinates.sourceX,
      adjustedSourceCoordinates.sourceY,
      adjustedTargetCoordinates.targetX,
      adjustedTargetCoordinates.targetY,
      sourceAnchor,
      sourceNode?.type,
      sourceRect,
      targetAnchor,
      targetNode?.type,
      targetRect,
    ]
  )

  const { getNodeRect, findFreeformEndpointNode } = useFreeformEndpointNode()

  const handleEndpointPointerDown = useCallback(
    (event: React.PointerEvent<SVGRectElement>, endpoint: EndpointType) => {
      if (!event.isPrimary || event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      activePointerCancelRef.current?.()
      const pointerId = event.pointerId
      const pointerTarget = event.currentTarget
      pointerTarget.setPointerCapture(pointerId)
      endpointDragCommitRef.current = null
      setEndpointPreviewCommit(null)
      setIsTargetEndpointDetached(false)

      const ownerDocument = event.currentTarget.ownerDocument
      const dragBaseline = [...activePoints]
      const currentSourceEndpoint = {
        x: adjustedSourceCoordinates.sourceX,
        y: adjustedSourceCoordinates.sourceY,
      }
      const currentTargetEndpoint = {
        x: adjustedTargetCoordinates.targetX,
        y: adjustedTargetCoordinates.targetY,
      }

      if (dragBaseline.length >= 2) {
        dragBaseline[0] = currentSourceEndpoint
        dragBaseline[dragBaseline.length - 1] = currentTargetEndpoint
      }

      const resolveDragCommit = (clientX: number, clientY: number): EndpointDragCommit | null => {
        const flowPoint = screenToFlowPosition({ x: clientX, y: clientY })
        const intersectingNodes = getIntersectingNodes({
          x: flowPoint.x - FREEFORM_ENDPOINT_SNAP_RADIUS_PX,
          y: flowPoint.y - FREEFORM_ENDPOINT_SNAP_RADIUS_PX,
          width: FREEFORM_ENDPOINT_SNAP_RADIUS_PX * 2,
          height: FREEFORM_ENDPOINT_SNAP_RADIUS_PX * 2,
        })
        const candidates = intersectingNodes.flatMap((node) => {
          const rect = getNodeRect(node)
          return rect ? [{ node, type: node.type, rect }] : []
        })
        const snapTarget =
          pickNearestConnectable(candidates, flowPoint) ?? findFreeformEndpointNode(flowPoint)

        if (!snapTarget) return null

        const { node: nodeOnTop, rect } = snapTarget

        const anchor = getEdgeAnchorFromPoint(nodeOnTop.type, flowPoint, rect)
        if (!anchor) return null
        const resolvedAnchor = getEdgeAnchorPoint(nodeOnTop.type, rect, anchor)
        let sourceEndpoint = currentSourceEndpoint
        let targetEndpoint = currentTargetEndpoint

        if (endpoint === "source") {
          const movingEndpoint = adjustSourceCoordinates(
            resolvedAnchor.point.x,
            resolvedAnchor.point.y,
            resolvedAnchor.position,
            0
          )
          sourceEndpoint = {
            x: movingEndpoint.sourceX,
            y: movingEndpoint.sourceY,
          }
        } else {
          const targetPreviewPadding = getTargetConnectionPointPadding(padding, true)
          const movingEndpoint = adjustTargetCoordinates(
            resolvedAnchor.point.x,
            resolvedAnchor.point.y,
            resolvedAnchor.position,
            targetPreviewPadding
          )
          targetEndpoint = {
            x: movingEndpoint.targetX,
            y: movingEndpoint.targetY,
          }
        }
        const nextSourcePosition = endpoint === "source" ? resolvedAnchor.position : sourcePosition
        const nextTargetPosition = endpoint === "target" ? resolvedAnchor.position : targetPosition
        const nextSourceRect = endpoint === "source" ? rect : (sourceRect ?? rect)
        const nextTargetRect = endpoint === "target" ? rect : (targetRect ?? rect)
        const directPoints = tryFindStraightPath(
          {
            position: { x: nextSourceRect.x, y: nextSourceRect.y },
            width: nextSourceRect.width,
            height: nextSourceRect.height,
            direction: nextSourcePosition,
          },
          {
            position: { x: nextTargetRect.x, y: nextTargetRect.y },
            width: nextTargetRect.width,
            height: nextTargetRect.height,
            direction: nextTargetPosition,
          },
          padding,
          {
            sourceX: sourceEndpoint.x,
            sourceY: sourceEndpoint.y,
            targetX: targetEndpoint.x,
            targetY: targetEndpoint.y,
          }
        )
        const preservedPoints = preserveOrthogonalEdgePoints(
          dragBaseline,
          sourceEndpoint,
          targetEndpoint,
          nextSourcePosition,
          nextTargetPosition
        )
        const committedPoints = normalizeOrthogonalEdgePoints(
          preservedPoints,
          sourceEndpoint,
          targetEndpoint,
          nextSourcePosition,
          nextTargetPosition
        )
        const predictedData = {
          ...data,
          points: hasManualPoints ? committedPoints : [],
        }
        if (endpoint === "source") {
          predictedData.sourceAnchor = anchor
        } else {
          predictedData.targetAnchor = anchor
        }
        const predictedEdge: Edge = {
          id,
          source: endpoint === "source" ? nodeOnTop.id : source,
          target: endpoint === "target" ? nodeOnTop.id : target,
          sourceHandle:
            endpoint === "source"
              ? getSideHandleIdForPosition(resolvedAnchor.position)
              : sourceHandleId,
          targetHandle:
            endpoint === "target"
              ? getSideHandleIdForPosition(resolvedAnchor.position)
              : targetHandleId,
          type,
          data: predictedData,
        }

        return {
          endpoint,
          nodeId: nodeOnTop.id,
          nodeType: nodeOnTop.type,
          handleId: getSideHandleIdForPosition(resolvedAnchor.position),
          anchor,
          sourceEndpoint,
          targetEndpoint,
          sourcePosition: nextSourcePosition,
          targetPosition: nextTargetPosition,
          sourceRect: nextSourceRect,
          targetRect: nextTargetRect,
          committedPoints,
          points: hasManualPoints ? committedPoints : (directPoints ?? committedPoints),
          predictedEdge,
        }
      }

      const handlePointerMove = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return
        const commit = resolveDragCommit(e.clientX, e.clientY)
        endpointDragCommitRef.current = commit
        setEndpointPreviewCommit(commit)
        if (commit) {
          if (endpoint === "target") setIsTargetEndpointDetached(false)
          setDragPreviewPoints(commit.points)
          setDragPreviewPositions({
            sourcePosition: commit.sourcePosition,
            targetPosition: commit.targetPosition,
          })
          return
        }
        const flowPoint = screenToFlowPosition({ x: e.clientX, y: e.clientY })
        const movingIsSource = endpoint === "source"
        setIsTargetEndpointDetached(!movingIsSource)
        const fixedPoint = movingIsSource ? currentTargetEndpoint : currentSourceEndpoint
        const dx = flowPoint.x - fixedPoint.x
        const dy = flowPoint.y - fixedPoint.y
        const movingPosition =
          Math.abs(dx) >= Math.abs(dy)
            ? dx >= 0
              ? Position.Left
              : Position.Right
            : dy >= 0
              ? Position.Top
              : Position.Bottom
        const previewSourcePosition = movingIsSource ? movingPosition : sourcePosition
        const previewTargetPosition = movingIsSource ? targetPosition : movingPosition
        setDragPreviewPoints(
          preserveOrthogonalEdgePoints(
            dragBaseline,
            movingIsSource ? flowPoint : currentSourceEndpoint,
            movingIsSource ? currentTargetEndpoint : flowPoint,
            previewSourcePosition,
            previewTargetPosition
          )
        )
        setDragPreviewPositions({
          sourcePosition: previewSourcePosition,
          targetPosition: previewTargetPosition,
        })
      }

      const teardownPointerGesture = () => {
        ownerDocument.removeEventListener("pointermove", handlePointerMove)
        ownerDocument.removeEventListener("pointerup", handlePointerUp)
        ownerDocument.removeEventListener("pointercancel", handlePointerCancel)
        if (pointerTarget.hasPointerCapture(pointerId))
          pointerTarget.releasePointerCapture(pointerId)
        if (activePointerTeardownRef.current === teardownPointerGesture) {
          activePointerTeardownRef.current = null
          activePointerCancelRef.current = null
        }
      }

      const restoreWithoutCommit = (clearLiveOverride = true) => {
        endpointDragCommitRef.current = null
        setEndpointPreviewCommit(null)
        setDragPreviewPoints(null)
        setDragPreviewPositions(null)
        setIsTargetEndpointDetached(false)
        if (clearLiveOverride) setLiveEdgeOverride(null)
      }

      const handlePointerCancel = (e?: PointerEvent) => {
        if (e && e.pointerId !== pointerId) return
        restoreWithoutCommit()
        teardownPointerGesture()
      }

      const handlePointerUp = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return
        const commit = endpointDragCommitRef.current
        restoreWithoutCommit(commit === null)

        if (commit) {
          const normalizedPoints = hasManualPoints ? commit.committedPoints : null

          if (normalizedPoints) {
            setCustomPoints(normalizedPoints)
          }

          setEdges((edges) =>
            edges.map((edge) => {
              if (edge.id !== id) return edge

              const nextData = {
                ...((edge.data ?? {}) as Record<string, unknown>),
              }
              if (commit.endpoint === "source") {
                nextData.sourceAnchor = commit.anchor
              } else {
                nextData.targetAnchor = commit.anchor
              }
              if (!hasManualPoints) {
                nextData.points = []
              } else if (normalizedPoints) {
                nextData.points = normalizedPoints
              } else if (!Array.isArray(nextData.points)) {
                nextData.points = []
              }

              return commit.endpoint === "source"
                ? {
                    ...edge,
                    source: commit.nodeId,
                    sourceHandle: commit.handleId,
                    data: nextData,
                  }
                : {
                    ...edge,
                    target: commit.nodeId,
                    targetHandle: commit.handleId,
                    data: nextData,
                  }
            })
          )
          setLiveEdgeOverride(null)
        }

        teardownPointerGesture()
      }

      activePointerCancelRef.current = handlePointerCancel
      activePointerTeardownRef.current = teardownPointerGesture
      ownerDocument.addEventListener("pointermove", handlePointerMove)
      ownerDocument.addEventListener("pointerup", handlePointerUp)
      ownerDocument.addEventListener("pointercancel", handlePointerCancel)
    },
    [
      activePoints,
      adjustedSourceCoordinates.sourceX,
      adjustedSourceCoordinates.sourceY,
      adjustedTargetCoordinates.targetX,
      adjustedTargetCoordinates.targetY,
      data,
      findFreeformEndpointNode,
      getIntersectingNodes,
      getNodeRect,
      hasManualPoints,
      id,
      padding,
      screenToFlowPosition,
      setCustomPoints,
      setEdges,
      setLiveEdgeOverride,
      source,
      sourceHandleId,
      sourceRect,
      sourcePosition,
      target,
      targetHandleId,
      targetRect,
      targetPosition,
      type,
    ]
  )

  const sourcePoint = renderPoints[0] || { x: sourceX, y: sourceY }
  const targetPoint = renderPoints[renderPoints.length - 1] || {
    x: targetX,
    y: targetY,
  }

  const toolbarPosition = computeToolbarPosition(pathMiddlePosition, isMiddlePathHorizontal)

  const edgeData: StepPathEdgeData = {
    activePoints,
    pathMiddlePosition,
    toolbarPosition,
    isMiddlePathHorizontal,
    sourcePoint,
    targetPoint,
    nodeRects: nearbyNodeRects,
    midSegmentStart: midSegment.start,
    midSegmentEnd: midSegment.end,
    neighborGeometry,
  }

  return {
    pathRef,
    edgeData,
    currentPath,
    overlayPath,
    bendHandles,
    isBendDragging: draggingHandle !== null,
    draggingHandleSegmentIndex: draggingHandle?.segmentIndex ?? null,
    hasInitialCalculation: true,
    markerEnd,
    markerStart,
    strokeDashArray,
    handlePointerDown,
    handleEndpointPointerDown,
    sourcePoint,
    targetPoint,
    toolbarPosition,
    isDiagramModifiable,
    canEditEndpoint,
    sourcePosition: renderSourcePosition,
    targetPosition: renderTargetPosition,
    targetInterfaceGeometry,
  }
}
