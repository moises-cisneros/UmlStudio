import { describe, it, expect, beforeEach } from "vitest"
import { Hono } from "hono"
import type { AppEnv } from "../../src/http/env.js"
import { mountDiagramRoutes, readDiagram, saveHead } from "../../src/routes/diagrams.js"
import { loadConfig } from "../../src/config.js"
import { getRedis } from "../../src/__tests__/setup.js"
import { k, type Redis } from "../../src/redis.js"
import type { ControlEvent, Diagram } from "../../src/types.js"
import type { RelayHook } from "../../src/http/app.js"

import { errorHandler } from "../../src/http/middleware/errors.js"
import {
  createAuthService,
  createRedisUserRepository,
  type AuthService,
} from "../../src/services/auth-service.js"

const TEST_JWT_SECRET = "cu13-test-jwt-secret-min-32-chars!!"

describe("INT-CU13: Case of Use CU-13 Diagram Management Integration (Rename, Delete, Share)", () => {
  let redis: Redis
  const config = loadConfig({
    ...process.env,
    OWNER_SECRET: "test-secret-cu13-test-secret-cu13",
  })

  const publishedEvents: { diagramId: string; control: ControlEvent }[] = []
  const relayMock: RelayHook = {
    publishControl: (diagramId, control) => {
      publishedEvents.push({ diagramId, control })
    },
  }

  beforeEach(async () => {
    redis = await getRedis()
    publishedEvents.length = 0
  })

  function createTestApp(r: Redis, auth?: AuthService) {
    const testApp = new Hono<AppEnv>()
    testApp.onError(errorHandler)
    testApp.route("/api", mountDiagramRoutes({ config, redis: r, auth }, relayMock))
    return testApp
  }

  it("executes full lifecycle: creation, retrieval for sharing, atomic rename via PATCH, and cascade deletion via DELETE", async () => {
    const testApp = createTestApp(redis)
    const diagramId = "cu13-test-diagram"

    // 1. Arrange: canonical UML class diagram
    const initialModel: Diagram = {
      version: "4.0.0",
      id: diagramId,
      title: "Initial Domain Architecture",
      type: "ClassDiagram",
      assessments: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        {
          id: "class-order",
          type: "class",
          position: { x: 100, y: 150 },
          data: {
            name: "Order",
            isAbstract: false,
            attributes: [
              {
                id: "a1",
                name: "orderId",
                type: "UUID",
                visibility: "private",
              },
              {
                id: "a2",
                name: "total",
                type: "BigDecimal",
                visibility: "private",
              },
            ],
            methods: [
              {
                id: "m1",
                name: "calculateTotal",
                returnType: "BigDecimal",
                visibility: "public",
                parameters: [],
              },
            ],
          },
        },
      ],
      edges: [],
    }

    // Save initial state to Redis HEAD
    await saveHead(redis, config, initialModel)

    // 2. Act & Assert: Share retrieval via GET /api/diagrams/:id
    const getRes = await testApp.request(`/api/diagrams/${diagramId}`)
    expect(getRes.status).toBe(200)
    const retrieved = (await getRes.json()) as Diagram
    expect(retrieved.id).toBe(diagramId)
    expect(retrieved.title).toBe("Initial Domain Architecture")
    expect(retrieved.nodes).toHaveLength(1)

    // 3. Act & Assert: Atomic Rename via PATCH /api/diagrams/:id
    const newTitle = "Enterprise Order Processing Domain (UML 2.5)"
    const patchRes = await testApp.request(`/api/diagrams/${diagramId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    })

    expect(patchRes.status).toBe(200)
    const patchBody = (await patchRes.json()) as {
      id: string
      title: string
      headRev: number
      updatedAt: string
    }
    expect(patchBody.id).toBe(diagramId)
    expect(patchBody.title).toBe(newTitle)
    expect(patchBody.headRev).toBeGreaterThan(1)

    // Verify Redis HEAD updated
    const head = await readDiagram(redis, diagramId)
    expect(head?.title).toBe(newTitle)

    // Verify Redis metadata hash updated
    const metaTitle = await redis.hGet(k.diagramMeta(diagramId), "title")
    expect(metaTitle).toBe(newTitle)

    // Verify Relay emitted DIAGRAM_RENAMED event
    const renameEvent = publishedEvents.find(
      (e) => e.diagramId === diagramId && e.control.type === "DIAGRAM_RENAMED"
    )
    expect(renameEvent).toBeDefined()
    if (renameEvent && renameEvent.control.type === "DIAGRAM_RENAMED") {
      expect(renameEvent.control.title).toBe(newTitle)
    }

    // 4. Act & Assert: Validation errors on PATCH
    // Empty title
    const emptyTitleRes = await testApp.request(`/api/diagrams/${diagramId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "   " }),
    })
    expect(emptyTitleRes.status).toBe(422)

    // Non-existent diagram
    const notFoundRes = await testApp.request(`/api/diagrams/non-existent-diagram-id`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Valid Title" }),
    })
    expect(notFoundRes.status).toBe(404)

    // 5. Act & Assert: Cascade Delete via DELETE /api/diagrams/:id
    const deleteRes = await testApp.request(`/api/diagrams/${diagramId}`, {
      method: "DELETE",
    })
    expect(deleteRes.status).toBe(204)

    // Verify relay emitted DIAGRAM_DELETED
    const deleteEvent = publishedEvents.find(
      (e) => e.diagramId === diagramId && e.control.type === "DIAGRAM_DELETED"
    )
    expect(deleteEvent).toBeDefined()

    // Verify GET returns 404 Not Found after deletion
    const postDeleteGetRes = await testApp.request(`/api/diagrams/${diagramId}`)
    expect(postDeleteGetRes.status).toBe(404)

    // Verify subsequent PATCH returns 404 Not Found
    const postDeletePatchRes = await testApp.request(`/api/diagrams/${diagramId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Another Title" }),
    })
    expect(postDeletePatchRes.status).toBe(404)
  })

  it("enforces authentication on diagram creation: rejects anonymous creation and binds authenticated userId to diagram and index", async () => {
    const auth = createAuthService({
      repo: createRedisUserRepository(redis),
      jwtSecret: TEST_JWT_SECRET,
    })
    const testApp = createTestApp(redis, auth)

    // 1. Anonymous creation rejected with 401
    const unauthRes = await testApp.request("/api/diagrams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Unauthorized Diagram" }),
    })
    expect(unauthRes.status).toBe(401)

    // 2. Authenticated creation succeeds and binds userId
    const { token, user } = await auth.register({
      name: "Architect User",
      email: "architect@example.com",
      password: "Password123!",
    })
    const authRes = await testApp.request("/api/diagrams", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: "Architecture Model CU-05",
        type: "ClassDiagram",
      }),
    })
    expect(authRes.status).toBe(201)
    const created = (await authRes.json()) as Diagram
    expect(created.id).toBeDefined()
    expect(created.userId).toBe(user.id)
    expect(created.title).toBe("Architecture Model CU-05")

    // 3. Verify indexed in user diagrams set
    const userDiagrams = await redis.sMembers(k.userDiagrams(user.id))
    expect(userDiagrams).toContain(created.id)

    // 4. Verify GET /api/user/diagrams returns the diagram for this user
    const listRes = await testApp.request("/api/user/diagrams", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    expect(listRes.status).toBe(200)
    const list = (await listRes.json()) as Array<{ id: string; title: string }>
    expect(list.some((d) => d.id === created.id)).toBe(true)

    // 5. Cascade delete also cleans up userDiagrams set
    const delRes = await testApp.request(`/api/diagrams/${created.id}`, {
      method: "DELETE",
    })
    expect(delRes.status).toBe(204)
    const remaining = await redis.sMembers(k.userDiagrams(user.id))
    expect(remaining).not.toContain(created.id)
  })
})
