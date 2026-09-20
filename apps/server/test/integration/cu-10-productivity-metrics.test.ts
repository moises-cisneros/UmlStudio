// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import WebSocket from "ws";
import { createServer } from "node:net";
import * as Y from "yjs";
import {
  createHeadlessSync,
  MessageType,
  type YjsSync,
} from "@umlstudio/core/internals";
import { startRelayServer } from "../../src/ws.js";
import {
  productivityCollector,
  type DiagramProductivityReport,
} from "../../src/services/productivity-collector.js";
import { mountProductivityRoutes } from "../../src/routes/productivity.js";
import { Hono } from "hono";

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

function encodeFrame(
  type: MessageType,
  payload: Uint8Array = new Uint8Array(0),
): string {
  const buf = new Uint8Array(1 + payload.length);
  buf[0] = type;
  buf.set(payload, 1);
  return Buffer.from(buf).toString("base64");
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
    await new Promise((r) => setTimeout(r, 20));
  }
}

interface VirtualPeer {
  ws: WebSocket;
  ydoc: Y.Doc;
  sync: YjsSync;
  ready: Promise<void>;
  close: () => Promise<void>;
}

interface ConnectOptions {
  user?: { id?: string; name: string; color: string };
  mode?: "local" | "shared";
  token?: string;
}

function connectPeer(
  port: number,
  diagramId: string,
  options: ConnectOptions = {},
): VirtualPeer {
  const { ydoc, sync } = createHeadlessSync();
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
          ? raw.toString("utf8")
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

describe("INT-CU10: Analizar Productividad, Cuellos de Botella y Gestión del Tiempo", () => {
  let relay: ReturnType<typeof startRelayServer>;
  let relayPort: number;
  const peers: VirtualPeer[] = [];
  const diagramId = `diag-${Date.now()}`;

  beforeEach(async () => {
    productivityCollector.clear();
    relayPort = await getFreePort();
    relay = startRelayServer({ port: relayPort });
  });

  afterEach(async () => {
    for (const p of peers) {
      await p.close();
    }
    peers.length = 0;
    await relay.close();
    productivityCollector.clear();
  });

  it("RF-40 & RF-41: debe registrar telemetría activa y detectar colisiones de contención de locks entre colaboradores", async () => {
    // 1. Arrange: Conectar dos colaboradores virtuales
    const peerAlice = connectPeer(relayPort, diagramId, {
      user: { id: "user-alice", name: "Alice Modeler", color: "#4f46e5" },
    });
    const peerBob = connectPeer(relayPort, diagramId, {
      user: { id: "user-bob", name: "Bob Modeler", color: "#06b6d4" },
    });
    peers.push(peerAlice, peerBob);

    await peerAlice.ready;
    await peerBob.ready;

    await waitFor(
      () =>
        productivityCollector.getReport(diagramId).collaborators.length >= 2,
      3000,
      "both collaborators registered",
    );

    // 2. Act: Alice adquiere el lock sobre la clase "OrderService"
    peerAlice.sync.setLocalAwarenessSelectedElement("class-order-service");

    await waitFor(
      () =>
        productivityCollector
          .getReport(diagramId)
          .bottlenecks.some((b) => b.nodeId === "class-order-service"),
      3000,
      "Alice lock recorded",
    );

    // Bob intenta adquirir el lock sobre la misma clase simultáneamente
    peerBob.sync.setLocalAwarenessSelectedElement("class-order-service");

    await waitFor(
      () => {
        const bn = productivityCollector
          .getReport(diagramId)
          .bottlenecks.find((b) => b.nodeId === "class-order-service");
        return (bn?.contentionCount ?? 0) >= 1;
      },
      3000,
      "Bob lock collision detected",
    );

    // 3. Assert: Verificar telemetría y detección de contención
    const report = productivityCollector.getReport(diagramId);

    expect(report.diagramId).toBe(diagramId);
    expect(report.collaborators.length).toBeGreaterThanOrEqual(2);

    const aliceCollab = report.collaborators.find(
      (c) => c.userId === "user-alice",
    );
    const bobCollab = report.collaborators.find(
      (c) => c.userId === "user-bob",
    );

    expect(aliceCollab).toBeDefined();
    expect(bobCollab).toBeDefined();

    // Detección de cuello de botella / contención
    const orderServiceBottleneck = report.bottlenecks.find(
      (b) => b.nodeId === "class-order-service",
    );
    expect(orderServiceBottleneck).toBeDefined();
    expect(orderServiceBottleneck?.contentionCount).toBeGreaterThanOrEqual(1);

    // Semáforo de fluidez se actualiza ante contención
    expect(["yellow", "red"]).toContain(report.fluencyStatus);
  });

  it("RF-40: debe deducir correctamente lapsos de inactividad superiores a 60 segundos", () => {
    const t0 = 1000000;
    // Registro inicial
    productivityCollector.recordActivity(
      "diag-idle-test",
      { userId: "u1", userName: "Tester" },
      { timestamp: t0 },
    );

    // Actividad tras 100 segundos (excede el umbral de 60s)
    const t1 = t0 + 100_000;
    productivityCollector.recordActivity(
      "diag-idle-test",
      { userId: "u1" },
      { timestamp: t1 },
    );

    const report = productivityCollector.getReport("diag-idle-test", t1);
    const collab = report.collaborators.find((c) => c.userId === "u1");

    expect(collab).toBeDefined();
    // Primeros 60s activos, los siguientes 40s inactivos
    expect(collab?.activeSeconds).toBe(60);
    expect(collab?.idleSeconds).toBe(40);
  });

  it("RF-42: debe calcular velocidad de diseño y cadencia de refactorización", () => {
    const t0 = Date.now();
    productivityCollector.recordActivity(
      "diag-velocity-test",
      { userId: "u2", userName: "Architect" },
      {
        createdClasses: 6,
        createdMethods: 18,
        refactors: 4,
        timestamp: t0,
      },
    );

    const report = productivityCollector.getReport(
      "diag-velocity-test",
      t0 + 3600_000,
    );
    expect(report.velocity.totalClassesCreated).toBe(6);
    expect(report.velocity.totalMethodsCreated).toBe(18);
    expect(report.velocity.totalRefactors).toBe(4);
    expect(report.velocity.classesPerHour).toBeGreaterThan(0);
    expect(report.velocity.methodsPerHour).toBeGreaterThan(0);
  });

  it("RF-43: debe exponer endpoints REST para consulta y telemetría de productividad", async () => {
    const app = new Hono();
    app.route("/api", mountProductivityRoutes());

    // 1. Inyectar telemetría vía POST
    const postRes = await app.request(
      `/api/diagrams/${diagramId}/productivity/telemetry`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "api-user",
          userName: "API Engineer",
          createdClasses: 3,
          createdMethods: 9,
          refactors: 2,
        }),
      },
    );

    expect(postRes.status).toBe(200);
    const postData = (await postRes.json()) as DiagramProductivityReport;
    expect(postData.velocity.totalClassesCreated).toBe(3);
    expect(postData.velocity.totalMethodsCreated).toBe(9);

    // 2. Consultar reporte vía GET
    const getRes = await app.request(
      `/api/diagrams/${diagramId}/productivity`,
    );
    expect(getRes.status).toBe(200);
    const report = (await getRes.json()) as DiagramProductivityReport;
    expect(report.diagramId).toBe(diagramId);
    expect(report.fluencyStatus).toBeDefined();
    expect(report.fluencyScore).toBeGreaterThanOrEqual(0);
  });
});
