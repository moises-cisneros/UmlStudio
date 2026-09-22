import {
  useState,
  useCallback,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { BaseEdge, Position, useStore } from "@xyflow/react"
import { useDiagramStore } from "@/store/context"
import { ExtendedEdgeProps } from "./EdgeProps"
import { CustomEdgeToolbar } from "@/components"
import { IPoint } from "./Connection"
import { PopoverManager } from "@/components/popovers/PopoverManager"
import { usePopoverAnchor } from "@/hooks/usePopoverAnchor"
import AssessmentIcon from "@/components/svgs/AssessmentIcon"
import { EdgeInlineMarkers, type InterfaceGeometry } from "@/components/svgs/edges/InlineMarker"
import type { DiagramEdgeType } from "./types"
import { Assessment } from "@/typings"
import type { BendHandle } from "@/utils/geometry/bendHandles"
import { getSegmentGhostHandles } from "@/utils/geometry/freeWaypoints"
import { isFreeformEdgeAnchor } from "@/utils/edgeUtils"
import { EDGES } from "@/constants"
import { useLabels } from "@/i18n/useLabels"
import { getHandleScreenScale } from "@/utils/geometry/scalar"

const useHandleScreenScale = (): number =>
  useStore((state) => getHandleScreenScale(state.transform[2]))

export type BaseEdgeProps = ExtendedEdgeProps
const FREEFORM_ENDPOINT_HIT_TARGET_SIZE = 44
const FREEFORM_ENDPOINT_GRIP_LONG_AXIS = 18
const FREEFORM_ENDPOINT_GRIP_MIN_LONG_AXIS = 12
const FREEFORM_ENDPOINT_GRIP_SHORT_AXIS = 8
const FREEFORM_ENDPOINT_GRIP_RADIUS = 4
const FREEFORM_ENDPOINT_GRIP_STROKE = 4
const FREEFORM_ENDPOINT_GRIP_MARGIN = 2

export const useEdgeState = (initialPoints?: IPoint[]) => {
  const [prevInitialPoints, setPrevInitialPoints] = useState(initialPoints)
  const [customPoints, setCustomPoints] = useState<IPoint[]>(() => initialPoints ?? [])

  if (initialPoints !== prevInitialPoints) {
    setPrevInitialPoints(initialPoints)
    if (initialPoints && initialPoints.length > 0) {
      setCustomPoints(initialPoints)
    }
  }

  return {
    customPoints,
    setCustomPoints,
  }
}

type EndpointSide = Position

const getEndpointDirection = (side?: EndpointSide): IPoint => {
  switch (side?.toLowerCase()) {
    case "top":
      return { x: 0, y: -1 }
    case "right":
      return { x: 1, y: 0 }
    case "bottom":
      return { x: 0, y: 1 }
    case "left":
      return { x: -1, y: 0 }
    default:
      return { x: 0, y: 0 }
  }
}

const normalizeDir = (v: IPoint): IPoint => {
  const len = Math.hypot(v.x, v.y)
  return len === 0 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len }
}

const getEndpointRun = (point: IPoint, otherPoint: IPoint, direction: IPoint): number => {
  const toOther = { x: otherPoint.x - point.x, y: otherPoint.y - point.y }
  const towardsOther = direction.x * toOther.x + direction.y * toOther.y
  if (towardsOther <= 0) return Number.POSITIVE_INFINITY

  return Math.hypot(toOther.x, toOther.y) / 2
}

const renderedBendHandleHalfLength = (bendableLength: number, screenScale: number): number => {
  const room = bendableLength - 2 * EDGES.BEND_HANDLE_CORNER_CLEARANCE_PX * screenScale
  const longAxis = Math.min(
    Math.max(room, EDGES.BEND_HANDLE_MIN_SCREEN_LENGTH_PX * screenScale),
    EDGES.BEND_HANDLE_SCREEN_LENGTH_PX * screenScale
  )
  return longAxis / 2
}

const nearestHandleReach = (
  bendHandles: BendHandle[] | undefined,
  endpoint: IPoint,
  direction: IPoint,
  screenScale: number
): number => {
  if (!bendHandles || bendHandles.length === 0) return Number.POSITIVE_INFINITY
  const gap = EDGES.ENDPOINT_HANDLE_CLEARANCE_PX * screenScale
  let reach = Number.POSITIVE_INFINITY
  for (const handle of bendHandles) {
    const along =
      (handle.position.x - endpoint.x) * direction.x +
      (handle.position.y - endpoint.y) * direction.y
    if (along <= 0) continue
    const nearEdge = along - renderedBendHandleHalfLength(handle.bendableLength, screenScale) - gap
    if (nearEdge > 0) reach = Math.min(reach, nearEdge)
  }
  return reach
}

export const getEndpointHitTargetRect = (
  point: IPoint,
  side?: EndpointSide,
  screenScale = 1,
  hitTargetSize: number = EDGES.ENDPOINT_HIT_TARGET_SIZE,
  outwardDir?: IPoint,
  run: number = Number.POSITIVE_INFINITY,
  nodeGap = 0
) => {
  const direction = outwardDir ? normalizeDir(outwardDir) : getEndpointDirection(side)
  const hitSize = Math.max(
    Math.min(hitTargetSize * screenScale, run),
    EDGES.MIN_ENDPOINT_HIT_TARGET_PX * screenScale
  )
  const hitOffset = hitSize / 2
  const centreOffset = hitOffset + nodeGap

  return {
    x: point.x + direction.x * centreOffset - hitOffset,
    y: point.y + direction.y * centreOffset - hitOffset,
    width: hitSize,
    height: hitSize,
    radius: hitOffset,
  }
}

const getEndpointGripRect = (
  point: IPoint,
  side?: EndpointSide,
  screenScale = 1,
  outwardDir?: IPoint,
  run: number = Number.POSITIVE_INFINITY
) => {
  const radius = FREEFORM_ENDPOINT_GRIP_RADIUS * screenScale
  const short = FREEFORM_ENDPOINT_GRIP_SHORT_AXIS * screenScale
  const margin = FREEFORM_ENDPOINT_GRIP_MARGIN * screenScale
  const long = Math.max(
    Math.min(FREEFORM_ENDPOINT_GRIP_LONG_AXIS * screenScale, run - margin),
    FREEFORM_ENDPOINT_GRIP_MIN_LONG_AXIS * screenScale
  )
  const baseClearance = long / 2 + radius
  const clearance = Math.max(Math.min(baseClearance, run - long / 2 - margin), long / 2)

  if (outwardDir) {
    const dir = normalizeDir(outwardDir)
    const cx = point.x + dir.x * clearance
    const cy = point.y + dir.y * clearance
    return {
      x: cx - long / 2,
      y: cy - short / 2,
      width: long,
      height: short,
      radius,
      rotationDeg: (Math.atan2(dir.y, dir.x) * 180) / Math.PI,
      centerX: cx,
      centerY: cy,
    }
  }

  const isHorizontalGrip = side === Position.Left || side === Position.Right
  const width = isHorizontalGrip ? long : short
  const height = isHorizontalGrip ? short : long
  const dir = getEndpointDirection(side)
  const cx = point.x + dir.x * clearance
  const cy = point.y + dir.y * clearance
  return {
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
    radius,
    rotationDeg: 0,
    centerX: cx,
    centerY: cy,
  }
}

export const EdgeEndpointMarkers = ({
  sourcePoint,
  targetPoint,
  sourcePosition,
  targetPosition,
  isDiagramModifiable,
  canEditEndpoint = true,
  onEndpointPointerDown,
  straight = false,
  bendHandles,
  sourceNeighbor,
  targetNeighbor,
}: {
  sourcePoint: IPoint
  targetPoint: IPoint
  sourcePosition?: EndpointSide
  targetPosition?: EndpointSide
  isDiagramModifiable: boolean
  canEditEndpoint?: boolean
  onEndpointPointerDown?: (
    event: ReactPointerEvent<SVGRectElement>,
    endpoint: "source" | "target"
  ) => void
  straight?: boolean
  bendHandles?: BendHandle[]
  sourceNeighbor?: IPoint
  targetNeighbor?: IPoint
}) => {
  const screenScale = useHandleScreenScale()

  if (!isDiagramModifiable) {
    return null
  }
  const sourceAnchorNeighbor = sourceNeighbor ?? targetPoint
  const targetAnchorNeighbor = targetNeighbor ?? sourcePoint
  const sourceOutward = straight
    ? {
        x: sourceAnchorNeighbor.x - sourcePoint.x,
        y: sourceAnchorNeighbor.y - sourcePoint.y,
      }
    : undefined
  const targetOutward = straight
    ? {
        x: targetAnchorNeighbor.x - targetPoint.x,
        y: targetAnchorNeighbor.y - targetPoint.y,
      }
    : undefined
  const sourceDir = sourceOutward
    ? normalizeDir(sourceOutward)
    : getEndpointDirection(sourcePosition)
  const targetDir = targetOutward
    ? normalizeDir(targetOutward)
    : getEndpointDirection(targetPosition)
  const sourceRun = Math.min(
    getEndpointRun(sourcePoint, targetPoint, sourceDir),
    nearestHandleReach(bendHandles, sourcePoint, sourceDir, screenScale)
  )
  const targetRun = Math.min(
    getEndpointRun(targetPoint, sourcePoint, targetDir),
    nearestHandleReach(bendHandles, targetPoint, targetDir, screenScale)
  )
  const sourceHitTarget = getEndpointHitTargetRect(
    sourcePoint,
    sourcePosition,
    screenScale,
    onEndpointPointerDown ? FREEFORM_ENDPOINT_HIT_TARGET_SIZE : undefined,
    sourceOutward,
    sourceRun,
    straight && onEndpointPointerDown ? 10 * screenScale : 0
  )
  const targetHitTarget = getEndpointHitTargetRect(
    targetPoint,
    targetPosition,
    screenScale,
    onEndpointPointerDown ? FREEFORM_ENDPOINT_HIT_TARGET_SIZE : undefined,
    targetOutward,
    targetRun,
    straight && onEndpointPointerDown ? 10 * screenScale : 0
  )
  const className = [
    "edge-endpoint-handle",
    canEditEndpoint ? "" : "edge-endpoint-handle--disabled",
  ]
    .filter(Boolean)
    .join(" ")
  const showEndpointGrips = Boolean(onEndpointPointerDown)
  const sourceGripRun = getEndpointRun(sourcePoint, targetPoint, sourceDir)
  const targetGripRun = getEndpointRun(targetPoint, sourcePoint, targetDir)
  const sourceGrip = getEndpointGripRect(
    sourcePoint,
    sourcePosition,
    screenScale,
    sourceOutward,
    sourceGripRun
  )
  const targetGrip = getEndpointGripRect(
    targetPoint,
    targetPosition,
    screenScale,
    targetOutward,
    targetGripRun
  )

  return (
    <>
      {showEndpointGrips && (
        <>
          <rect
            className="edge-circle edge-endpoint-grip edge-endpoint-grip--source"
            x={sourceGrip.x}
            y={sourceGrip.y}
            width={sourceGrip.width}
            height={sourceGrip.height}
            rx={sourceGrip.radius}
            ry={sourceGrip.radius}
            transform={`rotate(${sourceGrip.rotationDeg} ${sourceGrip.centerX} ${sourceGrip.centerY})`}
            style={{ strokeWidth: FREEFORM_ENDPOINT_GRIP_STROKE * screenScale }}
            pointerEvents="none"
          />
          <rect
            className="edge-circle edge-endpoint-grip edge-endpoint-grip--target"
            x={targetGrip.x}
            y={targetGrip.y}
            width={targetGrip.width}
            height={targetGrip.height}
            rx={targetGrip.radius}
            ry={targetGrip.radius}
            transform={`rotate(${targetGrip.rotationDeg} ${targetGrip.centerX} ${targetGrip.centerY})`}
            style={{ strokeWidth: FREEFORM_ENDPOINT_GRIP_STROKE * screenScale }}
            pointerEvents="none"
          />
        </>
      )}
      <rect
        className={`${className} edge-endpoint-handle--source`}
        x={sourceHitTarget.x}
        y={sourceHitTarget.y}
        width={sourceHitTarget.width}
        height={sourceHitTarget.height}
        rx={sourceHitTarget.radius}
        ry={sourceHitTarget.radius}
        style={{ zIndex: 10000 }}
        pointerEvents={canEditEndpoint && onEndpointPointerDown ? "all" : "none"}
        onPointerDown={
          canEditEndpoint && onEndpointPointerDown
            ? (event) => onEndpointPointerDown(event, "source")
            : undefined
        }
      />
      <rect
        className={`${className} edge-endpoint-handle--target`}
        x={targetHitTarget.x}
        y={targetHitTarget.y}
        width={targetHitTarget.width}
        height={targetHitTarget.height}
        rx={targetHitTarget.radius}
        ry={targetHitTarget.radius}
        style={{ zIndex: 10000 }}
        pointerEvents={canEditEndpoint && onEndpointPointerDown ? "all" : "none"}
        onPointerDown={
          canEditEndpoint && onEndpointPointerDown
            ? (event) => onEndpointPointerDown(event, "target")
            : undefined
        }
      />
    </>
  )
}

export const EdgeBendHandle = ({
  id,
  segmentIndex,
  position,
  orientation,
  bendableLength,
  onPointerDown,
}: {
  id: string
  segmentIndex: number
  position: IPoint
  orientation: "H" | "V"
  bendableLength: number
  onPointerDown: (e: ReactPointerEvent<SVGRectElement>) => void
}) => {
  const screenScale = useHandleScreenScale()
  const longAxis = 2 * renderedBendHandleHalfLength(bendableLength, screenScale)
  const shortAxis = 10 * screenScale
  const width = orientation === "H" ? longAxis : shortAxis
  const height = orientation === "H" ? shortAxis : longAxis

  return (
    <rect
      className="edge-circle edge-bend-handle"
      pointerEvents="all"
      key={`${id}-bend-${segmentIndex}`}
      x={position.x - width / 2}
      y={position.y - height / 2}
      width={width}
      height={height}
      rx={6 * screenScale}
      ry={6 * screenScale}
      style={{
        cursor: orientation === "H" ? "ns-resize" : "ew-resize",
        zIndex: 9999,
      }}
      onPointerDown={onPointerDown}
    />
  )
}

export const EdgeWaypointHandles = ({
  route,
  interior,
  selectedWaypointIndex,
  onWaypointPointerDown,
  onWaypointDoubleClick,
  onWaypointKeyDown,
  onGhostPointerDown,
}: {
  route: IPoint[]
  interior: IPoint[]
  selectedWaypointIndex: number | null
  onWaypointPointerDown: (event: ReactPointerEvent<SVGRectElement>, index: number) => void
  onWaypointDoubleClick: (index: number) => void
  onWaypointKeyDown: (event: ReactKeyboardEvent<SVGRectElement>, index: number) => void
  onGhostPointerDown: (event: ReactPointerEvent<SVGRectElement>, segmentIndex: number) => void
}) => {
  const t = useLabels()
  const screenScale = useHandleScreenScale()
  const midpoints =
    selectedWaypointIndex === null
      ? getSegmentGhostHandles(route, EDGES.WAYPOINT_GHOST_MIN_SEGMENT_PX * screenScale)
      : []
  const hit = EDGES.WAYPOINT_HIT_TARGET_PX * screenScale
  const radius = EDGES.WAYPOINT_HANDLE_RADIUS_PX * screenScale

  const point = (
    centre: IPoint,
    className: string,
    key: string,
    onPointerDown: (event: ReactPointerEvent<SVGRectElement>) => void,
    accessibleName?: string,
    onDoubleClick?: () => void,
    onKeyDown?: (event: ReactKeyboardEvent<SVGRectElement>) => void
  ) => (
    <g key={key}>
      <circle
        className={className}
        cx={centre.x}
        cy={centre.y}
        r={radius}
        style={{ strokeWidth: FREEFORM_ENDPOINT_GRIP_STROKE * screenScale }}
        pointerEvents="none"
      />
      <rect
        className="edge-waypoint-hit-target"
        x={centre.x - hit / 2}
        y={centre.y - hit / 2}
        width={hit}
        height={hit}
        rx={hit / 2}
        ry={hit / 2}
        pointerEvents="all"
        tabIndex={onKeyDown && accessibleName ? 0 : undefined}
        role={onKeyDown && accessibleName ? "button" : undefined}
        aria-label={onKeyDown ? accessibleName : undefined}
        style={{ cursor: "grab", fill: "transparent", zIndex: 10001 }}
        onPointerDown={onPointerDown}
        onDoubleClick={(event) => {
          if (!onDoubleClick) return
          event.preventDefault()
          event.stopPropagation()
          onDoubleClick()
        }}
        onKeyDown={onKeyDown}
      />
    </g>
  )

  return (
    <>
      {midpoints.map((midpoint) =>
        point(
          midpoint.position,
          "edge-circle edge-waypoint-handle edge-waypoint-handle--proposed",
          `midpoint-${midpoint.segmentIndex}`,
          (event) => onGhostPointerDown(event, midpoint.segmentIndex)
        )
      )}
      {interior.map((waypoint, index) =>
        point(
          waypoint,
          "edge-circle edge-waypoint-handle" +
            (selectedWaypointIndex === index ? " edge-waypoint-handle--active" : ""),
          `waypoint-${index}`,
          (event) => onWaypointPointerDown(event, index),
          t.moveEdgeWaypoint,
          () => onWaypointDoubleClick(index),
          (event) => onWaypointKeyDown(event, index)
        )
      )}
    </>
  )
}

export const StepEdgeBody = ({
  id,
  markerKey,
  currentPath,
  overlayPath,
  pathRef,
  strokeColor,
  strokeDashArray,
  hasInitialCalculation,
  isBendDragging,
  draggingHandleSegmentIndex,
  markerStart,
  markerEnd,
  targetInterfaceGeometry,
  sourcePoint,
  targetPoint,
  sourcePosition,
  targetPosition,
  isDiagramModifiable,
  canEditEndpoint,
  handleEndpointPointerDown,
  allowMidpointDragging,
  bendHandles,
  handlePointerDown,
  children,
}: {
  id: string
  markerKey: string
  currentPath: string
  overlayPath: string
  pathRef: React.Ref<SVGPathElement>
  strokeColor: string
  strokeDashArray?: string
  hasInitialCalculation: boolean
  isBendDragging: boolean
  draggingHandleSegmentIndex: number | null
  markerStart?: string
  markerEnd?: string
  targetInterfaceGeometry?: InterfaceGeometry
  sourcePoint: IPoint
  targetPoint: IPoint
  sourcePosition?: Position
  targetPosition?: Position
  isDiagramModifiable: boolean
  canEditEndpoint: boolean
  handleEndpointPointerDown?: (
    event: ReactPointerEvent<SVGRectElement>,
    endpoint: "source" | "target"
  ) => void
  allowMidpointDragging: boolean
  bendHandles: BendHandle[]
  handlePointerDown: (event: ReactPointerEvent<SVGRectElement>, handle: BendHandle) => void
  children?: ReactNode
}) => {
  return (
    <g className="edge-container">
      <BaseEdge
        key={markerKey}
        id={id}
        path={currentPath}
        pointerEvents={isDiagramModifiable ? "none" : "stroke"}
        interactionWidth={isDiagramModifiable ? 0 : 32}
        style={{
          stroke: strokeColor,
          strokeDasharray: strokeDashArray,
          transition: hasInitialCalculation ? "opacity 0.1s ease-in" : "none",
          opacity: 1,
        }}
      />

      <EdgeInlineMarkers
        pathD={currentPath}
        markerEnd={markerEnd}
        markerStart={markerStart}
        strokeColor={strokeColor}
        targetInterfaceGeometry={targetInterfaceGeometry}
      />

      <path
        ref={pathRef}
        className="edge-overlay"
        d={overlayPath}
        fill="none"
        strokeWidth={EDGES.EDGE_HIGHLIGHT_STROKE_WIDTH}
        pointerEvents="stroke"
        style={{ opacity: isBendDragging ? 0 : 0.4 }}
      />

      {isDiagramModifiable &&
        allowMidpointDragging &&
        bendHandles
          .filter((handle) => !isBendDragging || handle.segmentIndex === draggingHandleSegmentIndex)
          .map((handle) => (
            <EdgeBendHandle
              key={`${id}-bend-${handle.segmentIndex}`}
              id={id}
              segmentIndex={handle.segmentIndex}
              position={handle.position}
              orientation={handle.orientation}
              bendableLength={handle.bendableLength}
              onPointerDown={(e) => handlePointerDown(e, handle)}
            />
          ))}

      <EdgeEndpointMarkers
        sourcePoint={sourcePoint}
        targetPoint={targetPoint}
        sourcePosition={sourcePosition}
        targetPosition={targetPosition}
        isDiagramModifiable={isDiagramModifiable}
        canEditEndpoint={canEditEndpoint}
        onEndpointPointerDown={handleEndpointPointerDown}
        bendHandles={bendHandles}
      />

      {children}
    </g>
  )
}

export const CommonEdgeElements = ({
  id,
  data,
  pathMiddlePosition,
  toolbarPosition,
  isDiagramModifiable,
  assessments,
  handleDelete,
  setPopOverElementId,
  type,
}: {
  id: string
  data: BaseEdgeProps["data"]
  pathMiddlePosition: IPoint
  toolbarPosition?: IPoint
  isDiagramModifiable: boolean
  assessments: Record<string, Assessment>
  handleDelete: () => void
  setPopOverElementId: (id: string) => void
  type: string
}) => {
  const nodeScore = assessments[id]?.score
  const uiPosition = toolbarPosition ?? pathMiddlePosition
  const assessmentPosition = pathMiddlePosition
  const [anchorEl, anchorRef] = usePopoverAnchor<HTMLDivElement>()

  const setEdges = useDiagramStore((state) => state.setEdges)
  const points = data?.points
  const hasManualPoints = Array.isArray(points) && points.length > 0
  const hasPinnedAnchor =
    isFreeformEdgeAnchor(data?.sourceAnchor) || isFreeformEdgeAnchor(data?.targetAnchor)
  const hasManualRoute = hasManualPoints || hasPinnedAnchor

  const handleResetRouting = useCallback(() => {
    setEdges((edges) =>
      edges.map((edge) => {
        if (edge.id !== id) return edge
        const nextData = { ...(edge.data ?? {}) } as Record<string, unknown>
        nextData.points = []
        delete nextData.sourceAnchor
        delete nextData.targetAnchor
        return { ...edge, data: nextData }
      })
    )
  }, [id, setEdges])

  return (
    <>
      <CustomEdgeToolbar
        edgeId={id}
        anchorRef={anchorRef}
        position={isDiagramModifiable ? uiPosition : assessmentPosition}
        onEditClick={() => setPopOverElementId(id)}
        onDeleteClick={handleDelete}
        canResetRouting={isDiagramModifiable && hasManualRoute}
        onResetRoutingClick={handleResetRouting}
      />

      {!isDiagramModifiable && (
        <AssessmentIcon
          x={assessmentPosition.x - 15}
          y={assessmentPosition.y - 15}
          score={nodeScore}
        />
      )}

      <PopoverManager elementId={id} anchorEl={anchorEl} type={type as DiagramEdgeType} />
    </>
  )
}
