import { useCallback, useRef, useSyncExternalStore } from "react"
import { useEditorContext } from "@/contexts"
import { useSharedDiagramId } from "./useSharedDiagramId"
import type { UmlStudioEditor } from "@umlstudio/core"

export interface Collaborator {
  id: string
  name?: string
  color?: string
  imageUrl?: string
  clientIds?: number[]
  isLocal?: boolean
}

const EMPTY_COLLABORATORS: Collaborator[] = []

export function sameCollaborators(a: Collaborator[], b: Collaborator[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const current = a[i]
    const incoming = b[i]
    if (
      current.id !== incoming.id ||
      current.name !== incoming.name ||
      current.color !== incoming.color ||
      current.imageUrl !== incoming.imageUrl ||
      current.isLocal !== incoming.isLocal ||
      (current.clientIds?.length ?? 0) !== (incoming.clientIds?.length ?? 0)
    ) {
      return false
    }
  }
  return true
}

export function readCollaborators(editor?: UmlStudioEditor): Collaborator[] {
  if (!editor?.getCollaborators) return EMPTY_COLLABORATORS
  try {
    const incoming = (editor.getCollaborators() as Collaborator[]) ?? EMPTY_COLLABORATORS
    return incoming.filter((c) => c.isLocal || c.name || c.imageUrl || c.id)
  } catch {
    return EMPTY_COLLABORATORS
  }
}

export const COLLABORATIVE_USER_THRESHOLD = 2

export function getActiveParticipantCount(
  editor?: UmlStudioEditor,
  collaborators: Collaborator[] = []
): number {
  let awarenessCount = 0
  if (editor?.getAwarenessStates) {
    try {
      const states = editor.getAwarenessStates()
      if (states && typeof states.size === "number") {
        awarenessCount = states.size
      }
    } catch {
      // ignore
    }
  }

  const totalClients = collaborators.reduce((acc, c) => {
    const clients = c.clientIds?.length ?? 1
    return acc + Math.max(clients, 1)
  }, 0)

  return Math.max(collaborators.length, totalClients, awarenessCount)
}

export function isCollaborativeImportExportBlocked(
  isShared: boolean,
  participantCount: number
): boolean {
  return isShared && participantCount >= COLLABORATIVE_USER_THRESHOLD
}

export interface CollaboratorStoreSnapshot {
  collaborators: Collaborator[]
  collaboratorCount: number
  participantCount: number
  isShared: boolean
  isCollaborativeBlocked: boolean
}

const EMPTY_SNAPSHOT: CollaboratorStoreSnapshot = {
  collaborators: EMPTY_COLLABORATORS,
  collaboratorCount: 0,
  participantCount: 0,
  isShared: false,
  isCollaborativeBlocked: false,
}

export function useCollaborators() {
  const { editor } = useEditorContext()
  const sharedDiagramId = useSharedDiagramId()
  const isShared = Boolean(sharedDiagramId)
  const snapshotRef = useRef<CollaboratorStoreSnapshot>(EMPTY_SNAPSHOT)

  const computeSnapshot = useCallback((): CollaboratorStoreSnapshot => {
    const list = readCollaborators(editor)
    const count = getActiveParticipantCount(editor, list)
    const blocked = isCollaborativeImportExportBlocked(isShared, count)
    return {
      collaborators: list,
      collaboratorCount: list.length,
      participantCount: count,
      isShared,
      isCollaborativeBlocked: blocked,
    }
  }, [editor, isShared])

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!editor) {
        snapshotRef.current = computeSnapshot()
        return () => {}
      }

      const updateIfChanged = () => {
        const next = computeSnapshot()
        const prev = snapshotRef.current
        const changed =
          prev.isShared !== next.isShared ||
          prev.participantCount !== next.participantCount ||
          prev.collaboratorCount !== next.collaboratorCount ||
          prev.isCollaborativeBlocked !== next.isCollaborativeBlocked ||
          !sameCollaborators(prev.collaborators, next.collaborators)

        if (changed) {
          snapshotRef.current = next
          onStoreChange()
        }
      }

      updateIfChanged()

      const subs: number[] = []
      if (editor.subscribeToCollaboratorChanges) {
        subs.push(editor.subscribeToCollaboratorChanges(updateIfChanged))
      }
      if (editor.subscribeToAwarenessChanges) {
        subs.push(editor.subscribeToAwarenessChanges(updateIfChanged))
      }

      return () => {
        subs.forEach((id) => editor.unsubscribe(id))
      }
    },
    [editor, computeSnapshot]
  )

  const getSnapshot = useCallback(() => {
    if (snapshotRef.current === EMPTY_SNAPSHOT && (editor || isShared)) {
      snapshotRef.current = computeSnapshot()
    }
    return snapshotRef.current
  }, [editor, isShared, computeSnapshot])

  const store = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SNAPSHOT)

  return store
}
