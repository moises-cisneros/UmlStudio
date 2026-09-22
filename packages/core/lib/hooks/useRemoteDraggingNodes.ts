import { useEffect, useState } from "react"
import type { Node } from "@xyflow/react"
import type { CollaborationAwarenessApi } from "@/components/collaboration/CollaborationLayer"
import type { CollaborationState, DraggingNode } from "@/typings"

export type RemoteDraggingOverlay = Map<string, DraggingNode>

const sameOverlay = (a: RemoteDraggingOverlay, b: RemoteDraggingOverlay): boolean => {
  if (a.size !== b.size) return false
  for (const [id, node] of a) {
    const other = b.get(id)
    if (
      !other ||
      other.position.x !== node.position.x ||
      other.position.y !== node.position.y ||
      (other.width ?? null) !== (node.width ?? null) ||
      (other.height ?? null) !== (node.height ?? null)
    ) {
      return false
    }
  }
  return true
}

const buildOverlay = (
  states: Map<number, CollaborationState>,
  localClientId: number
): RemoteDraggingOverlay => {
  const overlay: RemoteDraggingOverlay = new Map()
  for (const [clientId, state] of states) {
    if (clientId === localClientId) continue
    const draggingNodes = state.draggingNodes
    if (!draggingNodes) continue
    for (const node of draggingNodes) overlay.set(node.id, node)
  }
  return overlay
}

const EMPTY_OVERLAY: RemoteDraggingOverlay = new Map()

export const useRemoteDraggingNodes = (
  awareness: CollaborationAwarenessApi,
  active: boolean
): RemoteDraggingOverlay => {
  const [overlay, setOverlay] = useState<RemoteDraggingOverlay>(() => new Map())

  useEffect(() => {
    if (!active) {
      return
    }

    const localClientId = awareness.getLocalAwarenessClientId()
    const rebuild = (states: Map<number, CollaborationState>) => {
      const next = buildOverlay(states, localClientId)
      setOverlay((prev) => (sameOverlay(prev, next) ? prev : next))
    }

    rebuild(awareness.getAwarenessStates())
    const unsubscribe = awareness.subscribeToAwarenessChanges(rebuild)
    return () => {
      unsubscribe()
      setOverlay((prev) => (prev.size === 0 ? prev : new Map()))
    }
  }, [awareness, active])

  return active ? overlay : EMPTY_OVERLAY
}

export const applyDraggingOverlay = (nodes: Node[], overlay: RemoteDraggingOverlay): Node[] => {
  if (overlay.size === 0) return nodes
  return nodes.map((node) => {
    const dragged = overlay.get(node.id)
    if (!dragged) return node
    return {
      ...node,
      position: dragged.position,
      ...(dragged.width != null ? { width: dragged.width } : {}),
      ...(dragged.height != null ? { height: dragged.height } : {}),
    }
  })
}
