import { DiagramNodeTypeRecord, type DiagramNodeType } from "@/nodes"
import { XYPosition, type Node } from "@xyflow/react"
import { log } from "../logger"

export const getPositionOnCanvas = (
  node: Node,
  allNodes: ReadonlyArray<Node>
): XYPosition => {
  const position: XYPosition = { x: node.position.x, y: node.position.y }
  let parent = node.parentId
    ? allNodes.find((n) => n.id === node.parentId)
    : null

  while (parent) {
    position.x = position.x + parent.position.x
    position.y = position.y + parent.position.y

    parent = parent.parentId
      ? allNodes.find((n) => n.id === parent!.parentId)
      : null
  }

  return position
}

export const resizeAllParents = (node: Node, allNodes: Node[]) => {
  let currentNode = node

  while (currentNode.parentId) {
    const parent = allNodes.find((n) => n.id === currentNode.parentId)!
    const allChildren = allNodes.filter((n) => n.parentId === parent.id)

    if (currentNode.position.x < 0) {
      const parentPositionUpdateOffsetX = -1 * currentNode.position.x
      parent.position.x = parent.position.x - parentPositionUpdateOffsetX
      parent.width = parent.width! + parentPositionUpdateOffsetX
      allChildren.forEach((child) => {
        child.position.x = child.position.x + parentPositionUpdateOffsetX
      })
    }
    if (currentNode.position.y < 0) {
      const parentPositionUpdateOffsetY = -1 * currentNode.position.y
      parent.position.y = parent.position.y - parentPositionUpdateOffsetY
      parent.height = parent.height! + parentPositionUpdateOffsetY
      allChildren.forEach((child) => {
        child.position.y = child.position.y + parentPositionUpdateOffsetY
      })
    }
    if (currentNode.position.x + currentNode.width! > parent.width!) {
      parent.width = currentNode.position.x + currentNode.width!
    }
    if (currentNode.position.y + currentNode.height! > parent.height!) {
      parent.height = currentNode.position.y + currentNode.height!
    }

    currentNode = allNodes.find((n) => n.id === currentNode.parentId)!
  }
  return allNodes
}

export function sortNodesTopologically(nodes: Node[]): Node[] {
  const nodeMap = new Map<string, Node>()
  nodes.forEach((node) => nodeMap.set(node.id, node))

  const sorted: Node[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()

  const visit = (node: Node) => {
    if (visited.has(node.id)) return
    if (visiting.has(node.id)) {
      throw new Error(`Circular dependency detected at node ${node.id}`)
    }

    visiting.add(node.id)

    if (node.parentId) {
      const parentNode = nodeMap.get(node.parentId)
      if (parentNode) {
        visit(parentNode)
      } else {
        log.warn(
          `Parent node with id ${node.parentId} not found for node ${node.id}`
        )
      }
    }

    visiting.delete(node.id)
    visited.add(node.id)
    sorted.push(node)
  }

  nodes.forEach((node) => {
    if (!visited.has(node.id)) {
      visit(node)
    }
  })

  return sorted
}

type NodeLabelCapabilities = {
  wrapsName: boolean
  rendersNameLabel: boolean
}

const NODE_LABEL_CAPABILITIES = {
  package: { wrapsName: true, rendersNameLabel: true },
  class: { wrapsName: false, rendersNameLabel: true },
  colorDescription: { wrapsName: true, rendersNameLabel: true },
  titleAndDesctiption: { wrapsName: false, rendersNameLabel: true },
} as const satisfies Record<DiagramNodeType, NodeLabelCapabilities>

export const supportsMultilineName = (nodeType?: string): boolean =>
  !!nodeType &&
  nodeType in NODE_LABEL_CAPABILITIES &&
  NODE_LABEL_CAPABILITIES[nodeType as DiagramNodeType].wrapsName

export const rendersNameLabel = (nodeType?: string): boolean => {
  if (!nodeType) return true
  if (!(nodeType in NODE_LABEL_CAPABILITIES)) return true
  return NODE_LABEL_CAPABILITIES[nodeType as DiagramNodeType].rendersNameLabel
}

export const isParentNodeType = (nodeType?: string) => {
  if (!nodeType) {
    return false
  }

  return nodeType === DiagramNodeTypeRecord.package
}
