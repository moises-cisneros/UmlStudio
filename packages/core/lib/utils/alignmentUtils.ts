import { Node } from "@xyflow/react"
import { AlignmentGuide } from "@/store/alignmentGuidesStore"
import { getPositionOnCanvas, isParentNodeType } from "@/utils/nodeUtils"

const ALIGNMENT_THRESHOLD = 5

const isWithinThreshold = (
  delta: number,
  threshold: number,
  inclusive: boolean
) => (inclusive ? delta <= threshold : delta < threshold)

export const getNodeBounds = (node: Node, allNodes?: Node[]) => {
  const position = allNodes
    ? getPositionOnCanvas(node, allNodes)
    : node.position
  const x = position.x
  const y = position.y
  const width = node.measured?.width || 100
  const height = node.measured?.height || 100

  return {
    left: x,
    right: x + width,
    top: y,
    bottom: y + height,
    centerX: x + width / 2,
    centerY: y + height / 2,
  }
}

const getContainingParentId = (
  node: Node,
  allNodes: Node[],
  excludeParentId?: string
) => {
  if (node.parentId) {
    return node.parentId
  }

  const nodeBounds = getNodeBounds(node, allNodes)
  let bestParent: Node | undefined
  let bestArea = Infinity

  for (const candidate of allNodes) {
    if (
      candidate.id === node.id ||
      candidate.id === excludeParentId ||
      !isParentNodeType(candidate.type)
    ) {
      continue
    }

    const parentBounds = getNodeBounds(candidate, allNodes)
    const contains =
      nodeBounds.left >= parentBounds.left &&
      nodeBounds.right <= parentBounds.right &&
      nodeBounds.top >= parentBounds.top &&
      nodeBounds.bottom <= parentBounds.bottom

    if (!contains) {
      continue
    }

    const area =
      (parentBounds.right - parentBounds.left) *
      (parentBounds.bottom - parentBounds.top)
    if (area < bestArea) {
      bestArea = area
      bestParent = candidate
    }
  }

  return bestParent?.id
}

const shouldUseAsGuideTarget = (
  draggedNode: Node,
  node: Node,
  allNodes: Node[],
  draggedParentId: string | undefined
) => {
  const nodeParentId = getContainingParentId(node, allNodes, draggedNode.id)

  if (!draggedParentId) {
    return true
  }

  if (node.id === draggedParentId) {
    return false
  }

  const isSibling = nodeParentId === draggedParentId
  const isTopLevel = !nodeParentId

  return isSibling || isTopLevel
}

export const calculateAlignmentGuides = (
  draggedNode: Node,
  allNodes: Node[],
  threshold: number = ALIGNMENT_THRESHOLD
): AlignmentGuide[] => {
  const nodesWithDrag = allNodes.map((node) =>
    node.id === draggedNode.id ? draggedNode : node
  )
  const draggedParentId = draggedNode.parentId
  const draggedBounds = getNodeBounds(draggedNode, nodesWithDrag)
  const guides: AlignmentGuide[] = []
  const alignedPositions = new Set<number>()

  const otherNodes = nodesWithDrag.filter(
    (node) =>
      node.id !== draggedNode.id &&
      shouldUseAsGuideTarget(draggedNode, node, nodesWithDrag, draggedParentId)
  )

  for (const node of otherNodes) {
    const nodeBounds = getNodeBounds(node, nodesWithDrag)

    const verticalAlignments = [
      { pos: nodeBounds.left, name: "left" },
      { pos: nodeBounds.centerX, name: "center" },
      { pos: nodeBounds.right, name: "right" },
    ]

    const horizontalAlignments = [
      { pos: nodeBounds.top, name: "top" },
      { pos: nodeBounds.centerY, name: "center" },
      { pos: nodeBounds.bottom, name: "bottom" },
    ]

    for (const alignment of verticalAlignments) {
      const leftDelta = Math.abs(draggedBounds.left - alignment.pos)
      if (isWithinThreshold(leftDelta, threshold, alignment.name === "left")) {
        if (!alignedPositions.has(alignment.pos)) {
          guides.push({
            id: `vertical-${alignment.pos}`,
            type: "vertical",
            position: alignment.pos,
          })
          alignedPositions.add(alignment.pos)
        }
      }
      const centerXDelta = Math.abs(draggedBounds.centerX - alignment.pos)
      if (
        isWithinThreshold(centerXDelta, threshold, alignment.name === "center")
      ) {
        if (!alignedPositions.has(alignment.pos)) {
          guides.push({
            id: `vertical-center-${alignment.pos}`,
            type: "vertical",
            position: alignment.pos,
          })
          alignedPositions.add(alignment.pos)
        }
      }
      const rightDelta = Math.abs(draggedBounds.right - alignment.pos)
      if (
        isWithinThreshold(rightDelta, threshold, alignment.name === "right")
      ) {
        if (!alignedPositions.has(alignment.pos)) {
          guides.push({
            id: `vertical-right-${alignment.pos}`,
            type: "vertical",
            position: alignment.pos,
          })
          alignedPositions.add(alignment.pos)
        }
      }
    }

    for (const alignment of horizontalAlignments) {
      const topDelta = Math.abs(draggedBounds.top - alignment.pos)
      if (isWithinThreshold(topDelta, threshold, alignment.name === "top")) {
        if (!alignedPositions.has(alignment.pos)) {
          guides.push({
            id: `horizontal-${alignment.pos}`,
            type: "horizontal",
            position: alignment.pos,
          })
          alignedPositions.add(alignment.pos)
        }
      }
      const centerYDelta = Math.abs(draggedBounds.centerY - alignment.pos)
      if (
        isWithinThreshold(centerYDelta, threshold, alignment.name === "center")
      ) {
        if (!alignedPositions.has(alignment.pos)) {
          guides.push({
            id: `horizontal-center-${alignment.pos}`,
            type: "horizontal",
            position: alignment.pos,
          })
          alignedPositions.add(alignment.pos)
        }
      }
      const bottomDelta = Math.abs(draggedBounds.bottom - alignment.pos)
      if (
        isWithinThreshold(bottomDelta, threshold, alignment.name === "bottom")
      ) {
        if (!alignedPositions.has(alignment.pos)) {
          guides.push({
            id: `horizontal-bottom-${alignment.pos}`,
            type: "horizontal",
            position: alignment.pos,
          })
          alignedPositions.add(alignment.pos)
        }
      }
    }
  }

  return guides
}

export const snapNodeToGuides = (
  draggedNode: Node,
  guides: AlignmentGuide[],
  threshold: number = ALIGNMENT_THRESHOLD,
  allNodes?: Node[]
): { x?: number; y?: number } => {
  const draggedBounds = getNodeBounds(draggedNode, allNodes)
  const draggedPosition = allNodes
    ? getPositionOnCanvas(draggedNode, allNodes)
    : draggedNode.position
  const snappedPosition: { x?: number; y?: number } = {}

  for (const guide of guides) {
    if (guide.type === "vertical") {
      if (Math.abs(draggedBounds.left - guide.position) < threshold) {
        snappedPosition.x = guide.position - draggedPosition.x
      }
      if (Math.abs(draggedBounds.centerX - guide.position) < threshold) {
        snappedPosition.x =
          guide.position -
          draggedPosition.x -
          (draggedNode.measured?.width || 100) / 2
      }
      if (Math.abs(draggedBounds.right - guide.position) < threshold) {
        snappedPosition.x =
          guide.position -
          draggedPosition.x -
          (draggedNode.measured?.width || 100)
      }
    } else if (guide.type === "horizontal") {
      if (Math.abs(draggedBounds.top - guide.position) < threshold) {
        snappedPosition.y = guide.position - draggedPosition.y
      }
      if (Math.abs(draggedBounds.centerY - guide.position) < threshold) {
        snappedPosition.y =
          guide.position -
          draggedPosition.y -
          (draggedNode.measured?.height || 100) / 2
      }
      if (Math.abs(draggedBounds.bottom - guide.position) < threshold) {
        snappedPosition.y =
          guide.position -
          draggedPosition.y -
          (draggedNode.measured?.height || 100)
      }
    }
  }

  return snappedPosition
}
