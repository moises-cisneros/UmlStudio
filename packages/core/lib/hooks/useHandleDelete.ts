import { useDiagramStore, useMetadataStore } from "@/store"
import { UmlStudioMode } from "@/typings"
import { useShallow } from "zustand/shallow"

export const useHandleDelete = (elementId: string) => {
  const { nodes, edges, setNodesAndEdges, setSelectedElementsId } = useDiagramStore(
    useShallow((state) => ({
      nodes: state.nodes,
      edges: state.edges,
      setNodesAndEdges: state.setNodesAndEdges,
      setSelectedElementsId: state.setSelectedElementsId,
    }))
  )

  const { readonlyDiagram, diagramMode } = useMetadataStore(
    useShallow((state) => ({
      readonlyDiagram: state.readonly,
      diagramMode: state.mode,
    }))
  )

  const handleDelete = () => {
    if (
      readonlyDiagram ||
      diagramMode === UmlStudioMode.Assessment ||
      diagramMode === UmlStudioMode.Exporting
    )
      return
    const newNodes = nodes.filter((node) => node.id !== elementId)
    const newEdges = edges.filter((edge) => edge.id !== elementId)
    setNodesAndEdges(newNodes, newEdges)
    setSelectedElementsId([])
  }

  return handleDelete
}
