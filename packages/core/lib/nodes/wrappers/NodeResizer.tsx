import {
  // eslint-disable-next-line no-restricted-imports
  NodeResizer as ReactFlowNodeResizer,
  NodeResizeControl,
  ResizeControlVariant,
  useNodeId,
  useStore,
  type NodeResizerProps,
} from "@xyflow/react"

const HANDLE_STYLE = { width: 10, height: 10 }

const LINE_CLASS = "umlstudio-resize-line"

const HANDLE_CLASS = "umlstudio-resize-handle"

const CORNERS = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const

const isAxisLocked = (min?: number, max?: number): boolean =>
  min !== undefined && max !== undefined && min >= max

export function NodeResizer(props: NodeResizerProps) {
  const {
    isVisible = true,
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    handleStyle,
    handleClassName,
    lineStyle,
    lineClassName,
    ...resizeParams
  } = props

  const contextNodeId = useNodeId()
  const nodeId = props.nodeId ?? contextNodeId
  const isNodeSelected = useStore((state) =>
    nodeId ? !!state.nodeLookup.get(nodeId)?.selected : undefined
  )

  if (!isVisible) return null
  if (isNodeSelected === false) return null

  const widthLocked = isAxisLocked(minWidth, maxWidth)
  const heightLocked = isAxisLocked(minHeight, maxHeight)

  if (!widthLocked && !heightLocked) {
    return (
      <ReactFlowNodeResizer
        {...props}
        handleStyle={handleStyle ?? HANDLE_STYLE}
        handleClassName={[HANDLE_CLASS, handleClassName]
          .filter(Boolean)
          .join(" ")}
        lineClassName={[LINE_CLASS, lineClassName].filter(Boolean).join(" ")}
      />
    )
  }

  if (widthLocked && heightLocked) return null

  const shared = { minWidth, minHeight, maxWidth, maxHeight, ...resizeParams }
  const lines = heightLocked
    ? (["left", "right"] as const)
    : (["top", "bottom"] as const)
  const freeAxis = heightLocked ? "horizontal" : "vertical"
  const cornerClass = heightLocked
    ? "umlstudio-resize-corner--x"
    : "umlstudio-resize-corner--y"

  return (
    <>
      {lines.map((position) => (
        <NodeResizeControl
          key={position}
          position={position}
          variant={ResizeControlVariant.Line}
          style={lineStyle}
          className={[LINE_CLASS, lineClassName].filter(Boolean).join(" ")}
          {...shared}
        />
      ))}
      {CORNERS.map((position) => (
        <NodeResizeControl
          key={position}
          position={position}
          variant={ResizeControlVariant.Handle}
          resizeDirection={freeAxis}
          className={[HANDLE_CLASS, cornerClass, handleClassName]
            .filter(Boolean)
            .join(" ")}
          style={{ ...HANDLE_STYLE, ...handleStyle }}
          {...shared}
        />
      ))}
    </>
  )
}
