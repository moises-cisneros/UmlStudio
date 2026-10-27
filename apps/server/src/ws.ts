import WebSocket, { WebSocketServer } from "ws"
import type { IncomingMessage } from "http"
import { URL } from "url"
import { logger } from "./logger.js"
import type { RoomAiEvent } from "@umlstudio/core"
import type { ControlEvent, Envelope } from "./types.js"
import {
  applyAwarenessUpdate,
  Awareness,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness"
import * as encoding from "lib0/encoding"
import * as Y from "yjs"
import * as decoding from "lib0/decoding"
import { productivityCollector } from "./services/productivity-collector.js"
import {
  createBoardReplicaRegistry,
  encodeSyncRequestFrame,
  type BoardReplica,
} from "./services/room-ai/board-replica.js"
import type { AuthorshipRepository } from "./services/room-ai/authorship-repository.js"

const AWARENESS_MSG_TYPE = 3
const DIAGRAM_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

type RoomAwarenessState = {
  doc: Y.Doc
  awareness: Awareness
}

interface ExtendedWebSocket extends WebSocket {
  diagramId?: string
  userId?: string
  clientUserId?: string
  sharedUserProfile?: SharedUserProfile
  /** User id from the verified JWT; unlike `userId` it is never derived from client-sent data. */
  authenticatedUserId?: string
}

interface SharedUserProfile {
  name?: string
  avatar?: string
  color?: string
}

export interface RelayServer {
  publishControl: (diagramId: string, control: ControlEvent) => void
  publishRoomAi: (diagramId: string, event: RoomAiEvent) => void
  close: () => Promise<void>
  roomCount: () => number
  /** Server-side replica of the room board, or undefined when the room is empty. */
  getBoardReplica: (diagramId: string) => BoardReplica | undefined
}

export interface StartOptions {
  port?: number
  host?: string
  server?: WebSocket.ServerOptions["server"]
  maxSocketsPerRoom?: number
  verifyToken?: (token: string) => Promise<string>
  resolveUserProfile?: (userId: string) => Promise<SharedUserProfile | undefined>
  /** Where to record which authenticated user created or changed each board element. */
  authorship?: AuthorshipRepository
}

/** Close code for rejected shared-room joins (app-level unauthorized). */
export const WS_UNAUTHORIZED_CLOSE_CODE = 4401

const MAX_PAYLOAD_BYTES = 1_048_576
const MAX_PENDING_MESSAGE_BYTES = MAX_PAYLOAD_BYTES
const SHARED_PROFILE_TIMEOUT_MS = 1_000

const HEARTBEAT_INTERVAL_MS = 30_000
const DEFAULT_MAX_SOCKETS_PER_ROOM = 100

interface ExtendedWebSocketWithAlive extends ExtendedWebSocket {
  isAlive?: boolean
}

export function startRelayServer(opts: StartOptions): RelayServer {
  const maxSocketsPerRoom = opts.maxSocketsPerRoom ?? DEFAULT_MAX_SOCKETS_PER_ROOM
  const wssOptions: WebSocket.ServerOptions = {
    maxPayload: MAX_PAYLOAD_BYTES,
    perMessageDeflate: false,
  }
  if (opts.server) {
    wssOptions.server = opts.server
  } else {
    wssOptions.port = opts.port ?? 4444
    wssOptions.host = opts.host
  }
  const wss = new WebSocketServer(wssOptions)
  const rooms: Map<string, Set<ExtendedWebSocket>> = new Map()
  const roomAwarenessStates: Map<string, RoomAwarenessState> = new Map()
  const awarenessClientIdsBySocket = new WeakMap<ExtendedWebSocket, Set<number>>()
  const boardReplicas = createBoardReplicaRegistry({
    onElementsAuthored: ({ roomId, authorId, elementIds }) => {
      opts.authorship?.record(roomId, elementIds, authorId).catch((err) => {
        logger.error({ err, diagramId: roomId }, "ws authorship record failed")
      })
    },
  })

  function getOrCreateAwarenessState(diagramId: string): RoomAwarenessState {
    const existing = roomAwarenessStates.get(diagramId)
    if (existing) return existing
    const doc = new Y.Doc()
    const awareness = new Awareness(doc)
    const state: RoomAwarenessState = { doc, awareness }
    roomAwarenessStates.set(diagramId, state)
    return state
  }

  /**
   * Decode an awareness update payload to extract the client IDs that
   * are present (non-null state) or removed (null state).
   */
  function decodeAwarenessUpdateClients(update: Uint8Array): {
    present: number[]
    removed: number[]
  } {
    const present: number[] = []
    const removed: number[] = []
    try {
      const decoder = decoding.createDecoder(update)
      const len = decoding.readVarUint(decoder)
      for (let i = 0; i < len; i++) {
        const clientId = decoding.readVarUint(decoder)
        decoding.readVarUint(decoder) // clock
        const state = JSON.parse(decoding.readVarString(decoder))
        if (state === null) {
          removed.push(clientId)
        } else {
          present.push(clientId)
        }
      }
    } catch {
      // Decode error ignored for malformed awareness frame
    }
    return { present, removed }
  }

  function normalizeSharedAwarenessUpdate(
    update: Uint8Array,
    userId: string,
    profile: SharedUserProfile | undefined
  ): Uint8Array | undefined {
    try {
      const decoder = decoding.createDecoder(update)
      const encoder = encoding.createEncoder()
      const len = decoding.readVarUint(decoder)
      encoding.writeVarUint(encoder, len)

      const sharedUser = {
        id: userId,
        ...(profile?.name ? { name: profile.name } : {}),
        ...(profile?.color ? { color: profile.color } : {}),
        ...(profile?.avatar ? { imageUrl: profile.avatar } : {}),
      }

      for (let i = 0; i < len; i++) {
        const clientId = decoding.readVarUint(decoder)
        const clock = decoding.readVarUint(decoder)
        const state = JSON.parse(decoding.readVarString(decoder)) as unknown
        const normalizedState =
          state === null
            ? null
            : state && typeof state === "object" && !Array.isArray(state)
              ? { ...(state as Record<string, unknown>), user: sharedUser }
              : undefined

        if (normalizedState === undefined) return undefined
        encoding.writeVarUint(encoder, clientId)
        encoding.writeVarUint(encoder, clock)
        encoding.writeVarString(encoder, JSON.stringify(normalizedState))
      }

      return encoding.toUint8Array(encoder)
    } catch {
      return undefined
    }
  }

  /**
   * When a socket disconnects, remove its tracked awareness client IDs
   * from the room awareness state and broadcast the removal to peers.
   */
  function broadcastAwarenessRemoval(
    diagramId: string,
    disconnectedSocket: ExtendedWebSocket,
    removedClientIds: number[]
  ): void {
    if (removedClientIds.length === 0) return
    const roomState = roomAwarenessStates.get(diagramId)
    if (!roomState) return

    const known = removedClientIds.filter((id) => roomState.awareness.meta.has(id))
    if (known.length === 0) return

    removeAwarenessStates(roomState.awareness, known, disconnectedSocket)

    const awarenessUpdate = encodeAwarenessUpdate(roomState.awareness, known)
    const framedUpdate = new Uint8Array(1 + awarenessUpdate.length)
    framedUpdate[0] = AWARENESS_MSG_TYPE
    framedUpdate.set(awarenessUpdate, 1)

    const payload = JSON.stringify({
      diagramData: Buffer.from(framedUpdate).toString("base64"),
    })

    const room = rooms.get(diagramId)
    if (!room) return
    for (const client of room) {
      if (client === disconnectedSocket) continue
      if (client.readyState !== WebSocket.OPEN) continue
      try {
        client.send(payload)
      } catch (err) {
        logger.error({ err, diagramId }, "ws awareness removal send failed")
      }
    }
  }

  wss.on("error", (err: NodeJS.ErrnoException) => {
    logger.error({ err, code: err.code }, "ws server error")
  })

  wss.on("connection", (ws: ExtendedWebSocketWithAlive, request: IncomingMessage) => {
    void handleConnection(ws, request)
  })

  async function handleConnection(
    ws: ExtendedWebSocketWithAlive,
    request: IncomingMessage
  ): Promise<void> {
    let sharedUserProfileReady: Promise<void> = Promise.resolve()
    const url = new URL(request.url ?? "", `http://${request.headers.host}`)
    const diagramId = url.searchParams.get("diagramId")
    if (!diagramId || !DIAGRAM_ID_RE.test(diagramId)) {
      ws.close(1008, "Invalid diagramId")
      return
    }
    const validDiagramId = diagramId

    const mode = url.searchParams.get("mode") ?? "local"
    if (mode === "shared") {
      const token = url.searchParams.get("token")
      if (!token || !opts.verifyToken) {
        ws.close(WS_UNAUTHORIZED_CLOSE_CODE, "Authentication required")
        return
      }
      try {
        const verifiedUserId = await opts.verifyToken(token)
        ws.userId = verifiedUserId
        ws.authenticatedUserId = verifiedUserId
        let profileTimeout: ReturnType<typeof setTimeout> | undefined
        sharedUserProfileReady = Promise.race([
          Promise.resolve().then(() => opts.resolveUserProfile?.(verifiedUserId)),
          new Promise<undefined>((resolve) => {
            profileTimeout = setTimeout(() => {
              logger.warn(
                { diagramId, userId: verifiedUserId },
                "ws shared profile lookup timed out"
              )
              resolve(undefined)
            }, SHARED_PROFILE_TIMEOUT_MS)
          }),
        ])
          .then((profile) => {
            if (profile) ws.sharedUserProfile = profile
          })
          .catch((err: unknown) => {
            logger.warn({ err, diagramId, userId: verifiedUserId }, "ws shared profile unavailable")
          })
          .finally(() => clearTimeout(profileTimeout))
      } catch {
        ws.close(WS_UNAUTHORIZED_CLOSE_CODE, "Authentication required")
        return
      }
      // Token is verified then discarded — never logged.
      logger.info(
        { event: "ws.shared.join", diagramId, userId: ws.userId },
        "ws shared join admitted"
      )
    }
    ws.isAlive = true
    ws.on("pong", () => {
      ws.isAlive = true
    })
    let room = rooms.get(diagramId)
    if (!room) {
      room = new Set()
      rooms.set(diagramId, room)
    }
    if (room.size >= maxSocketsPerRoom) {
      logger.warn({ diagramId, size: room.size }, "ws room over capacity, rejecting connection")
      ws.close(1013, "Try again later")
      return
    }
    room.add(ws)
    ws.diagramId = diagramId
    awarenessClientIdsBySocket.set(ws, new Set())
    getOrCreateAwarenessState(diagramId)
    const isFirstSocketInRoom = room.size === 1
    if (isFirstSocketInRoom) boardReplicas.open(diagramId)

    function processMessage(message: string): void {
      let broadcastMessage = message

      try {
        const parsed = JSON.parse(message) as Record<string, unknown>

        if (typeof parsed.diagramData === "string") {
          const roomState = roomAwarenessStates.get(validDiagramId)
          if (roomState) {
            boardReplicas.applyFrame(validDiagramId, parsed.diagramData, ws.authenticatedUserId)
            const decoded = Buffer.from(parsed.diagramData, "base64")
            if (decoded.length > 0 && decoded[0] === AWARENESS_MSG_TYPE) {
              const rawAwarenessUpdate = new Uint8Array(decoded.subarray(1))
              const awarenessUpdate = ws.userId
                ? normalizeSharedAwarenessUpdate(
                    rawAwarenessUpdate,
                    ws.userId,
                    ws.sharedUserProfile
                  )
                : rawAwarenessUpdate
              if (!awarenessUpdate) {
                logger.warn(
                  { diagramId: validDiagramId, userId: ws.userId },
                  "ws invalid shared awareness update"
                )
                return
              }
              if (ws.userId) {
                const normalizedFrame = new Uint8Array(1 + awarenessUpdate.length)
                normalizedFrame[0] = AWARENESS_MSG_TYPE
                normalizedFrame.set(awarenessUpdate, 1)
                broadcastMessage = JSON.stringify({
                  diagramData: Buffer.from(normalizedFrame).toString("base64"),
                })
              }
              applyAwarenessUpdate(roomState.awareness, awarenessUpdate, ws)

              const { present, removed } = decodeAwarenessUpdateClients(awarenessUpdate)
              const socketIds = awarenessClientIdsBySocket.get(ws)
              if (socketIds) {
                for (const id of present) {
                  socketIds.add(id)
                  const clientState = roomState.awareness.getStates().get(id) as
                    | Record<string, unknown>
                    | undefined
                  if (clientState) {
                    const user = clientState.user as
                      | { id?: string; name?: string; color?: string }
                      | undefined
                    const clientUserId =
                      typeof user?.id === "string" && user.id.length > 0 ? user.id : undefined
                    const effectiveUserId = ws.userId ?? ws.clientUserId ?? clientUserId

                    if (effectiveUserId) {
                      if (!ws.userId && !ws.clientUserId && clientUserId) {
                        ws.clientUserId = clientUserId
                      }
                      const effectiveUserName = ws.userId ? ws.sharedUserProfile?.name : user?.name
                      const effectiveColor = ws.userId ? ws.sharedUserProfile?.color : user?.color

                      productivityCollector.recordActivity(validDiagramId, {
                        userId: effectiveUserId,
                        userName: effectiveUserName,
                        color: effectiveColor,
                      })

                      if ("selectedElementId" in clientState) {
                        const selectedElementId = clientState.selectedElementId
                        const selectedElementName =
                          typeof clientState.selectedElementName === "string"
                            ? clientState.selectedElementName
                            : typeof clientState.nodeName === "string"
                              ? clientState.nodeName
                              : undefined
                        productivityCollector.recordNodeLock(
                          validDiagramId,
                          {
                            userId: effectiveUserId,
                            userName: effectiveUserName,
                          },
                          typeof selectedElementId === "string" ? selectedElementId : null,
                          selectedElementName
                        )
                      }
                    }
                  }
                }
                for (const id of removed) socketIds.delete(id)
              }
            }
          }
        }

        if (
          parsed.kind === "telemetry" &&
          typeof parsed.telemetry === "object" &&
          parsed.telemetry !== null
        ) {
          const t = parsed.telemetry as Record<string, unknown>
          const telemetryUserId =
            typeof t.userId === "string" && t.userId.length > 0 ? t.userId : undefined
          const effectiveUserId = ws.userId ?? ws.clientUserId ?? telemetryUserId
          if (effectiveUserId) {
            if (!ws.userId && !ws.clientUserId && telemetryUserId) {
              ws.clientUserId = telemetryUserId
            }
            productivityCollector.recordActivity(
              validDiagramId,
              {
                userId: effectiveUserId,
                userName: ws.userId
                  ? ws.sharedUserProfile?.name
                  : typeof t.userName === "string"
                    ? t.userName
                    : undefined,
                color: ws.userId
                  ? ws.sharedUserProfile?.color
                  : typeof t.color === "string"
                    ? t.color
                    : undefined,
              },
              {
                createdClasses: typeof t.createdClasses === "number" ? t.createdClasses : undefined,
                createdMethods: typeof t.createdMethods === "number" ? t.createdMethods : undefined,
                refactors: typeof t.refactors === "number" ? t.refactors : undefined,
              }
            )
          }
          return
        }

        if (ws.userId) {
          productivityCollector.recordActivity(validDiagramId, {
            userId: ws.userId,
          })
        }

        if (parsed.kind === "control") {
          logger.warn(
            {
              diagramId: validDiagramId,
              type: (parsed as { control?: { type?: string } }).control?.type,
            },
            "ws control envelope from client dropped"
          )
          return
        }

        if (parsed.kind === "room-ai") {
          logger.warn(
            { diagramId, type: (parsed as { event?: { type?: string } }).event?.type },
            "ws room-ai envelope from client dropped"
          )
          return
        }
      } catch {
        // Payload is not JSON or not a control envelope; ignore and treat as regular broadcast
      }

      broadcast(rooms, validDiagramId, broadcastMessage, ws)
    }

    let pendingMessageBytes = 0
    let messageQueue = Promise.resolve()
    ws.on("message", (raw: WebSocket.RawData) => {
      const message =
        typeof raw === "string" ? raw : raw instanceof Buffer ? raw.toString("utf-8") : ""
      const messageBytes = Buffer.byteLength(message, "utf-8")
      if (pendingMessageBytes + messageBytes > MAX_PENDING_MESSAGE_BYTES) {
        logger.warn(
          { diagramId: validDiagramId, pendingMessageBytes },
          "ws profile-pending message queue over capacity"
        )
        ws.close(1013, "Try again later")
        return
      }
      pendingMessageBytes += messageBytes

      messageQueue = messageQueue
        .then(async () => {
          try {
            await sharedUserProfileReady
            if (ws.readyState === WebSocket.OPEN) processMessage(message)
          } finally {
            pendingMessageBytes -= messageBytes
          }
        })
        .catch((err: unknown) => {
          logger.error({ err, diagramId: validDiagramId }, "ws message processing failed")
        })
    })

    ws.on("close", () => {
      const userId = ws.userId ?? ws.clientUserId
      if (userId) {
        productivityCollector.recordDisconnection(validDiagramId, userId)
      }
      const r = rooms.get(validDiagramId)
      if (r) {
        r.delete(ws)

        // Broadcast awareness removal for this socket's tracked clients
        const socketIds = awarenessClientIdsBySocket.get(ws)
        if (socketIds && socketIds.size > 0) {
          broadcastAwarenessRemoval(validDiagramId, ws, Array.from(socketIds))
        }

        if (r.size === 0) {
          rooms.delete(validDiagramId)
          boardReplicas.close(validDiagramId)
          const roomState = roomAwarenessStates.get(validDiagramId)
          if (roomState) {
            roomState.awareness.destroy()
            roomState.doc.destroy()
            roomAwarenessStates.delete(validDiagramId)
          }
        }
      }
    })

    ws.on("error", (err: Error) => {
      logger.error({ err, diagramId }, "ws client error")
    })

    // The replica starts empty: ask the first client of the room for the full board state.
    if (isFirstSocketInRoom) ws.send(encodeSyncRequestFrame())
  }

  const heartbeatInterval = setInterval(() => {
    for (const room of rooms.values()) {
      for (const client of room) {
        const alive = client as ExtendedWebSocketWithAlive
        if (alive.isAlive === false) {
          alive.terminate()
          continue
        }
        alive.isAlive = false
        try {
          alive.ping()
        } catch {
          alive.terminate()
        }
      }
    }
  }, HEARTBEAT_INTERVAL_MS)

  function publishControl(diagramId: string, control: ControlEvent): void {
    const envelope: Envelope = { kind: "control", control }
    const message = JSON.stringify(envelope)
    broadcast(rooms, diagramId, message, null)
  }

  function publishRoomAi(diagramId: string, event: RoomAiEvent): void {
    const envelope: Envelope = { kind: "room-ai", event }
    broadcast(rooms, diagramId, JSON.stringify(envelope), null)
  }

  async function close(): Promise<void> {
    clearInterval(heartbeatInterval)
    for (const room of rooms.values()) {
      for (const client of room) {
        try {
          client.close()
        } catch {
          // Ignore.
        }
      }
    }
    rooms.clear()
    boardReplicas.closeAll()
    await new Promise<void>((resolve) => wss.close(() => resolve()))
  }

  logger.info(
    { event: "ws.start", host: opts.host ?? "0.0.0.0", port: opts.port },
    "ws relay started"
  )

  return {
    publishControl,
    publishRoomAi,
    close,
    roomCount: () => rooms.size,
    getBoardReplica: (diagramId) => boardReplicas.get(diagramId),
  }
}

function broadcast(
  rooms: Map<string, Set<ExtendedWebSocket>>,
  diagramId: string,
  message: string,
  exclude: ExtendedWebSocket | null
): void {
  const room = rooms.get(diagramId)
  if (!room) return
  for (const client of room) {
    if (client === exclude) continue
    if (client.readyState !== WebSocket.OPEN) continue
    try {
      client.send(message)
    } catch (err) {
      logger.error({ err, diagramId }, "ws send failed")
    }
  }
}
