// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import WebSocket from "ws";
import { createServer } from "node:net";
import * as Y from "yjs";
import {
  createHeadlessSync,
  MessageType,
  type YjsSync,
} from "@umlstudio/core/internals";
import { startRelayServer, WS_UNAUTHORIZED_CLOSE_CODE } from "../../src/ws.js";
import { COMMIT_VERSION_SOURCE, k } from "../../src/redis.js";

// Helper: allocate an ephemeral free port for the relay server
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

function storeWrite(ydoc: Y.Doc, fn: () => void): void {
  ydoc.transact(fn, "store");
}

async function flushNetwork(): Promise<void> {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

interface VirtualPeer {
  ws: WebSocket;
  ydoc: Y.Doc;
  sync: YjsSync;
  ready: Promise<void>;
  close: () => Promise<void>;
}

interface ConnectOptions {
  user?: { id?: string; name: string; color: string; imageUrl?: string };
  mode?: "local" | "shared";
  token?: string;
}

function encodeFrame(
  type: MessageType,
  payload: Uint8Array = new Uint8Array(0),
): string {
  const buf = new Uint8Array(1 + payload.length);
  buf[0] = type;
  buf.set(payload, 1);
  return Buffer.from(buf).toString("base64");
}

function connectPeer(
  port: number,
  diagramId: string,
  optionsOrUser?: ConnectOptions | { name: string; color: string },
): VirtualPeer {
  const { ydoc, sync } = createHeadlessSync();
  const options: ConnectOptions =
    optionsOrUser && "name" in optionsOrUser && !("user" in optionsOrUser)
      ? { user: optionsOrUser }
      : ((optionsOrUser as ConnectOptions) ?? {});

  const queryParams = new URLSearchParams({ diagramId });
  if (options.mode) queryParams.set("mode", options.mode);
  if (options.token) queryParams.set("token", options.token);

  const ws = new WebSocket(`ws://127.0.0.1:${port}?${queryParams.toString()}`);

  sync.setSendBroadcastMessage((data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ diagramData: data }));
    }
  });

  ws.on("message", (raw) => {
    const text =
      typeof raw === "string"
        ? raw
        : raw instanceof Buffer
          ? raw.toString("utf-8")
          : "";
    try {
      const parsed = JSON.parse(text) as { diagramData?: string };
      if (typeof parsed.diagramData === "string") {
        sync.handleReceivedData(parsed.diagramData);
      }
    } catch {
      // ignore
    }
  });

  const ready = new Promise<void>((resolve, reject) => {
    ws.once("open", () => {
      ws.send(
        JSON.stringify({ diagramData: encodeFrame(MessageType.YjsSYNC) }),
      );
      ws.send(
        JSON.stringify({ diagramData: encodeFrame(MessageType.AwarenessSync) }),
      );
      sync.broadcastFullState();
      if (options.user) {
        sync.setLocalAwarenessState({ user: options.user });
      }
      resolve();
    });
    ws.once("error", reject);
  });

  return {
    ws,
    ydoc,
    sync,
    ready,
    close: () =>
      new Promise<void>((resolve) => {
        if (ws.readyState === WebSocket.CLOSED) return resolve();
        ws.once("close", () => resolve());
        ws.close();
      }),
  };
}

async function waitFor(
  condition: () => boolean,
  timeoutMs = 4000,
  message = "condition timed out",
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor: ${message}`);
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("INT-CU02: Case of Use CU-02 Real-Time Collaboration Integration", () => {
  let relay: ReturnType<typeof startRelayServer> | undefined;
  const peers: VirtualPeer[] = [];

  afterEach(async () => {
    await Promise.all(peers.map((p) => p.close()));
    peers.length = 0;
    if (relay) {
      await relay.close();
      relay = undefined;
    }
  });

  it("synchronizes concurrent peers with awareness object locking and CRDT convergence", async () => {
    const port = await getFreePort();
    relay = startRelayServer({ port, host: "127.0.0.1" });
    const roomId = "shared-room-cu02";

    // 1. Arrange: Connect two virtual clients to the same room
    const peer1 = connectPeer(port, roomId, {
      name: "Alice",
      color: "#3590F3",
    });
    const peer2 = connectPeer(port, roomId, { name: "Bob", color: "#FF5722" });
    peers.push(peer1, peer2);

    await Promise.all([peer1.ready, peer2.ready]);
    await flushNetwork();

    // 2. Act: Peer 1 creates a UML Class node with store origin transaction
    const classNodeId = "class-node-101";
    const initialClassData = {
      id: classNodeId,
      type: "class",
      position: { x: 120, y: 150 },
      data: { name: "Course", attributes: [], methods: [] },
    };

    storeWrite(peer1.ydoc, () => {
      peer1.ydoc.getMap("nodes").set(classNodeId, initialClassData);
    });
    await flushNetwork();

    // Assert: Peer 2 receives the new class node
    await waitFor(
      () => {
        const node = peer2.ydoc.getMap("nodes").get(classNodeId) as
          | typeof initialClassData
          | undefined;
        return node?.data?.name === "Course";
      },
      4000,
      "peer2 did not receive initial class node",
    );

    // 3. Act: Peer 1 acquires an exclusive lock on class-node-101 (Object Exclusion)
    peer1.sync.setLocalAwarenessSelectedElement(classNodeId);
    peer1.sync.setLocalAwarenessState({
      user: { name: "Alice", color: "#3590F3" },
    });
    await flushNetwork();

    // Assert: Peer 2 receives the awareness lock state indicating Alice is editing class-node-101
    await waitFor(
      () => {
        const states = Array.from(peer2.sync.getAwarenessStates().values());
        return states.some(
          (s) =>
            s.selectedElementId === classNodeId && s.user?.name === "Alice",
        );
      },
      4000,
      "peer2 did not observe lock on class-node-101",
    );

    const lockHolder = Array.from(
      peer2.sync.getAwarenessStates().values(),
    ).find((s) => s.selectedElementId === classNodeId);
    expect(lockHolder).toBeDefined();
    expect(lockHolder?.user?.name).toBe("Alice");

    // 4. Act: Peer 1 mutates the class name to 'CourseService' and releases the lock
    const updatedClassData = {
      ...initialClassData,
      data: {
        name: "CourseService",
        attributes: [{ id: "a1", name: "+ id: Long" }],
        methods: [],
      },
    };
    storeWrite(peer1.ydoc, () => {
      peer1.ydoc.getMap("nodes").set(classNodeId, updatedClassData);
    });
    peer1.sync.setLocalAwarenessSelectedElement(null);
    await flushNetwork();

    // Assert: Peer 2 receives the convergent update with zero conflicts
    await waitFor(
      () => {
        const node = peer2.ydoc.getMap("nodes").get(classNodeId) as
          | typeof updatedClassData
          | undefined;
        return node?.data?.name === "CourseService";
      },
      4000,
      "peer2 did not receive convergent class name mutation",
    );

    const peer2Node = peer2.ydoc
      .getMap("nodes")
      .get(classNodeId) as typeof updatedClassData;
    expect(peer2Node.data.name).toBe("CourseService");
    expect(peer2Node.data.attributes).toHaveLength(1);

    // Assert: Lock is released on Peer 2
    await waitFor(
      () => {
        const states = Array.from(peer2.sync.getAwarenessStates().values());
        return !states.some((s) => s.selectedElementId === classNodeId);
      },
      4000,
      "lock was not released on peer2",
    );
  });

  it("rejects unauthenticated or invalid token connection attempts in shared mode with 4401", async () => {
    const port = await getFreePort();
    relay = startRelayServer({
      port,
      host: "127.0.0.1",
      verifyToken: async (token) => {
        if (token === "valid-token") return "usr-123";
        throw new Error("unauthorized");
      },
    });
    const roomId = "auth-rejection-room";

    // 1. Connection without token in shared mode
    const closeWithoutTokenPromise = new Promise<{
      code: number;
      reason: string;
    }>((resolve) => {
      const ws = new WebSocket(
        `ws://127.0.0.1:${port}?diagramId=${encodeURIComponent(roomId)}&mode=shared`,
      );
      ws.once("close", (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    });

    const resultWithoutToken = await closeWithoutTokenPromise;
    expect(resultWithoutToken.code).toBe(WS_UNAUTHORIZED_CLOSE_CODE);
    expect(resultWithoutToken.reason).toBe("Authentication required");

    // 2. Connection with invalid token in shared mode
    const closeWithInvalidTokenPromise = new Promise<{
      code: number;
      reason: string;
    }>((resolve) => {
      const ws = new WebSocket(
        `ws://127.0.0.1:${port}?diagramId=${encodeURIComponent(roomId)}&mode=shared&token=invalid-secret`,
      );
      ws.once("close", (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    });

    const resultWithInvalidToken = await closeWithInvalidTokenPromise;
    expect(resultWithInvalidToken.code).toBe(WS_UNAUTHORIZED_CLOSE_CODE);
    expect(resultWithInvalidToken.reason).toBe("Authentication required");
  });

  it("admits authenticated peers in shared mode, synchronizes identity and releases locks on disconnect", async () => {
    const port = await getFreePort();
    relay = startRelayServer({
      port,
      host: "127.0.0.1",
      verifyToken: async (token) => {
        if (token === "token-alice") return "usr-alice";
        if (token === "token-bob") return "usr-bob";
        throw new Error("Unauthorized token");
      },
    });
    const roomId = "shared-auth-room";

    const peer1 = connectPeer(port, roomId, {
      mode: "shared",
      token: "token-alice",
      user: {
        id: "usr-alice",
        name: "Alice Architect",
        color: "#1c7ed6",
        imageUrl: "https://avatar.example.com/alice.png",
      },
    });

    const peer2 = connectPeer(port, roomId, {
      mode: "shared",
      token: "token-bob",
      user: {
        id: "usr-bob",
        name: "Bob Modeler",
        color: "#37b24d",
      },
    });
    peers.push(peer1, peer2);

    await Promise.all([peer1.ready, peer2.ready]);
    await flushNetwork();

    // Peer 1 locks a class element
    const targetElementId = "class-order-entity";
    peer1.sync.setLocalAwarenessSelectedElement(targetElementId);
    await flushNetwork();

    // Peer 2 observes Alice's lock with full registered identity
    await waitFor(
      () => {
        const states = Array.from(peer2.sync.getAwarenessStates().values());
        return states.some(
          (s) =>
            s.selectedElementId === targetElementId &&
            s.user?.id === "usr-alice" &&
            s.user?.name === "Alice Architect",
        );
      },
      4000,
      "peer2 did not observe Alice's lock with authenticated profile",
    );

    const lockHolder = Array.from(
      peer2.sync.getAwarenessStates().values(),
    ).find((s) => s.selectedElementId === targetElementId);
    expect(lockHolder?.user?.id).toBe("usr-alice");
    expect(lockHolder?.user?.name).toBe("Alice Architect");
    expect(lockHolder?.user?.imageUrl).toBe(
      "https://avatar.example.com/alice.png",
    );

    // Peer 1 closes connection abruptly
    await peer1.close();
    await flushNetwork();

    // Peer 2 observes automatic cleanup of awareness and lock
    await waitFor(
      () => {
        const states = Array.from(peer2.sync.getAwarenessStates().values());
        return !states.some((s) => s.selectedElementId === targetElementId);
      },
      4000,
      "lock was not cleaned up on peer2 after peer1 disconnected",
    );
  });

  it("validates Redis atomic snapshot schema keys and Lua function definitions", () => {
    const diagramId = "cu02-test-diagram";
    const versionId = "01JA7Q9M2Z8K6W4N3P1V5R7T9X";

    // 1. Verify canonical Redis keys taxonomy defined in docs/DATABASE.md
    expect(k.diagram(diagramId)).toBe(`diagram:{${diagramId}}`);
    expect(k.diagramMeta(diagramId)).toBe(`diagram:{${diagramId}}:meta`);
    expect(k.versionsIndex(diagramId)).toBe(`diagram:{${diagramId}}:versions`);
    expect(k.versionBody(diagramId, versionId)).toBe(
      `diagram:{${diagramId}}:version:${versionId}`,
    );
    expect(k.versionMeta(diagramId, versionId)).toBe(
      `diagram:{${diagramId}}:version:${versionId}:meta`,
    );

    // 2. Verify umlstudio Lua function registration in COMMIT_VERSION_SOURCE
    expect(COMMIT_VERSION_SOURCE).toContain("#!lua name=umlstudio");
    expect(COMMIT_VERSION_SOURCE).toContain(
      "function_name = 'commit_snapshot'",
    );
    expect(COMMIT_VERSION_SOURCE).toContain(
      "function_name = 'restore_version'",
    );
    expect(COMMIT_VERSION_SOURCE).toContain(
      "function_name = 'list_versions_before'",
    );
  });
});
