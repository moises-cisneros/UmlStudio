import {
  INTERACTIVE_SELECTION_COLOR,
  INTERACTIVE_SELECTION_FILL,
  INTERACTIVE_SELECTION_FILL_FAINT,
  INTERACTIVE_SELECTION_STROKE_SOFT,
} from "@/constants"
import { useAssessmentSelection } from "@/hooks"
import {
  useAssessmentSelectionStore,
  useDiagramStore,
  useMetadataStore,
} from "@/store"
import { UmlStudioMode, UmlStudioView } from "@/typings"
import { FC } from "react"
import { useShallow } from "zustand/shallow"

interface AssessmentSelectableElementProps {
  elementId: string
  width: number
  itemHeight: number
  yOffset?: number
  badge?: React.ReactNode
  highlightable?: boolean
  children: React.ReactNode
}

export const AssessmentSelectableElement: FC<
  AssessmentSelectableElementProps
> = ({
  elementId,
  width,
  itemHeight,
  yOffset = 0,
  highlightable = true,
  badge,
  children,
}) => {
  const { mode, readonly, view } = useMetadataStore(
    useShallow((state) => ({
      mode: state.mode,
      readonly: state.readonly,
      view: state.view,
    }))
  )
  const { isInteractiveSelected, toggleInteractiveElement } = useDiagramStore(
    useShallow((state) => ({
      isInteractiveSelected:
        state.interactiveElements[elementId] ||
        state.interactiveRelationships[elementId] ||
        false,
      toggleInteractiveElement: state.toggleInteractiveElement,
    }))
  )
  const {
    isSelected,
    isHighlighted,
    showAssessmentInteraction,
    handleElementClick,
    handleElementMouseEnter,
    handleElementMouseLeave,
  } = useAssessmentSelection(elementId)

  const highlightColor = useAssessmentSelectionStore(
    (state) => state.highlightedElements[elementId]
  )
  const HIGHLIGHT_RING_WIDTH = 2
  const highlightRect =
    highlightColor && highlightable ? (
      <rect
        aria-hidden
        x={HIGHLIGHT_RING_WIDTH / 2}
        y={yOffset + HIGHLIGHT_RING_WIDTH / 2}
        width={Math.max(width - HIGHLIGHT_RING_WIDTH, 0)}
        height={Math.max(itemHeight - HIGHLIGHT_RING_WIDTH, 0)}
        fill="none"
        stroke={highlightColor}
        strokeWidth={HIGHLIGHT_RING_WIDTH}
        rx={2}
        pointerEvents="none"
      />
    ) : null

  const showInteractiveInteraction =
    mode === UmlStudioMode.Modelling &&
    view === UmlStudioView.Highlight &&
    !readonly

  if (showInteractiveInteraction) {
    const handleInteractivePointerDown = (
      e: React.PointerEvent<SVGGElement>
    ) => {
      e.stopPropagation()
      e.preventDefault()
      toggleInteractiveElement(elementId)
    }

    return (
      <g
        className="nodrag nopan"
        data-umlstudio-element-id={elementId}
        style={{ cursor: "pointer" }}
        onPointerDown={handleInteractivePointerDown}
      >
        {children}
        {isInteractiveSelected && (
          <rect
            x={0}
            y={yOffset}
            width={width}
            height={itemHeight}
            fill={INTERACTIVE_SELECTION_COLOR}
            fillOpacity={0.18}
            stroke={INTERACTIVE_SELECTION_COLOR}
            strokeWidth={2}
            rx={2}
            pointerEvents="none"
          />
        )}
        {badge}
      </g>
    )
  }

  if (!showAssessmentInteraction) {
    return (
      <g data-umlstudio-element-id={elementId}>
        {children}
        {highlightRect}
        {badge}
      </g>
    )
  }

  const handleSVGClick = (e: React.PointerEvent<SVGGElement>) => {
    handleElementClick(e as React.PointerEvent<Element>)
  }

  return (
    <g
      className="nodrag nopan"
      data-umlstudio-element-id={elementId}
      style={{
        cursor: showAssessmentInteraction ? "pointer" : "default",
      }}
      onPointerDown={handleSVGClick}
      onMouseEnter={handleElementMouseEnter}
      onMouseLeave={handleElementMouseLeave}
    >
      {children}
      {(isSelected || isHighlighted) && (
        <rect
          x={0}
          y={yOffset}
          width={width}
          height={itemHeight}
          fill={
            isSelected
              ? INTERACTIVE_SELECTION_FILL
              : INTERACTIVE_SELECTION_FILL_FAINT
          }
          stroke={
            isSelected
              ? INTERACTIVE_SELECTION_COLOR
              : INTERACTIVE_SELECTION_STROKE_SOFT
          }
          strokeWidth={isSelected ? 2 : 1}
          rx={2}
          pointerEvents="none"
        />
      )}
      {highlightRect}
      {badge}
    </g>
  )
}
