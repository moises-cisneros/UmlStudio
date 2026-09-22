import { useCallback } from "react"
import { type OnNodeDrag, type Node } from "@xyflow/react"
import { useDiagramStore } from "@/store/context"
import { useShallow } from "zustand/shallow"
import { calculateAlignmentGuides } from "@/utils/alignmentUtils"
import { useAlignmentGuidesStore } from "@/store/context"

const ALIGNMENT_GUIDE_DISPLAY_PX = 6

export const useNodeDrag = () => {
  const { nodes } = useDiagramStore(
    useShallow((state) => ({
      nodes: state.nodes,
    }))
  )

  const { setGuides } = useAlignmentGuidesStore(
    useShallow((state) => ({
      setGuides: state.setGuides,
    }))
  )

  const onNodeDrag: OnNodeDrag<Node> = useCallback(
    (_event, draggedNode) => {
      const alignmentGuides = calculateAlignmentGuides(
        draggedNode,
        nodes,
        ALIGNMENT_GUIDE_DISPLAY_PX
      )
      setGuides(alignmentGuides)
    },
    [nodes, setGuides]
  )

  return onNodeDrag
}
