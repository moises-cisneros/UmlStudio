import * as Y from "yjs"
import type { UMLModel } from "@umlstudio/core"

/** Sync message types of the client protocol (see `packages/core/lib/sync/yjsSync.ts`). */
export const SYNC_REQUEST_MSG_TYPE = 0
export const DOC_UPDATE_MSG_TYPE = 1

const REMOTE_ORIGIN = "relay"

export interface BoardReplica {
  readonly roomId: string
  /** Current board as a `UMLModel` snapshot. */
  getModel: () => UMLModel
  /** Monotonic counter, incremented each time the board changes. */
  getRevision: () => number
  /** Apply a base64 relay frame; returns true when it was a document update. */
  applyFrame: (base64Frame: string) => boolean
  destroy: () => void
}

export interface BoardReplicaRegistry {
  /** Create the replica for a room if missing and return it. */
  open: (roomId: string) => BoardReplica
  get: (roomId: string) => BoardReplica | undefined
  /** Feed a relayed frame to the room replica; ignores unknown rooms. */
  applyFrame: (roomId: string, base64Frame: string) => boolean
  close: (roomId: string) => void
  closeAll: () => void
}

/** Frame asking a client for its full document state (sync message type `0`). */
export function encodeSyncRequestFrame(): string {
  return JSON.stringify({
    diagramData: Buffer.from(Uint8Array.of(SYNC_REQUEST_MSG_TYPE)).toString("base64"),
  })
}

function buildModel(roomId: string, doc: Y.Doc): UMLModel {
  const metadata = doc.getMap<string>("diagramMetadata")
  return {
    version: "4.0.0",
    id: roomId,
    title: metadata.get("diagramTitle") ?? "",
    type: "ClassDiagram",
    nodes: Array.from(doc.getMap("nodes").values()) as UMLModel["nodes"],
    edges: Array.from(doc.getMap("edges").values()) as UMLModel["edges"],
    assessments: Object.fromEntries(doc.getMap("assessments").entries()) as UMLModel["assessments"],
  }
}

export function createBoardReplica(roomId: string): BoardReplica {
  const doc = new Y.Doc()
  let revision = 0
  doc.on("update", () => {
    revision += 1
  })

  return {
    roomId,
    getModel: () => buildModel(roomId, doc),
    getRevision: () => revision,
    applyFrame: (base64Frame) => {
      const frame = Buffer.from(base64Frame, "base64")
      if (frame.length === 0 || frame[0] !== DOC_UPDATE_MSG_TYPE) return false
      try {
        Y.applyUpdate(doc, new Uint8Array(frame.subarray(1)), REMOTE_ORIGIN)
        return true
      } catch {
        // Malformed update from a client: the relay keeps working, the replica skips it.
        return false
      }
    },
    destroy: () => doc.destroy(),
  }
}

export function createBoardReplicaRegistry(): BoardReplicaRegistry {
  const replicas = new Map<string, BoardReplica>()

  return {
    open: (roomId) => {
      const existing = replicas.get(roomId)
      if (existing) return existing
      const replica = createBoardReplica(roomId)
      replicas.set(roomId, replica)
      return replica
    },
    get: (roomId) => replicas.get(roomId),
    applyFrame: (roomId, base64Frame) => replicas.get(roomId)?.applyFrame(base64Frame) ?? false,
    close: (roomId) => {
      replicas.get(roomId)?.destroy()
      replicas.delete(roomId)
    },
    closeAll: () => {
      for (const replica of replicas.values()) replica.destroy()
      replicas.clear()
    },
  }
}
