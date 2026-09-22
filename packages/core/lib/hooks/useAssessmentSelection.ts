import { useAssessmentSelectionStore, useDiagramStore, useMetadataStore } from "@/store"
import { useShallow } from "zustand/shallow"
import { UmlStudioMode } from "@/typings"
import { Node } from "@xyflow/react"
import { useMemo } from "react"

export const useAssessmentSelection = (elementId: string) => {
  const { isAssessmentSelectionMode, highlightedElementId, selectedElementIds } =
    useAssessmentSelectionStore(
      useShallow((state) => ({
        isAssessmentSelectionMode: state.isAssessmentSelectionMode,
        highlightedElementId: state.highlightedElementId,
        selectedElementIds: state.selectedElementIds,
      }))
    )

  const { selectElement, setHighlightedElement, selectMultipleElements } =
    useAssessmentSelectionStore(
      useShallow((state) => ({
        selectElement: state.selectElement,
        setHighlightedElement: state.setHighlightedElement,
        selectMultipleElements: state.selectMultipleElements,
      }))
    )

  const { nodes } = useDiagramStore(
    useShallow((state) => ({
      nodes: state.nodes,
    }))
  )

  const { mode, readonly } = useMetadataStore(
    useShallow((state) => ({
      mode: state.mode,
      readonly: state.readonly,
    }))
  )

  const isReadonlyAssessmentMode = useMemo(
    () => mode === UmlStudioMode.Assessment && readonly,
    [mode, readonly]
  )

  const getAllChildNodes = (parentId: string): Node[] => {
    const children: Node[] = []
    const directChildren = nodes.filter((node) => node.parentId === parentId)

    for (const child of directChildren) {
      children.push(child)
      children.push(...getAllChildNodes(child.id))
    }

    return children
  }

  const getNestedElementIds = (nodeId: string): string[] => {
    const node = nodes.find((n) => n.id === nodeId)
    if (!node) return []

    const nestedIds: string[] = []

    if (node.data && "attributes" in node.data && Array.isArray(node.data.attributes)) {
      nestedIds.push(...node.data.attributes.map((attr: { id: string }) => attr.id))
    }
    if (node.data && "methods" in node.data && Array.isArray(node.data.methods)) {
      nestedIds.push(...node.data.methods.map((method: { id: string }) => method.id))
    }

    const childNodes = getAllChildNodes(nodeId)
    for (const childNode of childNodes) {
      nestedIds.push(childNode.id)
      nestedIds.push(...getNestedElementIds(childNode.id))
    }

    return nestedIds
  }

  const handleElementClick = (e: React.PointerEvent | React.MouseEvent) => {
    if (!isReadonlyAssessmentMode || !isAssessmentSelectionMode) return

    e.stopPropagation()
    e.preventDefault()

    selectElement(elementId)

    const node = nodes.find((n) => n.id === elementId)
    if (node) {
      const nestedIds = getNestedElementIds(elementId)
      if (nestedIds.length > 0) {
        selectMultipleElements([elementId, ...nestedIds])
      }
    }
  }

  const handleElementMouseEnter = () => {
    if (!isReadonlyAssessmentMode || !isAssessmentSelectionMode) return
    setHighlightedElement(elementId)
  }

  const handleElementMouseLeave = () => {
    if (!isReadonlyAssessmentMode || !isAssessmentSelectionMode) return
    setHighlightedElement(null)
  }

  const isSelected = selectedElementIds.includes(elementId)
  const isHighlighted = highlightedElementId === elementId
  const showAssessmentInteraction = isReadonlyAssessmentMode && isAssessmentSelectionMode

  return {
    isSelected,
    isHighlighted,
    showAssessmentInteraction,
    handleElementClick,
    handleElementMouseEnter,
    handleElementMouseLeave,
    isReadonlyAssessmentMode,
    isAssessmentSelectionMode,
  }
}
