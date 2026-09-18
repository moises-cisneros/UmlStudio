import WebSocket, { WebSocketServer } from "ws";
import type { IncomingMessage } from "http";
import { URL } from "url";
import { logger } from "./logger.js";
import type { ControlEvent, Envelope } from "./types.js";
import {
  applyAwarenessUpdate,
  Awareness,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import * as Y from "yjs";
import * as decoding from "lib0/decoding";

const AWARENESS_MSG_TYPE = 3;
const DIAGRAM_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

type RoomAwarenessState = {
  doc: Y.Doc;
  awareness: Awareness;
};

interface ExtendedWebSocket extends WebSocket {
  diagramId?: string;
  userId?: string;
}

interface RelayServer {
  publishControl: (diagramId: string, control: ControlEvent) => void;
  close: () => Promise<void>;
  roomCount: () => number;
}

interface StartOptions {
  port: number;
  host?: string;
  maxSocketsPerRoom?: number;
  verifyToken?: (token: string) => Promise<string>;
}

/** Close code for rejected shared-room joins (app-level unauthorized). */
export const WS_UNAUTHORIZED_CLOSE_CODE = 4401;

const MAX_PAYLOAD_BYTES = 1_048_576;

const HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_MAX_SOCKETS_PER_ROOM = 100;

interface ExtendedWebSocketWithAlive extends ExtendedWebSocket {
  isAlive?: boolean;
}

export function startRelayServer(opts: StartOptions): RelayServer {
  const maxSocketsPerRoom =
    opts.maxSocketsPerRoom ?? DEFAULT_MAX_SOCKETS_PER_ROOM;
  const wss = new WebSocketServer({
    port: opts.port,
    host: opts.host,
    maxPayload: MAX_PAYLOAD_BYTES,
    perMessageDeflate: false,
  });
  const rooms: Map<string, Set<ExtendedWebSocket>> = new Map();
  const roomAwarenessStates: Map<string, RoomAwarenessState> = new Map();
  const awarenessClientIdsBySocket = new WeakMap<
    ExtendedWebSocket,
    Set<number>
  >();

  function getOrCreateAwarenessState(diagramId: string): RoomAwarenessState {
    const existing = roomAwarenessStates.get(diagramId);
    if (existing) return existing;
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    const state: RoomAwarenessState = { doc, awareness };
    roomAwarenessStates.set(diagramId, state);
    return state;
  }

  /**
   * Decode an awareness update payload to extract the client IDs that
   * are present (non-null state) or removed (null state).
   */
  function decodeAwarenessUpdateClients(update: Uint8Array): {
    present: number[];
    removed: number[];
  } {
    const present: number[] = [];
    const removed: number[] = [];
    try {
      const decoder = decoding.createDecoder(update);
      const len = decoding.readVarUint(decoder);
      for (let i = 0; i < len; i++) {
        const clientId = decoding.readVarUint(decoder);
        decoding.readVarUint(decoder); // clock
        const state = JSON.parse(decoding.readVarString(decoder));
        if (state === null) {
          removed.push(clientId);
        } else {
          present.push(clientId);
        }
      }
    } catch {
      // Decode error ignored for malformed awareness frame
    }
    return { present, removed };
  }

  /**
   * When a socket disconnects, remove its tracked awareness client IDs
   * from the room awareness state and broadcast the removal to peers.
   */
  function broadcastAwarenessRemoval(
    diagramId: string,
    disconnectedSocket: ExtendedWebSocket,
    removedClientIds: number[],
  ): void {
    if (removedClientIds.length === 0) return;
    const roomState = roomAwarenessStates.get(diagramId);
    if (!roomState) return;

    const known = removedClientIds.filter((id) =>
      roomState.awareness.meta.has(id),
    );
    if (known.length === 0) return;

    removeAwarenessStates(roomState.awareness, known, disconnectedSocket);

    const awarenessUpdate = encodeAwarenessUpdate(roomState.awareness, known);
    const framedUpdate = new Uint8Array(1 + awarenessUpdate.length);
    framedUpdate[0] = AWARENESS_MSG_TYPE;
    framedUpdate.set(awarenessUpdate, 1);

    const payload = JSON.stringify({
      diagramData: Buffer.from(framedUpdate).toString("base64"),
    });

    const room = rooms.get(diagramId);
    if (!room) return;
    for (const client of room) {
      if (client === disconnectedSocket) continue;
      if (client.readyState !== WebSocket.OPEN) continue;
      try {
        client.send(payload);
      } catch (err) {
        logger.error({ err, diagramId }, "ws awareness removal send failed");
      }
    }
  }

  wss.on("error", (err: NodeJS.ErrnoException) => {
    logger.error({ err, code: err.code }, "ws server error");
  });

  wss.on(
    "connection",
    (ws: ExtendedWebSocketWithAlive, request: IncomingMessage) => {
      void handleConnection(ws, request);
    },
  );

  async function handleConnection(
    ws: ExtendedWebSocketWithAlive,
    request: IncomingMessage,
  ): Promise<void> {
    const url = new URL(request.url ?? "", `http://${request.headers.host}`);
    const diagramId = url.searchParams.get("diagramId");
    if (!diagramId || !DIAGRAM_ID_RE.test(diagramId)) {
      ws.close(1008, "Invalid diagramId");
      return;
    }

    const mode = url.searchParams.get("mode") ?? "local";
    if (mode === "shared") {
      const token = url.searchParams.get("token");
      if (!token || !opts.verifyToken) {
        ws.close(WS_UNAUTHORIZED_CLOSE_CODE, "Authentication required");
        return;
      }
      try {
        ws.userId = await opts.verifyToken(token);
      } catch {
        ws.close(WS_UNAUTHORIZED_CLOSE_CODE, "Authentication required");
        return;
      }
      // Token is verified then discarded — never logged.
      logger.info(
        { event: "ws.shared.join", diagramId, userId: ws.userId },
        "ws shared join admitted",
      );
    }
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });
    let room = rooms.get(diagramId);
    if (!room) {
      room = new Set();
      rooms.set(diagramId, room);
    }
    if (room.size >= maxSocketsPerRoom) {
      logger.warn(
        { diagramId, size: room.size },
        "ws room over capacity, rejecting connection",
      );
      ws.close(1013, "Try again later");
      return;
    }
    room.add(ws);
    ws.diagramId = diagramId;
    awarenessClientIdsBySocket.set(ws, new Set());
    getOrCreateAwarenessState(diagramId);

    ws.on("message", (raw: WebSocket.RawData) => {
      const message =
        typeof raw === "string"
          ? raw
          : raw instanceof Buffer
            ? raw.toString("utf-8")
            : "";

      try {
        const parsed = JSON.parse(message) as Record<string, unknown>;

        if (typeof parsed.diagramData === "string") {
          const roomState = roomAwarenessStates.get(diagramId);
          if (roomState) {
            const decoded = Buffer.from(parsed.diagramData, "base64");
            if (decoded.length > 0 && decoded[0] === AWARENESS_MSG_TYPE) {
              const awarenessUpdate = new Uint8Array(decoded.subarray(1));
              applyAwarenessUpdate(roomState.awareness, awarenessUpdate, ws);

              const { present, removed } =
                decodeAwarenessUpdateClients(awarenessUpdate);
              const socketIds = awarenessClientIdsBySocket.get(ws);
              if (socketIds) {
                for (const id of present) socketIds.add(id);
                for (const id of removed) socketIds.delete(id);
              }
            }
          }
        }

        if (parsed.kind === "control") {
          logger.warn(
            {
              diagramId,
              type: (parsed as { control?: { type?: string } }).control?.type,
            },
            "ws control envelope from client dropped",
          );
          return;
        }
      } catch {
        // Payload is not JSON or not a control envelope; ignore and treat as regular broadcast
      }

      broadcast(rooms, diagramId, message, ws);
    });

    ws.on("close", () => {
      const r = rooms.get(diagramId);
      if (r) {
        r.delete(ws);

        // Broadcast awareness removal for this socket's tracked clients
        const socketIds = awarenessClientIdsBySocket.get(ws);
        if (socketIds && socketIds.size > 0) {
          broadcastAwarenessRemoval(diagramId, ws, Array.from(socketIds));
        }

        if (r.size === 0) {
          rooms.delete(diagramId);
          const roomState = roomAwarenessStates.get(diagramId);
          if (roomState) {
            roomState.awareness.destroy();
            roomState.doc.destroy();
            roomAwarenessStates.delete(diagramId);
          }
        }
      }
    });

    ws.on("error", (err: Error) => {
      logger.error({ err, diagramId }, "ws client error");
    });
  }

  const heartbeatInterval = setInterval(() => {
    for (const room of rooms.values()) {
      for (const client of room) {
        const alive = client as ExtendedWebSocketWithAlive;
        if (alive.isAlive === false) {
          alive.terminate();
          continue;
        }
        alive.isAlive = false;
        try {
          alive.ping();
        } catch {
          alive.terminate();
        }
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  function publishControl(diagramId: string, control: ControlEvent): void {
    const envelope: Envelope = { kind: "control", control };
    const message = JSON.stringify(envelope);
    broadcast(rooms, diagramId, message, null);
  }

  async function close(): Promise<void> {
    clearInterval(heartbeatInterval);
    for (const room of rooms.values()) {
      for (const client of room) {
        try {
          client.close();
        } catch {
          // Ignore.
        }
      }
    }
    rooms.clear();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  }

  logger.info(
    { event: "ws.start", host: opts.host ?? "0.0.0.0", port: opts.port },
    "ws relay started",
  );

  return {
    publishControl,
    close,
    roomCount: () => rooms.size,
  };
}

function broadcast(
  rooms: Map<string, Set<ExtendedWebSocket>>,
  diagramId: string,
  message: string,
  exclude: ExtendedWebSocket | null,
): void {
  const room = rooms.get(diagramId);
  if (!room) return;
  for (const client of room) {
    if (client === exclude) continue;
    if (client.readyState !== WebSocket.OPEN) continue;
    try {
      client.send(message);
    } catch (err) {
      logger.error({ err, diagramId }, "ws send failed");
    }
  }
}
