import { usePopoverStore } from "@/store/context"
import { useDiagramStore, useMetadataStore } from "@/store"
import { UmlStudioMode } from "@/typings"
import {
  NodeMouseHandler,
  OnBeforeDelete,
  type Node,
  type Edge,
  EdgeMouseHandler,
} from "@xyflow/react"
import { useShallow } from "zustand/shallow"
import { useDiagramModifiable } from "./useDiagramModifiable"
import { isElementInOverlay } from "@/keyboard"
import { useCallback } from "react"
import { hasAssessmentToShow } from "@/utils/assessmentPresence"

export const useElementInteractions = () => {
  const isDiagramModifiable = useDiagramModifiable()
  const { mode, readonly } = useMetadataStore(
    useShallow((state) => ({ mode: state.mode, readonly: state.readonly }))
  )
  const getAssessment = useDiagramStore((state) => state.getAssessment)
  const { setPopOverElementId } = usePopoverStore(
    useShallow((state) => ({
      setPopOverElementId: state.setPopOverElementId,
    }))
  )
  const canOpenAssessmentPopover = mode === UmlStudioMode.Assessment
  const canOpenPopover = isDiagramModifiable || canOpenAssessmentPopover

  const onBeforeDelete: OnBeforeDelete = useCallback(() => {
    if (isElementInOverlay(document.activeElement)) {
      return Promise.resolve(false)
    }
    return Promise.resolve(isDiagramModifiable)
  }, [isDiagramModifiable])

  const onNodeDoubleClick: NodeMouseHandler<Node> = useCallback(
    (_event, node) => {
      if (!canOpenPopover || canOpenAssessmentPopover) return
      setPopOverElementId(node.id)
    },
    [canOpenAssessmentPopover, canOpenPopover, setPopOverElementId]
  )

  const onEdgeDoubleClick: EdgeMouseHandler<Edge> = useCallback(
    (_event, edge) => {
      if (!canOpenPopover || canOpenAssessmentPopover) return
      setPopOverElementId(edge.id)
    },
    [canOpenAssessmentPopover, canOpenPopover, setPopOverElementId]
  )

  const onNodeClick: NodeMouseHandler<Node> = useCallback(
    (_event, node) => {
      if (!canOpenAssessmentPopover) return
      if (readonly && !hasAssessmentToShow(node.id, [node], getAssessment))
        return
      setPopOverElementId(node.id)
    },
    [canOpenAssessmentPopover, getAssessment, readonly, setPopOverElementId]
  )

  const onEdgeClick: EdgeMouseHandler<Edge> = useCallback(
    (_event, edge) => {
      if (!canOpenAssessmentPopover) return
      if (readonly && !hasAssessmentToShow(edge.id, [], getAssessment)) return
      setPopOverElementId(edge.id)
    },
    [canOpenAssessmentPopover, getAssessment, readonly, setPopOverElementId]
  )
  return {
    onBeforeDelete,
    onNodeClick,
    onEdgeClick,
    onNodeDoubleClick,
    onEdgeDoubleClick,
  }
}
