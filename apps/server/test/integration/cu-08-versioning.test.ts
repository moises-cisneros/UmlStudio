import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../src/http/env.js";
import { mountVersionRoutes } from "../../src/routes/versions.js";
import { mountDiagramRoutes, saveHead } from "../../src/routes/diagrams.js";
import { DiagramBody } from "../../src/routes/_schemas.js";
import { loadConfig } from "../../src/config.js";
import { getRedis } from "../../src/__tests__/setup.js";
import { k, type Redis } from "../../src/redis.js";
import type { ControlEvent, Diagram } from "../../src/types.js";
import type { RelayHook } from "../../src/http/app.js";

import {
  createAuthService,
  createRedisUserRepository,
  type AuthService,
} from "../../src/services/auth-service.js";

const TEST_JWT_SECRET = "cu08-test-jwt-secret-min-32-chars!!";

describe("INT-CU08: Case of Use CU-08 Versioning, Snapshots and Restoration Integration", () => {
  let redis: Redis;
  let authService: AuthService;
  const config = loadConfig({
    ...process.env,
    OWNER_SECRET: "test-secret-test-secret-test-secret",
    MAX_VERSIONS_PER_DIAGRAM: 10,
  });

  const publishedEvents: { diagramId: string; control: ControlEvent }[] = [];
  const relayMock: RelayHook = {
    publishControl: (diagramId, control) => {
      publishedEvents.push({ diagramId, control });
    },
  };

  const app = new Hono<AppEnv>();
  app.route(
    "/api",
    mountDiagramRoutes({ config, redis: {} as Redis }, relayMock),
  );

  beforeEach(async () => {
    redis = await getRedis();
    authService = createAuthService({
      repo: createRedisUserRepository(redis),
      jwtSecret: TEST_JWT_SECRET,
    });
    publishedEvents.length = 0;
  });

  function createTestApp(r: Redis, auth?: AuthService) {
    const testApp = new Hono<AppEnv>();
    testApp.route(
      "/api",
      mountDiagramRoutes(
        { config, redis: r, auth: auth ?? authService },
        relayMock,
      ),
    );
    testApp.route(
      "/api",
      mountVersionRoutes(
        { config, redis: r, auth: auth ?? authService },
        relayMock,
      ),
    );
    return testApp;
  }

  it("executes full lifecycle: manual snapshot, reverse-chronological list, non-destructive preview, atomic restore and undo", async () => {
    const testApp = createTestApp(redis);
    const diagramId = "cu08-test-diagram";

    // 1. Arrange: Canonical initial UMLModel conforming to Diagram schema
    const initialModel: Diagram = {
      version: "4.0.0",
      id: diagramId,
      title: "Order Processing Domain",
      type: "ClassDiagram",
      assessments: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        {
          id: "class-customer",
          type: "class",
          position: { x: 100, y: 100 },
          data: {
            name: "Customer",
            isAbstract: false,
            attributes: [
              { id: "a1", name: "id", type: "Long", visibility: "private" },
              {
                id: "a2",
                name: "email",
                type: "String",
                visibility: "private",
              },
            ],
            methods: [
              {
                id: "m1",
                name: "getEmail",
                returnType: "String",
                visibility: "public",
                parameters: [],
              },
            ],
          },
          width: 0,
          height: 0,
          measured: {
            width: 0,
            height: 0,
          },
        },
        {
          id: "class-order",
          type: "class",
          position: { x: 400, y: 100 },
          data: {
            name: "Order",
            isAbstract: false,
            attributes: [
              { id: "a3", name: "id", type: "Long", visibility: "private" },
              {
                id: "a4",
                name: "total",
                type: "BigDecimal",
                visibility: "private",
              },
            ],
            methods: [
              {
                id: "m2",
                name: "calculateTotal",
                returnType: "BigDecimal",
                visibility: "public",
                parameters: [],
              },
            ],
          },
          width: 0,
          height: 0,
          measured: {
            width: 0,
            height: 0,
          },
        },
      ],
      edges: [
        {
          id: "edge-customer-order",
          type: "relationship",
          source: "class-customer",
          target: "class-order",
          data: {
            type: "association",
            sourceMultiplicity: "1",
            targetMultiplicity: "*",
            sourceRole: "customer",
            targetRole: "orders",
            points: [],
          },
        },
      ],
    };

    // Schema conformance assertion
    expect(DiagramBody.safeParse(initialModel).success).toBe(true);

    // Save initial HEAD in Redis
    await saveHead(redis, config, initialModel);

    // 2. Act & Assert: Commit manual snapshot v1.0 (RF-32)
    const v1Res = await testApp.request(
      `http://localhost/api/diagrams/${diagramId}/versions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "v1.0 - Core Domain",
          description: "Initial domain with Customer and Order entities",
          actor: "Alice",
          body: initialModel,
        }),
      },
    );

    expect(v1Res.status).toBe(201);
    const v1Data = (await v1Res.json()) as {
      id: string;
      name: string;
      seq: number;
      kind: string;
      total: number;
    };
    expect(v1Data.id).toBeDefined();
    expect(v1Data.name).toBe("v1.0 - Core Domain");
    expect(v1Data.seq).toBe(1);
    expect(v1Data.kind).toBe("user");
    expect(v1Data.total).toBe(1);

    // Verify WebSocket relay received VERSION_CREATED event
    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0].control.type).toBe("VERSION_CREATED");
    expect(publishedEvents[0].diagramId).toBe(diagramId);

    // Verify canonical Redis keys taxonomy (docs/DATABASE.md)
    const existsHead = await redis.exists(k.diagram(diagramId));
    const existsVersionsIndex = await redis.exists(k.versionsIndex(diagramId));
    const existsVersionBody = await redis.exists(
      k.versionBody(diagramId, v1Data.id),
    );
    const existsVersionMeta = await redis.exists(
      k.versionMeta(diagramId, v1Data.id),
    );
    expect(existsHead).toBe(1);
    expect(existsVersionsIndex).toBe(1);
    expect(existsVersionBody).toBe(1);
    expect(existsVersionMeta).toBe(1);

    // 3. Act & Assert: Mutate diagram by adding Payment class and commit snapshot v2.0 (RF-32, RF-34)
    const updatedModel: Diagram = {
      ...initialModel,
      updatedAt: new Date().toISOString(),
      nodes: [
        ...initialModel.nodes,
        {
          id: "class-payment",
          type: "class",
          position: { x: 700, y: 100 },
          data: {
            name: "Payment",
            isAbstract: false,
            attributes: [
              {
                id: "a5",
                name: "paymentId",
                type: "String",
                visibility: "private",
              },
              {
                id: "a6",
                name: "amount",
                type: "BigDecimal",
                visibility: "private",
              },
            ],
            methods: [],
          },
          width: 0,
          height: 0,
          measured: {
            width: 0,
            height: 0,
          },
        },
      ],
      edges: [
        ...initialModel.edges,
        {
          id: "edge-order-payment",
          type: "relationship",
          source: "class-order",
          target: "class-payment",
          sourceHandle: "right",
          targetHandle: "left",
          data: {
            type: "composition",
            sourceMultiplicity: "1",
            targetMultiplicity: "1",
            sourceRole: "order",
            targetRole: "payment",
            points: [],
          },
        },
      ],
    };

    expect(DiagramBody.safeParse(updatedModel).success).toBe(true);

    const v2Res = await testApp.request(
      `http://localhost/api/diagrams/${diagramId}/versions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "v2.0 - With Payments",
          description: "Added Payment entity and composition",
          actor: "Bob",
          body: updatedModel,
        }),
      },
    );

    expect(v2Res.status).toBe(201);
    const v2Data = (await v2Res.json()) as {
      id: string;
      name: string;
      seq: number;
    };
    expect(v2Data.name).toBe("v2.0 - With Payments");
    expect(v2Data.seq).toBe(2);

    // 4. Act & Assert: Query reverse-chronological versions list (RF-34)
    const listRes = await testApp.request(
      `http://localhost/api/diagrams/${diagramId}/versions?limit=10`,
    );
    expect(listRes.status).toBe(200);
    const listData = (await listRes.json()) as {
      versions: { id: string; name: string; seq: number }[];
      total: number;
    };
    expect(listData.total).toBe(2);
    expect(listData.versions).toHaveLength(2);
    // Newest first
    expect(listData.versions[0].id).toBe(v2Data.id);
    expect(listData.versions[0].name).toBe("v2.0 - With Payments");
    expect(listData.versions[1].id).toBe(v1Data.id);
    expect(listData.versions[1].name).toBe("v1.0 - Core Domain");

    // 5. Act & Assert: Non-destructive historical preview (RF-35)
    const previewRes = await testApp.request(
      `http://localhost/api/diagrams/${diagramId}/versions/${v1Data.id}`,
    );
    expect(previewRes.status).toBe(200);
    const previewBody = (await previewRes.json()) as Diagram;
    expect(previewBody.nodes).toHaveLength(2);
    expect(previewBody.nodes.some((n) => n.id === "class-payment")).toBe(false);

    // Assert active HEAD was not mutated by reading preview
    const headRaw = await redis.json.get(k.diagram(diagramId));
    const currentHead = headRaw as unknown as Diagram;
    expect(currentHead.nodes).toHaveLength(3);
    expect(currentHead.nodes.some((n) => n.id === "class-payment")).toBe(true);

    // 6. Act & Assert: Atomic restore to v1.0 (RF-36)
    const restoreRes = await testApp.request(
      `http://localhost/api/diagrams/${diagramId}/versions/${v1Data.id}/restore`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor: "Alice",
        }),
      },
    );

    expect(restoreRes.status).toBe(200);
    const restoreData = (await restoreRes.json()) as {
      autoSnapshotVersionId: string;
      restoredFromVersionId: string;
      headRev: number;
      updatedAt: string;
    };

    expect(restoreData.autoSnapshotVersionId).toBeDefined();
    expect(restoreData.headRev).toBeGreaterThan(0);

    // Verify HEAD is now atomically swapped to v1.0 (2 nodes, no payment)
    const postRestoreHead = (await redis.json.get(
      k.diagram(diagramId),
    )) as unknown as Diagram;
    expect(postRestoreHead.nodes).toHaveLength(2);
    expect(postRestoreHead.nodes.some((n) => n.id === "class-payment")).toBe(
      false,
    );

    // Verify WebSocket relay received VERSION_RESTORED broadcast
    const restoreEvent = publishedEvents.find(
      (e) => e.control.type === "VERSION_RESTORED",
    );
    expect(restoreEvent).toBeDefined();
    expect(restoreEvent?.diagramId).toBe(diagramId);

    // Verify automatic pre-restore snapshot was generated with descriptive name
    const autoSnapshotMeta = await redis.hGetAll(
      k.versionMeta(diagramId, restoreData.autoSnapshotVersionId),
    );
    expect(autoSnapshotMeta.name).toBe("Before restoring 'v1.0 - Core Domain'");

    // 7. Act & Assert: Undo capability using the auto-snapshot within 10s window (RF-36)
    const undoRes = await testApp.request(
      `http://localhost/api/diagrams/${diagramId}/versions/${restoreData.autoSnapshotVersionId}/restore`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor: "Alice (Undo)" }),
      },
    );
    expect(undoRes.status).toBe(200);

    // Verify HEAD has reverted back to the 3-node state containing Payment class
    const undoneHead = (await redis.json.get(
      k.diagram(diagramId),
    )) as unknown as Diagram;
    expect(undoneHead.nodes).toHaveLength(3);
    expect(undoneHead.nodes.some((n) => n.id === "class-payment")).toBe(true);
  });

  it("binds immutable snapshot authorship to verified authenticated user identity (CU-08 / CU-11)", async () => {
    const testApp = createTestApp(redis);
    const diagramId = "cu08-auth-diagram";

    // 1. Arrange: Register an authenticated user
    const userSession = await authService.register({
      name: "Ada Lovelace",
      email: "ada@umlstudio.com",
      password: "secure-password-123",
    });
    const token = userSession.token;
    const userId = userSession.user.id;

    // Save initial diagram HEAD
    const model: Diagram = {
      version: "4.0.0",
      id: diagramId,
      title: "Auth Versioning Diagram",
      type: "ClassDiagram",
      assessments: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        {
          id: "class-auth",
          type: "class",
          position: { x: 50, y: 50 },
          width: 200,
          height: 120,
          measured: { width: 200, height: 120 },
          data: {
            name: "SessionAuth",
            isAbstract: false,
            attributes: [],
            methods: [],
          },
        },
      ],
      edges: [],
    };
    await saveHead(redis, config, model);

    // 2. Act: Commit snapshot with Authorization Bearer token
    const commitRes = await testApp.request(
      `http://localhost/api/diagrams/${diagramId}/versions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: "Milestone 1 - Auth Core",
          description: "Initial authenticated snapshot",
          body: model,
        }),
      },
    );

    expect(commitRes.status).toBe(201);
    const commitData = (await commitRes.json()) as {
      id: string;
      name: string;
      author?: string;
      authorName?: string;
    };
    expect(commitData.author).toBe(userId);
    expect(commitData.authorName).toBe("Ada Lovelace");

    // 3. Act: Query versions list - verify author resolution
    const listRes = await testApp.request(
      `http://localhost/api/diagrams/${diagramId}/versions?limit=5`,
    );
    expect(listRes.status).toBe(200);
    const listData = (await listRes.json()) as {
      versions: {
        id: string;
        name: string;
        author?: string;
        authorName?: string;
        authorColor?: string;
      }[];
    };
    expect(listData.versions).toHaveLength(1);
    const firstVersion = listData.versions[0];
    expect(firstVersion.author).toBe(userId);
    expect(firstVersion.authorName).toBe("Ada Lovelace");
    expect(firstVersion.authorColor).toBeDefined();

    // 4. Act: Restore version with Authorization Bearer token
    const restoreRes = await testApp.request(
      `http://localhost/api/diagrams/${diagramId}/versions/${firstVersion.id}/restore`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      },
    );
    expect(restoreRes.status).toBe(200);
    const restoreData = (await restoreRes.json()) as {
      autoSnapshotVersionId: string;
    };

    // Verify the pre-restore auto-snapshot records the authenticated author
    const autoSnapshotMeta = await redis.hGetAll(
      k.versionMeta(diagramId, restoreData.autoSnapshotVersionId),
    );
    expect(autoSnapshotMeta.author).toBe(userId);

    // Verify WebSocket broadcast published actor as Ada Lovelace
    const restoreEvent = publishedEvents.find(
      (e) => e.diagramId === diagramId && e.control.type === "VERSION_RESTORED",
    );
    expect(restoreEvent).toBeDefined();
    if (restoreEvent && restoreEvent.control.type === "VERSION_RESTORED") {
      expect(restoreEvent.control.actor).toBe("Ada Lovelace");
    }
  });
});
