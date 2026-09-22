import { AssessmentSelectableWrapper } from "@/components/wrapper/AssessmentSelectableWrapper"
import { FeedbackDropzone } from "@/components/wrapper/FeedbackDropzone"
import { useDiagramModifiable } from "@/hooks/useDiagramModifiable"
import { useMetadataStore } from "@/store/context"
import {
  getAxisHandlePlan,
  getDistributedHandleOffsetPercents,
  getDistributedHandleOffsets,
  reduceVisibleArcCountForZoom,
} from "@/utils"
import {
  Handle,
  Position,
  useNodeConnections,
  useStore,
  useUpdateNodeInternals,
} from "@xyflow/react"
import { type CSSProperties, useEffect, useMemo } from "react"
import { useShallow } from "zustand/shallow"

export enum HandleId {
  TopLeft = "top-left",
  TopBetweenLeftMidLeft = "top-between-left-mid-left",
  TopMidLeft = "top-mid-left",
  TopBetweenMidLeftCenter = "top-between-mid-left-center",
  Top = "top",
  TopBetweenCenterMidRight = "top-between-center-mid-right",
  TopMidRight = "top-mid-right",
  TopBetweenMidRightRight = "top-between-mid-right-right",
  TopRight = "top-right",
  RightTop = "right-top",
  RightBetweenTopMidTop = "right-between-top-mid-top",
  RightMidTop = "right-mid-top",
  RightBetweenMidTopCenter = "right-between-mid-top-center",
  Right = "right",
  RightBetweenCenterMidBottom = "right-between-center-mid-bottom",
  RightMidBottom = "right-mid-bottom",
  RightBetweenMidBottomBottom = "right-between-mid-bottom-bottom",
  RightBottom = "right-bottom",
  BottomRight = "bottom-right",
  BottomBetweenRightMidRight = "bottom-between-right-mid-right",
  BottomMidRight = "bottom-mid-right",
  BottomBetweenMidRightCenter = "bottom-between-mid-right-center",
  Bottom = "bottom",
  BottomBetweenCenterMidLeft = "bottom-between-center-mid-left",
  BottomMidLeft = "bottom-mid-left",
  BottomBetweenMidLeftLeft = "bottom-between-mid-left-left",
  BottomLeft = "bottom-left",
  LeftBottom = "left-bottom",
  LeftBetweenBottomMidBottom = "left-between-bottom-mid-bottom",
  LeftMidBottom = "left-mid-bottom",
  LeftBetweenMidBottomCenter = "left-between-mid-bottom-center",
  Left = "left",
  LeftBetweenCenterMidTop = "left-between-center-mid-top",
  LeftMidTop = "left-mid-top",
  LeftBetweenMidTopTop = "left-between-mid-top-top",
  LeftTop = "left-top",
}

export const FOUR_WAY_HANDLES_PRESET: HandleId[] = [
  HandleId.TopLeft,
  HandleId.TopBetweenLeftMidLeft,
  HandleId.TopMidLeft,
  HandleId.TopBetweenMidLeftCenter,
  HandleId.TopBetweenCenterMidRight,
  HandleId.TopMidRight,
  HandleId.TopBetweenMidRightRight,
  HandleId.TopRight,
  HandleId.RightTop,
  HandleId.RightBetweenTopMidTop,
  HandleId.RightMidTop,
  HandleId.RightBetweenMidTopCenter,
  HandleId.RightBetweenCenterMidBottom,
  HandleId.RightMidBottom,
  HandleId.RightBetweenMidBottomBottom,
  HandleId.RightBottom,
  HandleId.BottomRight,
  HandleId.BottomBetweenRightMidRight,
  HandleId.BottomMidRight,
  HandleId.BottomBetweenMidRightCenter,
  HandleId.BottomBetweenCenterMidLeft,
  HandleId.BottomMidLeft,
  HandleId.BottomBetweenMidLeftLeft,
  HandleId.BottomLeft,
  HandleId.LeftBottom,
  HandleId.LeftBetweenBottomMidBottom,
  HandleId.LeftMidBottom,
  HandleId.LeftBetweenMidBottomCenter,
  HandleId.LeftBetweenCenterMidTop,
  HandleId.LeftMidTop,
  HandleId.LeftBetweenMidTopTop,
  HandleId.LeftTop,
]

interface Props {
  children: React.ReactNode
  width?: number
  height?: number
  elementId: string
  hiddenHandles?: HandleId[] | true
  connectionTopInset?: number
  isConnectableEnd?: boolean
}

export function DefaultNodeWrapper({
  elementId,
  children,
  hiddenHandles = [],
  isConnectableEnd = true,
  connectionTopInset = 0,
}: Props) {
  const { nodeType, nodeWidth, nodeHeight } = useStore(
    useShallow((s) => {
      const n = s.nodeLookup.get(elementId)
      return {
        nodeType: n?.type,
        nodeWidth: n?.width ?? 0,
        nodeHeight: n?.height ?? 0,
      }
    })
  )
  const isDiagramModifiable = useDiagramModifiable()
  const connections = useNodeConnections({ id: elementId })
  const connectedHandleIds = useMemo(() => {
    const ids = new Set<string>()
    for (const connection of connections) {
      if (connection.source === elementId && connection.sourceHandle)
        ids.add(connection.sourceHandle)
      if (connection.target === elementId && connection.targetHandle)
        ids.add(connection.targetHandle)
    }
    return ids
  }, [connections, elementId])

  const updateNodeInternals = useUpdateNodeInternals()
  useEffect(() => {
    updateNodeInternals(elementId)
  }, [connectedHandleIds, elementId, updateNodeInternals])
  const {
    connectionGuidanceActive,
    connectionGuidanceSourceNodeId,
    connectionGuidanceSourceHandleId,
  } = useMetadataStore(
    useShallow((state) => ({
      connectionGuidanceActive: state.connectionGuidanceActive,
      connectionGuidanceSourceNodeId: state.connectionGuidanceSourceNodeId,
      connectionGuidanceSourceHandleId: state.connectionGuidanceSourceHandleId,
    }))
  )

  const baseHandleStyle = {
    width: 8,
    height: 8,
    position: "absolute" as const,
    backgroundColor: "transparent",
    border: "none",
    zIndex: 10,
    overflow: "visible",
    boxSizing: "border-box" as const,
  } as CSSProperties

  const [xs0, xs1, xs2, xs3, xs4, xs5, xs6, xs7, xs8] = useMemo(
    () => getDistributedHandleOffsetPercents(nodeWidth),
    [nodeWidth]
  )
  const safeConnectionTopInset = Math.min(Math.max(connectionTopInset, 0), nodeHeight)
  const connectionHeight = Math.max(0, nodeHeight - safeConnectionTopInset)
  const [ys0, ys1, ys2, ys3, ys4, ys5, ys6, ys7, ys8] = useMemo(
    () =>
      getDistributedHandleOffsets(connectionHeight).map(
        (offset) => safeConnectionTopInset + offset
      ),
    [connectionHeight, safeConnectionTopInset]
  )

  const widthPlan = useMemo(() => getAxisHandlePlan(nodeWidth), [nodeWidth])
  const widthArcs = useStore((state) =>
    reduceVisibleArcCountForZoom(widthPlan.offsets, widthPlan.visibleArcCount, state.transform[2])
  )
  const heightPlan = useMemo(() => getAxisHandlePlan(connectionHeight), [connectionHeight])
  const heightArcs = useStore((state) =>
    reduceVisibleArcCountForZoom(heightPlan.offsets, heightPlan.visibleArcCount, state.transform[2])
  )

  const hiddenHandleSet = useMemo(
    () => (hiddenHandles === true ? null : new Set<string>(hiddenHandles)),
    [hiddenHandles]
  )

  const isHandleHiddenByProp = (id: HandleId): boolean =>
    hiddenHandleSet !== null && hiddenHandleSet.has(id)

  const middleArcForced = (cornerA: HandleId, cornerB: HandleId): boolean =>
    isHandleHiddenByProp(cornerA) && isHandleHiddenByProp(cornerB)

  const arcClass = (side: "top" | "right" | "bottom" | "left"): string =>
    `umlstudio-arc-handle umlstudio-arc-handle--${side}`

  const makeArcClass = (
    side: "top" | "right" | "bottom" | "left",
    handleId: HandleId,
    isVisible: boolean,
    forceMiddle = false
  ): string | undefined => {
    if (isHandleHiddenByProp(handleId)) return undefined
    if (isVisible || forceMiddle) return arcClass(side)
    return undefined
  }

  const topMiddleForce = middleArcForced(HandleId.TopLeft, HandleId.TopRight)
  const bottomMiddleForce = middleArcForced(HandleId.BottomLeft, HandleId.BottomRight)
  const leftMiddleForce = middleArcForced(HandleId.LeftTop, HandleId.LeftBottom)
  const rightMiddleForce = middleArcForced(HandleId.RightTop, HandleId.RightBottom)

  const showMiddleArc = (axisArcs: 1 | 3 | 5): boolean => axisArcs >= 1
  const showCornerArc = (axisArcs: 1 | 3 | 5): boolean => axisArcs >= 3
  const showMidCornerArc = (axisArcs: 1 | 3 | 5): boolean => axisArcs === 5

  const handles = [
    {
      id: HandleId.TopLeft,
      position: Position.Top,
      className: makeArcClass("top", HandleId.TopLeft, showCornerArc(widthArcs)),
      style: { ...baseHandleStyle, left: xs0, top: safeConnectionTopInset },
    },
    {
      id: HandleId.TopBetweenLeftMidLeft,
      position: Position.Top,
      style: { ...baseHandleStyle, left: xs1, top: safeConnectionTopInset },
    },
    {
      id: HandleId.TopMidLeft,
      position: Position.Top,
      className: makeArcClass("top", HandleId.TopMidLeft, showMidCornerArc(widthArcs)),
      style: { ...baseHandleStyle, left: xs2, top: safeConnectionTopInset },
    },
    {
      id: HandleId.TopBetweenMidLeftCenter,
      position: Position.Top,
      style: { ...baseHandleStyle, left: xs3, top: safeConnectionTopInset },
    },
    {
      id: HandleId.Top,
      position: Position.Top,
      className: makeArcClass("top", HandleId.Top, showMiddleArc(widthArcs), topMiddleForce),
      style: { ...baseHandleStyle, left: xs4, top: safeConnectionTopInset },
    },
    {
      id: HandleId.TopBetweenCenterMidRight,
      position: Position.Top,
      style: { ...baseHandleStyle, left: xs5, top: safeConnectionTopInset },
    },
    {
      id: HandleId.TopMidRight,
      position: Position.Top,
      className: makeArcClass("top", HandleId.TopMidRight, showMidCornerArc(widthArcs)),
      style: { ...baseHandleStyle, left: xs6, top: safeConnectionTopInset },
    },
    {
      id: HandleId.TopBetweenMidRightRight,
      position: Position.Top,
      style: { ...baseHandleStyle, left: xs7, top: safeConnectionTopInset },
    },
    {
      id: HandleId.TopRight,
      position: Position.Top,
      className: makeArcClass("top", HandleId.TopRight, showCornerArc(widthArcs)),
      style: { ...baseHandleStyle, left: xs8, top: safeConnectionTopInset },
    },
    {
      id: HandleId.RightTop,
      position: Position.Right,
      className: makeArcClass("right", HandleId.RightTop, showCornerArc(heightArcs)),
      style: { ...baseHandleStyle, top: ys0 },
    },
    {
      id: HandleId.RightBetweenTopMidTop,
      position: Position.Right,
      style: { ...baseHandleStyle, top: ys1 },
    },
    {
      id: HandleId.RightMidTop,
      position: Position.Right,
      className: makeArcClass("right", HandleId.RightMidTop, showMidCornerArc(heightArcs)),
      style: { ...baseHandleStyle, top: ys2 },
    },
    {
      id: HandleId.RightBetweenMidTopCenter,
      position: Position.Right,
      style: { ...baseHandleStyle, top: ys3 },
    },
    {
      id: HandleId.Right,
      position: Position.Right,
      className: makeArcClass("right", HandleId.Right, showMiddleArc(heightArcs), rightMiddleForce),
      style: { ...baseHandleStyle, top: ys4 },
    },
    {
      id: HandleId.RightBetweenCenterMidBottom,
      position: Position.Right,
      style: { ...baseHandleStyle, top: ys5 },
    },
    {
      id: HandleId.RightMidBottom,
      position: Position.Right,
      className: makeArcClass("right", HandleId.RightMidBottom, showMidCornerArc(heightArcs)),
      style: { ...baseHandleStyle, top: ys6 },
    },
    {
      id: HandleId.RightBetweenMidBottomBottom,
      position: Position.Right,
      style: { ...baseHandleStyle, top: ys7 },
    },
    {
      id: HandleId.RightBottom,
      position: Position.Right,
      className: makeArcClass("right", HandleId.RightBottom, showCornerArc(heightArcs)),
      style: { ...baseHandleStyle, top: ys8 },
    },
    {
      id: HandleId.BottomRight,
      position: Position.Bottom,
      className: makeArcClass("bottom", HandleId.BottomRight, showCornerArc(widthArcs)),
      style: { ...baseHandleStyle, left: xs8 },
    },
    {
      id: HandleId.BottomBetweenRightMidRight,
      position: Position.Bottom,
      style: { ...baseHandleStyle, left: xs7 },
    },
    {
      id: HandleId.BottomMidRight,
      position: Position.Bottom,
      className: makeArcClass("bottom", HandleId.BottomMidRight, showMidCornerArc(widthArcs)),
      style: { ...baseHandleStyle, left: xs6 },
    },
    {
      id: HandleId.BottomBetweenMidRightCenter,
      position: Position.Bottom,
      style: { ...baseHandleStyle, left: xs5 },
    },
    {
      id: HandleId.Bottom,
      position: Position.Bottom,
      className: makeArcClass(
        "bottom",
        HandleId.Bottom,
        showMiddleArc(widthArcs),
        bottomMiddleForce
      ),
      style: { ...baseHandleStyle, left: xs4 },
    },
    {
      id: HandleId.BottomBetweenCenterMidLeft,
      position: Position.Bottom,
      style: { ...baseHandleStyle, left: xs3 },
    },
    {
      id: HandleId.BottomMidLeft,
      position: Position.Bottom,
      className: makeArcClass("bottom", HandleId.BottomMidLeft, showMidCornerArc(widthArcs)),
      style: { ...baseHandleStyle, left: xs2 },
    },
    {
      id: HandleId.BottomBetweenMidLeftLeft,
      position: Position.Bottom,
      style: { ...baseHandleStyle, left: xs1 },
    },
    {
      id: HandleId.BottomLeft,
      position: Position.Bottom,
      className: makeArcClass("bottom", HandleId.BottomLeft, showCornerArc(widthArcs)),
      style: { ...baseHandleStyle, left: xs0 },
    },
    {
      id: HandleId.LeftBottom,
      position: Position.Left,
      className: makeArcClass("left", HandleId.LeftBottom, showCornerArc(heightArcs)),
      style: { ...baseHandleStyle, top: ys8 },
    },
    {
      id: HandleId.LeftBetweenBottomMidBottom,
      position: Position.Left,
      style: { ...baseHandleStyle, top: ys7 },
    },
    {
      id: HandleId.LeftMidBottom,
      position: Position.Left,
      className: makeArcClass("left", HandleId.LeftMidBottom, showMidCornerArc(heightArcs)),
      style: { ...baseHandleStyle, top: ys6 },
    },
    {
      id: HandleId.LeftBetweenMidBottomCenter,
      position: Position.Left,
      style: { ...baseHandleStyle, top: ys5 },
    },
    {
      id: HandleId.Left,
      position: Position.Left,
      className: makeArcClass("left", HandleId.Left, showMiddleArc(heightArcs), leftMiddleForce),
      style: { ...baseHandleStyle, top: ys4 },
    },
    {
      id: HandleId.LeftBetweenCenterMidTop,
      position: Position.Left,
      style: { ...baseHandleStyle, top: ys3 },
    },
    {
      id: HandleId.LeftMidTop,
      position: Position.Left,
      className: makeArcClass("left", HandleId.LeftMidTop, showMidCornerArc(heightArcs)),
      style: { ...baseHandleStyle, top: ys2 },
    },
    {
      id: HandleId.LeftBetweenMidTopTop,
      position: Position.Left,
      style: { ...baseHandleStyle, top: ys1 },
    },
    {
      id: HandleId.LeftTop,
      position: Position.Left,
      className: makeArcClass("left", HandleId.LeftTop, showCornerArc(heightArcs)),
      style: { ...baseHandleStyle, top: ys0 },
    },
  ]

  const visibleHandleIds = new Set<HandleId>()
  for (const handle of handles) {
    if (handle.className) visibleHandleIds.add(handle.id)
  }

  return (
    <AssessmentSelectableWrapper elementId={elementId}>
      <FeedbackDropzone elementId={elementId} asElement="div" elementType={nodeType}>
        {hiddenHandles !== true && (
          <>
            {handles.map((handle) => {
              if (isHandleHiddenByProp(handle.id)) {
                return null
              }

              if (!visibleHandleIds.has(handle.id) && !connectedHandleIds.has(handle.id)) {
                return null
              }

              const isPrimaryHandle = visibleHandleIds.has(handle.id)
              const isGuidanceSourceHandle =
                connectionGuidanceActive &&
                elementId === connectionGuidanceSourceNodeId &&
                handle.id === connectionGuidanceSourceHandleId

              return (
                <Handle
                  key={handle.id}
                  id={handle.id}
                  className={[
                    handle.className,
                    isGuidanceSourceHandle ? "umlstudio-connection-guidance-source" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  type="source"
                  position={handle.position}
                  style={
                    isPrimaryHandle
                      ? handle.style
                      : {
                          ...handle.style,
                          opacity: 0,
                          pointerEvents: "none",
                        }
                  }
                  isConnectable={isDiagramModifiable}
                  isConnectableStart={isPrimaryHandle && isDiagramModifiable}
                  isConnectableEnd={isConnectableEnd}
                />
              )
            })}
          </>
        )}

        {children}
      </FeedbackDropzone>
    </AssessmentSelectableWrapper>
  )
}
