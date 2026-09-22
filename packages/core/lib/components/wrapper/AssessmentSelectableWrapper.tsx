import React from "react"
import { INTERACTIVE_SELECTION_COLOR } from "@/constants"
import { useAssessmentSelection } from "@/hooks/useAssessmentSelection"
import { useAssessmentSelectionStore, useDiagramStore, useMetadataStore } from "@/store"
import { UmlStudioMode, UmlStudioView } from "@/typings"
import { useShallow } from "zustand/shallow"

interface AssessmentSelectableWrapperProps {
  elementId: string
  children: React.ReactNode
  asElement?: "div" | "g"
}

export const AssessmentSelectableWrapper: React.FC<AssessmentSelectableWrapperProps> = ({
  elementId,
  children,
  asElement = "div",
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
        state.interactiveElements[elementId] || state.interactiveRelationships[elementId] || false,
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

  const showInteractiveInteraction =
    mode === UmlStudioMode.Modelling && view === UmlStudioView.Highlight && !readonly

  const highlightColor = useAssessmentSelectionStore(
    (state) => state.highlightedElements[elementId]
  )
  const highlightDivOverlay = highlightColor ? (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        boxShadow: `0 0 0 3px ${highlightColor}`,
        borderRadius: 2,
        pointerEvents: "none",
        zIndex: -1,
      }}
    />
  ) : null
  const highlightEdgeVars = highlightColor
    ? ({ "--umlstudio-edge-highlight": highlightColor } as React.CSSProperties)
    : undefined

  if (showInteractiveInteraction) {
    const handleInteractiveClick = (event: React.PointerEvent) => {
      event.preventDefault()
      event.stopPropagation()
      toggleInteractiveElement(elementId)
    }

    if (asElement == "g") {
      return (
        <g
          className={`nodrag nopan umlstudio-highlight umlstudio-highlight--picker${
            isInteractiveSelected ? " umlstudio-highlight--selected" : ""
          }`}
          data-umlstudio-element-id={elementId}
          style={{
            cursor: "pointer",
            ...(isInteractiveSelected && {
              filter: `drop-shadow(0 0 4px ${INTERACTIVE_SELECTION_COLOR})`,
            }),
          }}
          onPointerDown={handleInteractiveClick}
        >
          {children}
        </g>
      )
    }

    return (
      <div
        className={`nodrag nopan umlstudio-highlight umlstudio-highlight--picker${
          isInteractiveSelected ? " umlstudio-highlight--selected" : ""
        }`}
        data-umlstudio-element-id={elementId}
        style={{ cursor: "pointer" }}
        onPointerDown={handleInteractiveClick}
      >
        {children}
      </div>
    )
  }

  if (!showAssessmentInteraction) {
    if (!highlightColor) return <>{children}</>
    if (asElement == "g") {
      return (
        <g
          data-umlstudio-element-id={elementId}
          className="umlstudio-edge-highlight"
          style={highlightEdgeVars}
        >
          {children}
        </g>
      )
    }
    return (
      <div
        data-umlstudio-element-id={elementId}
        style={{ position: "relative", isolation: "isolate" }}
      >
        {children}
        {highlightDivOverlay}
      </div>
    )
  }

  const highlightClass = [
    "umlstudio-highlight",
    isSelected
      ? "umlstudio-highlight--selected"
      : isHighlighted
        ? "umlstudio-highlight--highlighted"
        : "",
  ]
    .filter(Boolean)
    .join(" ")

  const combinedStyle: React.CSSProperties = {
    cursor: "pointer",
    ...(highlightColor && { position: "relative", isolation: "isolate" }),
  }

  if (asElement == "g") {
    const gStyle = {
      cursor: "pointer",
      ...highlightEdgeVars,
    }

    return (
      <g
        className={`nodrag nopan ${highlightClass}${
          highlightColor ? " umlstudio-edge-highlight" : ""
        }`}
        data-umlstudio-element-id={elementId}
        style={gStyle}
        onPointerDown={handleElementClick}
        onMouseEnter={handleElementMouseEnter}
        onMouseLeave={handleElementMouseLeave}
      >
        {children}
      </g>
    )
  }
  return (
    <div
      className={`nodrag nopan ${highlightClass}`}
      data-umlstudio-element-id={elementId}
      style={combinedStyle}
      onPointerDown={handleElementClick}
      onMouseEnter={handleElementMouseEnter}
      onMouseLeave={handleElementMouseLeave}
    >
      {children}
      {highlightDivOverlay}
    </div>
  )
}
