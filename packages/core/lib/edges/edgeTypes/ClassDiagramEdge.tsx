import { useMemo } from "react"
import { BaseEdgeProps, StepEdgeBody, CommonEdgeElements } from "../GenericEdge"
import { EdgeEndLabels } from "../labelTypes/EdgeEndLabels"
import { getEdgeConfig } from "@/hooks/useEdgeConfig"
import { useStepPathEdge } from "@/hooks/useStepPathEdge"
import { useDiagramStore, usePopoverStore } from "@/store/context"
import { useShallow } from "zustand/shallow"
import { useToolbar } from "@/hooks"
import { FeedbackDropzone } from "@/components/wrapper/FeedbackDropzone"
import { AssessmentSelectableWrapper } from "@/components"
import { getCustomColorsFromDataForEdge, getPositionOnCanvas } from "@/utils"

export const ClassDiagramEdge = ({
  id,
  type,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceHandleId,
  targetHandleId,
  data,
}: BaseEdgeProps) => {
  const { handleDelete } = useToolbar({ id })

  const config = getEdgeConfig(
    type as
      | "ClassAggregation"
      | "ClassInheritance"
      | "ClassRealization"
      | "ClassComposition"
      | "ClassBidirectional"
      | "ClassUnidirectional"
      | "ClassDependency"
  )

  const allowMidpointDragging =
    "allowMidpointDragging" in config ? config.allowMidpointDragging : true

  const { assessments, nodes } = useDiagramStore(
    useShallow((state) => ({
      assessments: state.assessments,
      nodes: state.nodes,
    }))
  )

  const setPopOverElementId = usePopoverStore(useShallow((state) => state.setPopOverElementId))

  const {
    pathRef,
    edgeData,
    currentPath,
    overlayPath,
    bendHandles,
    isBendDragging,
    draggingHandleSegmentIndex,
    hasInitialCalculation,
    markerEnd,
    markerStart,
    strokeDashArray,
    handlePointerDown,
    handleEndpointPointerDown,
    sourcePoint,
    targetPoint,
    sourcePosition: renderSourcePosition,
    targetPosition: renderTargetPosition,
    isDiagramModifiable,
    canEditEndpoint,
  } = useStepPathEdge({
    id,
    type,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    sourceHandleId,
    targetHandleId,
    data,
    allowMidpointDragging,
  })

  const { strokeColor, textColor } = getCustomColorsFromDataForEdge(data)
  const markerKey = `${id}-${markerStart ?? "none"}-${markerEnd ?? "none"}`

  const associationClassNodeId = (data as Record<string, unknown> | undefined)
    ?.associationClassNodeId as string | undefined

  const assocNode = useMemo(
    () => (associationClassNodeId ? nodes.find((n) => n.id === associationClassNodeId) : undefined),
    [associationClassNodeId, nodes]
  )

  const associationClassTarget = useMemo(() => {
    if (!assocNode || !edgeData.pathMiddlePosition) return null
    const pos = getPositionOnCanvas(assocNode, nodes)
    const width = (assocNode.measured?.width ?? assocNode.width ?? 160) as number
    const height = (assocNode.measured?.height ?? assocNode.height ?? 110) as number

    const rectLeft = pos.x
    const rectRight = pos.x + width
    const rectTop = pos.y
    const rectBottom = pos.y + height
    const mx = edgeData.pathMiddlePosition.x
    const my = edgeData.pathMiddlePosition.y

    if (mx >= rectLeft && mx <= rectRight) {
      return {
        x: mx,
        y: my < rectTop ? rectTop : rectBottom,
      }
    }
    if (my >= rectTop && my <= rectBottom) {
      return {
        x: mx < rectLeft ? rectLeft : rectRight,
        y: my,
      }
    }
    return {
      x: mx < rectLeft ? rectLeft : rectRight,
      y: my < rectTop ? rectTop : rectBottom,
    }
  }, [assocNode, edgeData.pathMiddlePosition, nodes])

  return (
    <AssessmentSelectableWrapper elementId={id} asElement="g">
      <FeedbackDropzone elementId={id} asElement="path" elementType={type}>
        {associationClassTarget && edgeData.pathMiddlePosition && (
          <line
            data-testid={`association-class-connector-${id}`}
            x1={edgeData.pathMiddlePosition.x}
            y1={edgeData.pathMiddlePosition.y}
            x2={associationClassTarget.x}
            y2={associationClassTarget.y}
            stroke={strokeColor || "var(--umlstudio-foreground, #94a3b8)"}
            strokeWidth={1.5}
            strokeDasharray="6 4"
            pointerEvents="none"
          />
        )}
        <StepEdgeBody
          id={id}
          markerKey={markerKey}
          currentPath={currentPath}
          overlayPath={overlayPath}
          pathRef={pathRef}
          strokeColor={strokeColor}
          strokeDashArray={strokeDashArray}
          hasInitialCalculation={hasInitialCalculation}
          isBendDragging={isBendDragging}
          draggingHandleSegmentIndex={draggingHandleSegmentIndex}
          markerStart={markerStart}
          markerEnd={markerEnd}
          sourcePoint={sourcePoint}
          targetPoint={targetPoint}
          sourcePosition={renderSourcePosition}
          targetPosition={renderTargetPosition}
          isDiagramModifiable={isDiagramModifiable}
          canEditEndpoint={canEditEndpoint}
          handleEndpointPointerDown={handleEndpointPointerDown}
          allowMidpointDragging={allowMidpointDragging}
          bendHandles={bendHandles}
          handlePointerDown={handlePointerDown}
        />

        <EdgeEndLabels
          data={data}
          activePoints={edgeData.activePoints}
          sourceX={sourceX}
          sourceY={sourceY}
          targetX={targetX}
          targetY={targetY}
          sourcePosition={renderSourcePosition}
          targetPosition={renderTargetPosition}
          textColor={textColor}
        />

        <CommonEdgeElements
          id={id}
          data={data}
          pathMiddlePosition={edgeData.pathMiddlePosition}
          toolbarPosition={edgeData.toolbarPosition}
          isDiagramModifiable={isDiagramModifiable}
          assessments={assessments}
          handleDelete={handleDelete}
          setPopOverElementId={setPopOverElementId}
          type={type}
        />
      </FeedbackDropzone>
    </AssessmentSelectableWrapper>
  )
}
