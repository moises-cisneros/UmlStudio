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
import { DROPS, generateUUID } from "@/constants"
import { ClassStereotype } from "@/types"

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

  const {
    setSelectedElementsId,
    setNodes,
    setEdges,
    nodes,
    associationClassPrompt,
    setAssociationClassPrompt,
  } = useDiagramStore(
    useShallow((state) => ({
      setSelectedElementsId: state.setSelectedElementsId,
      setNodes: state.setNodes,
      setEdges: state.setEdges,
      nodes: state.nodes,
      associationClassPrompt: state.associationClassPrompt,
      setAssociationClassPrompt: state.setAssociationClassPrompt,
    }))
  )

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
      if (associationClassPrompt && !associationClassPrompt.error) {
        if (node.type !== "class") return

        if (associationClassPrompt.fromNodeId === null) {
          setAssociationClassPrompt({ fromNodeId: node.id })
          return
        }

        if (associationClassPrompt.fromNodeId === node.id) {
          return
        }

        const fromNodeId = associationClassPrompt.fromNodeId
        const fromNode = nodes.find((n) => n.id === fromNodeId)
        if (!fromNode) {
          setAssociationClassPrompt(null)
          return
        }

        const midX = (fromNode.position.x + node.position.x) / 2
        const midY = (fromNode.position.y + node.position.y) / 2 + 130
        const intermediateNodeId = generateUUID()
        const assocEdgeId = generateUUID()

        const intermediateNode: Node = {
          id: intermediateNodeId,
          type: "class",
          position: { x: midX, y: midY },
          width: DROPS.DEFAULT_ELEMENT_WIDTH,
          height: 110,
          measured: { width: DROPS.DEFAULT_ELEMENT_WIDTH, height: 110 },
          data: {
            name: "AssociationClass",
            stereotype: ClassStereotype.Association,
            isAssociationClass: true,
            attributes: [{ id: generateUUID(), name: "+ attribute: Type" }],
            methods: [{ id: generateUUID(), name: "+ method()" }],
          },
          selected: true,
        }

        const assocEdge: Edge = {
          id: assocEdgeId,
          source: fromNodeId,
          target: node.id,
          type: "ClassBidirectional",
          data: {
            associationClassNodeId: intermediateNodeId,
          },
        }

        setNodes((prev) => [
          ...prev.map((n) => ({ ...n, selected: false })),
          intermediateNode,
        ])
        setEdges((prev) => [...prev, assocEdge])
        setSelectedElementsId([intermediateNodeId])
        setAssociationClassPrompt(null)
        return
      }

      if (!canOpenAssessmentPopover) return
      if (readonly && !hasAssessmentToShow(node.id, [node], getAssessment))
        return
      setPopOverElementId(node.id)
    },
    [
      associationClassPrompt,
      canOpenAssessmentPopover,
      getAssessment,
      nodes,
      readonly,
      setAssociationClassPrompt,
      setEdges,
      setNodes,
      setPopOverElementId,
      setSelectedElementsId,
    ]
  )

  const onEdgeClick: EdgeMouseHandler<Edge> = useCallback(
    (_event, edge) => {
      if (!canOpenAssessmentPopover) return
      if (readonly && !hasAssessmentToShow(edge.id, [], getAssessment)) return
      setPopOverElementId(edge.id)
    },
    [canOpenAssessmentPopover, getAssessment, readonly, setPopOverElementId]
  )

  const onNodeContextMenu: NodeMouseHandler<Node> = useCallback(
    (event, node) => {
      event.preventDefault()
      if (!isDiagramModifiable && !canOpenAssessmentPopover) return
      setSelectedElementsId([node.id])
      setNodes((nodes) =>
        nodes.map((n) => ({ ...n, selected: n.id === node.id }))
      )
      setEdges((edges) => edges.map((e) => ({ ...e, selected: false })))
    },
    [
      canOpenAssessmentPopover,
      isDiagramModifiable,
      setEdges,
      setNodes,
      setSelectedElementsId,
    ]
  )

  const onEdgeContextMenu: EdgeMouseHandler<Edge> = useCallback(
    (event, edge) => {
      event.preventDefault()
      if (!isDiagramModifiable && !canOpenAssessmentPopover) return
      setSelectedElementsId([edge.id])
      setNodes((nodes) => nodes.map((n) => ({ ...n, selected: false })))
      setEdges((edges) =>
        edges.map((e) => ({ ...e, selected: e.id === edge.id }))
      )
    },
    [
      canOpenAssessmentPopover,
      isDiagramModifiable,
      setEdges,
      setNodes,
      setSelectedElementsId,
    ]
  )

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault()
    },
    []
  )

  return {
    onBeforeDelete,
    onNodeClick,
    onEdgeClick,
    onNodeDoubleClick,
    onEdgeDoubleClick,
    onNodeContextMenu,
    onEdgeContextMenu,
    onPaneContextMenu,
  }
}
