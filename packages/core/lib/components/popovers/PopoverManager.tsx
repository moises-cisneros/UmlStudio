import { useDiagramStore, usePopoverStore, useMetadataStore } from "@/store/context"
import { UmlStudioMode } from "@/typings"
import { useShallow } from "zustand/shallow"
import { hasAssessmentToShow } from "@/utils/assessmentPresence"
import {
  ClassEditPopover,
  ClassGiveFeedbackPopover,
  ClassSeeFeedbackPopover,
  DefaultNodeEditPopover,
  DefaultNodeGiveFeedbackPopover,
  DefaultNodeSeeFeedbackPopover,
} from "./classDiagram"
import { useViewportCenter } from "@/hooks"
import { getPopoverOrigin, getPositionOnCanvas, getQuadrant } from "@/utils"
import { PopoverProps } from "./types"
import { GenericPopover } from "./GenericPopover"
import { EdgeEditPopover, EdgeGiveFeedbackPopover, EdgeSeeFeedbackPopover } from "./edgePopovers"
import { LocationPopover } from "@/types"

type NodePopoverType = "class" | "default"

type EdgePopoverType =
  | "ClassAggregation"
  | "ClassInheritance"
  | "ClassRealization"
  | "ClassComposition"
  | "ClassBidirectional"
  | "ClassUnidirectional"
  | "ClassDependency"

type PopoverType = NodePopoverType | EdgePopoverType

const editPopovers: Record<PopoverType, React.FC<PopoverProps>> = {
  class: ClassEditPopover,
  default: DefaultNodeEditPopover,
  ClassAggregation: EdgeEditPopover,
  ClassInheritance: EdgeEditPopover,
  ClassRealization: EdgeEditPopover,
  ClassComposition: EdgeEditPopover,
  ClassBidirectional: EdgeEditPopover,
  ClassUnidirectional: EdgeEditPopover,
  ClassDependency: EdgeEditPopover,
}

const giveFeedbackPopovers: Record<PopoverType, React.FC<PopoverProps>> = {
  class: ClassGiveFeedbackPopover,
  default: DefaultNodeGiveFeedbackPopover,
  ClassAggregation: EdgeGiveFeedbackPopover,
  ClassInheritance: EdgeGiveFeedbackPopover,
  ClassRealization: EdgeGiveFeedbackPopover,
  ClassComposition: EdgeGiveFeedbackPopover,
  ClassBidirectional: EdgeGiveFeedbackPopover,
  ClassUnidirectional: EdgeGiveFeedbackPopover,
  ClassDependency: EdgeGiveFeedbackPopover,
}

const seeFeedbackPopovers: Record<PopoverType, React.FC<PopoverProps>> = {
  class: ClassSeeFeedbackPopover,
  default: DefaultNodeSeeFeedbackPopover,
  ClassAggregation: EdgeSeeFeedbackPopover,
  ClassInheritance: EdgeSeeFeedbackPopover,
  ClassRealization: EdgeSeeFeedbackPopover,
  ClassComposition: EdgeSeeFeedbackPopover,
  ClassBidirectional: EdgeSeeFeedbackPopover,
  ClassUnidirectional: EdgeSeeFeedbackPopover,
  ClassDependency: EdgeSeeFeedbackPopover,
}

interface PopoverManagerProps {
  elementId: string
  anchorEl: HTMLElement | SVGElement | null
  type: PopoverType
}

export const PopoverManager = ({ elementId, anchorEl, type }: PopoverManagerProps) => {
  const viewportCenter = useViewportCenter()
  const { nodes, getAssessment } = useDiagramStore(
    useShallow((state) => ({
      nodes: state.nodes,
      getAssessment: state.getAssessment,
    }))
  )

  const { diagramMode, readonly } = useMetadataStore(
    useShallow((state) => ({
      diagramMode: state.mode,
      readonly: state.readonly,
    }))
  )
  const { popoverElementId, popupEnabled, setPopOverElementId } = usePopoverStore(
    useShallow((state) => ({
      popoverElementId: state.popoverElementId,
      popupEnabled: state.popupEnabled,
      setPopOverElementId: state.setPopOverElementId,
    }))
  )

  if (!anchorEl || !popupEnabled) {
    return null
  }

  const open = popoverElementId === elementId

  if (!open) {
    return null
  }
  const onClose = () => {
    setPopOverElementId(null)
  }

  let popoverOrigin: LocationPopover = {
    transformOrigin: { vertical: "top", horizontal: "left" },
  }

  const node = nodes.find((node) => node.id === elementId)
  if (node && anchorEl && open) {
    const nodePositionOnCanvas = getPositionOnCanvas(node, nodes)
    const quadrant = getQuadrant(nodePositionOnCanvas, viewportCenter)
    popoverOrigin = getPopoverOrigin(quadrant)
  }

  let Component: React.ComponentType<PopoverProps> | null = null

  const isEditing = diagramMode === UmlStudioMode.Modelling && !readonly
  const isGivingFeedback = diagramMode === UmlStudioMode.Assessment && !readonly
  const isSeeingFeedback = diagramMode === UmlStudioMode.Assessment && readonly

  if (isEditing) {
    Component = editPopovers[type] ?? null
  } else if (isGivingFeedback) {
    Component = giveFeedbackPopovers[type] ?? null
  } else if (isSeeingFeedback) {
    Component = hasAssessmentToShow(elementId, nodes, getAssessment)
      ? (seeFeedbackPopovers[type] ?? null)
      : null
  }

  return Component ? (
    <GenericPopover
      id={`popover-${elementId}`}
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      transformOrigin={popoverOrigin.transformOrigin}
      maxHeight={500}
      maxWidth={isEditing ? 278 : 400}
      assessmentNavigation={isGivingFeedback || isSeeingFeedback}
    >
      <Component elementId={elementId} />
    </GenericPopover>
  ) : null
}
