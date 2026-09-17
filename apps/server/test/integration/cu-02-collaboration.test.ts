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
import { startRelayServer } from "../../src/ws.js";
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
  user?: { name: string; color: string },
): VirtualPeer {
  const { ydoc, sync } = createHeadlessSync();
  const ws = new WebSocket(
    `ws://127.0.0.1:${port}?diagramId=${encodeURIComponent(diagramId)}`,
  );

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

  const ready = new Promise<void>((resolve) => {
    ws.once("open", () => {
      ws.send(JSON.stringify({ diagramData: encodeFrame(MessageType.YjsSYNC) }));
      ws.send(JSON.stringify({ diagramData: encodeFrame(MessageType.AwarenessSync) }));
      sync.broadcastFullState();
      if (user) {
        sync.setLocalAwarenessState({ user });
      }
      resolve();
    });
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
    const peer1 = connectPeer(port, roomId, { name: "Alice", color: "#3590F3" });
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
    await waitFor(() => {
      const node = peer2.ydoc.getMap("nodes").get(classNodeId) as typeof initialClassData | undefined;
      return node?.data?.name === "Course";
    }, 4000, "peer2 did not receive initial class node");

    // 3. Act: Peer 1 acquires an exclusive lock on class-node-101 (Object Exclusion)
    peer1.sync.setLocalAwarenessSelectedElement(classNodeId);
    peer1.sync.setLocalAwarenessState({ user: { name: "Alice", color: "#3590F3" } });
    await flushNetwork();

    // Assert: Peer 2 receives the awareness lock state indicating Alice is editing class-node-101
    await waitFor(() => {
      const states = Array.from(peer2.sync.getAwarenessStates().values());
      return states.some(
        (s) => s.selectedElementId === classNodeId && s.user?.name === "Alice",
      );
    }, 4000, "peer2 did not observe lock on class-node-101");

    const lockHolder = Array.from(peer2.sync.getAwarenessStates().values()).find(
      (s) => s.selectedElementId === classNodeId,
    );
    expect(lockHolder).toBeDefined();
    expect(lockHolder?.user?.name).toBe("Alice");

    // 4. Act: Peer 1 mutates the class name to 'CourseService' and releases the lock
    const updatedClassData = {
      ...initialClassData,
      data: { name: "CourseService", attributes: [{ id: "a1", name: "+ id: Long" }], methods: [] },
    };
    storeWrite(peer1.ydoc, () => {
      peer1.ydoc.getMap("nodes").set(classNodeId, updatedClassData);
    });
    peer1.sync.setLocalAwarenessSelectedElement(null);
    await flushNetwork();

    // Assert: Peer 2 receives the convergent update with zero conflicts
    await waitFor(() => {
      const node = peer2.ydoc.getMap("nodes").get(classNodeId) as typeof updatedClassData | undefined;
      return node?.data?.name === "CourseService";
    }, 4000, "peer2 did not receive convergent class name mutation");

    const peer2Node = peer2.ydoc.getMap("nodes").get(classNodeId) as typeof updatedClassData;
    expect(peer2Node.data.name).toBe("CourseService");
    expect(peer2Node.data.attributes).toHaveLength(1);

    // Assert: Lock is released on Peer 2
    await waitFor(() => {
      const states = Array.from(peer2.sync.getAwarenessStates().values());
      return !states.some((s) => s.selectedElementId === classNodeId);
    }, 4000, "lock was not released on peer2");
  });

  it("validates Redis atomic snapshot schema keys and Lua function definitions", () => {
    const diagramId = "cu02-test-diagram";
    const versionId = "01JA7Q9M2Z8K6W4N3P1V5R7T9X";

    // 1. Verify canonical Redis keys taxonomy defined in docs/DATABASE.md
    expect(k.diagram(diagramId)).toBe(`diagram:{${diagramId}}`);
    expect(k.diagramMeta(diagramId)).toBe(`diagram:{${diagramId}}:meta`);
    expect(k.versionsIndex(diagramId)).toBe(`diagram:{${diagramId}}:versions`);
    expect(k.versionBody(diagramId, versionId)).toBe(`diagram:{${diagramId}}:version:${versionId}`);
    expect(k.versionMeta(diagramId, versionId)).toBe(`diagram:{${diagramId}}:version:${versionId}:meta`);

    // 2. Verify umlstudio Lua function registration in COMMIT_VERSION_SOURCE
    expect(COMMIT_VERSION_SOURCE).toContain("#!lua name=umlstudio");
    expect(COMMIT_VERSION_SOURCE).toContain("function_name = 'commit_snapshot'");
    expect(COMMIT_VERSION_SOURCE).toContain("function_name = 'restore_version'");
    expect(COMMIT_VERSION_SOURCE).toContain("function_name = 'list_versions_before'");
  });
});
