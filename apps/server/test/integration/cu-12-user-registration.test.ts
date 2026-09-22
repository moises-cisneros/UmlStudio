import { describe, it, expect, beforeEach } from "vitest"
import { Hono } from "hono"
import { createServer } from "node:net"
import WebSocket from "ws"
import type { AppEnv } from "../../src/http/env.js"
import { errorHandler } from "../../src/http/middleware/errors.js"
import { loadConfig } from "../../src/config.js"
import { getRedis } from "../../src/__tests__/setup.js"
import type { Redis } from "../../src/redis.js"
import { getJwtSecret } from "../../src/redis.js"
import {
  createAuthService,
  createRedisUserRepository,
  type AuthService,
  type UserRepository,
} from "../../src/services/auth-service.js"
import { mountAuthRoutes } from "../../src/routes/auth.js"
import { authOptional } from "../../src/http/middleware/auth.js"
import { mountVersionRoutes } from "../../src/routes/versions.js"
import { saveHead } from "../../src/routes/diagrams.js"
import type { Diagram } from "../../src/types.js"
import { startRelayServer } from "../../src/ws.js"

const TEST_JWT_SECRET = "cu12-test-jwt-secret-min-32-chars!!"
const TEST_NAME = "Ada Modeler"
const TEST_EMAIL = "ada@example.com"
const TEST_PASSWORD = "Modeler-2026!"

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on("error", reject)
    srv.listen(0, () => {
      const port = (srv.address() as { port: number }).port
      srv.close(() => resolve(port))
    })
  })
}

function readSetCookies(res: Response): string[] {
  const getSetCookie = (
    res.headers as Headers & {
      getSetCookie?: () => string[]
    }
  ).getSetCookie
  if (typeof getSetCookie === "function") return getSetCookie.call(res.headers)
  const single = res.headers.get("set-cookie")
  return single ? [single] : []
}

function cookieHeader(res: Response): string {
  return readSetCookies(res)
    .map((c) => c.split(";")[0])
    .join("; ")
}

function minimalDiagram(id: string): Diagram {
  const now = new Date().toISOString()
  return {
    version: "4.0.0",
    id,
    title: "CU-12 Registration Diagram",
    type: "ClassDiagram",
    assessments: {},
    createdAt: now,
    updatedAt: now,
    nodes: [],
    edges: [],
  }
}

describe("INT-CU12: CU-12 User Registration and Access Gate", () => {
  let redis: Redis
  let repo: UserRepository
  let auth: AuthService

  const config = loadConfig({
    ...process.env,
    OWNER_SECRET: "test-secret-test-secret-test-secret",
  })

  beforeEach(async () => {
    redis = await getRedis()
    process.env.JWT_SECRET = TEST_JWT_SECRET
    repo = createRedisUserRepository(redis)
    auth = createAuthService({ repo, jwtSecret: getJwtSecret() })
  })

  function createAuthApp() {
    const app = new Hono<AppEnv>()
    app.onError(errorHandler)
    app.route("/api/auth", mountAuthRoutes({ redis, auth }))
    return app
  }

  function registerBody(overrides: Record<string, string> = {}) {
    return {
      name: TEST_NAME,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      ...overrides,
    }
  }

  it("registers 201 with a live session and no second login", async () => {
    const app = createAuthApp()
    const res = await app.request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registerBody()),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      token: string
      user: { id: string; email: string; name: string }
    }
    expect(typeof body.token).toBe("string")
    expect(body.token.split(".")).toHaveLength(3)
    expect(typeof body.user.id).toBe("string")
    expect(body.user.id.length).toBeGreaterThan(0)
    expect(body.user.email).toBe(TEST_EMAIL)
    expect(body.user.name).toBe(TEST_NAME)
    const setCookies = readSetCookies(res)
    expect(setCookies.length).toBeGreaterThan(0)
    expect(setCookies[0].toLowerCase()).toContain("httponly")

    // The session is live immediately: identity probe passes with no login.
    const me = await app.request("http://localhost/api/auth/me", {
      headers: { Authorization: `Bearer ${body.token}` },
    })
    expect(me.status).toBe(200)
    expect(((await me.json()) as { id: string }).id).toBe(body.user.id)
  })

  it("rejects a duplicate email with a generic 409 and sets no session", async () => {
    const app = createAuthApp()
    const first = await app.request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registerBody()),
    })
    expect(first.status).toBe(201)

    const second = await app.request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registerBody({ name: "Someone Else", password: "Other-2026!" })),
    })
    expect(second.status).toBe(409)
    const body = (await second.json()) as { error: string; message: string }
    expect(body.error).toBe("CONFLICT")
    expect(body.message).not.toContain(TEST_EMAIL)
    expect(readSetCookies(second)).toHaveLength(0)

    // The original account is untouched: login still yields its identity.
    const login = await app.request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    })
    expect(login.status).toBe(200)
    expect(((await login.json()) as { user: { name: string } }).user.name).toBe(TEST_NAME)
  })

  it("rejects weak passwords and malformed emails with 400 field errors", async () => {
    const app = createAuthApp()

    const weak = await app.request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registerBody({ password: "weakpass1" })),
    })
    expect(weak.status).toBe(400)
    const weakBody = (await weak.json()) as {
      fields: Record<string, string>
    }
    expect(weakBody.fields.password).toContain("symbol")

    const malformed = await app.request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registerBody({ email: "not-an-email", password: TEST_PASSWORD })),
    })
    expect(malformed.status).toBe(400)
    const malformedBody = (await malformed.json()) as {
      fields: Record<string, string>
    }
    expect(malformedBody.fields.email).toMatch(/valid address/i)

    // Nothing was created: the weak-password account fails auth, and the
    // malformed email never passes the login route's own email check (422).
    const weakLogin = await app.request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: "weakpass1" }),
    })
    expect(weakLogin.status).toBe(401)

    const malformedLogin = await app.request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "not-an-email",
        password: TEST_PASSWORD,
      }),
    })
    expect(malformedLogin.status).toBe(422)
  })

  it("honors the CU-11 session contract on registered sessions (refresh + logout)", async () => {
    const app = createAuthApp()
    const registered = await app.request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registerBody()),
    })
    expect(registered.status).toBe(201)
    const firstCookie = cookieHeader(registered)

    const refreshed = await app.request("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { Cookie: firstCookie },
    })
    expect(refreshed.status).toBe(200)
    const secondCookie = cookieHeader(refreshed)
    expect(secondCookie).not.toBe(firstCookie)

    const replay = await app.request("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { Cookie: firstCookie },
    })
    expect(replay.status).toBe(401)

    const logout = await app.request("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { Cookie: secondCookie },
    })
    expect(logout.status).toBe(200)
    const afterLogout = await app.request("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { Cookie: secondCookie },
    })
    expect(afterLogout.status).toBe(401)
  })

  it("records the registered author on snapshots, ignoring spoofed actors", async () => {
    const published: { actor?: string }[] = []
    const app = new Hono<AppEnv>()
    app.onError(errorHandler)
    app.use("/api/diagrams/*", authOptional({ auth }))
    app.route(
      "/api",
      mountVersionRoutes(
        { config, redis },
        {
          publishControl: (_diagramId, control) => {
            if (control.type === "VERSION_CREATED" || control.type === "VERSION_RESTORED") {
              published.push({ actor: control.actor })
            }
          },
        }
      )
    )

    const registered = await createAuthApp().request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registerBody()),
    })
    expect(registered.status).toBe(201)
    const { token } = (await registered.json()) as { token: string }

    const diagramId = "cu12-spoof-diagram"
    await saveHead(redis, config, minimalDiagram(diagramId))

    const res = await app.request(`http://localhost/api/diagrams/${diagramId}/versions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: "v1",
        actor: "Mallory Spoofer",
        body: minimalDiagram(diagramId),
      }),
    })
    expect(res.status).toBe(201)
    expect(published).toHaveLength(1)
    expect(published[0].actor).toBe(TEST_NAME)
    expect(published[0].actor).not.toBe("Mallory Spoofer")
  })

  it("keeps the shared WS gate: registered token admitted, anonymous rejected, local open", async () => {
    const port = await getFreePort()
    const relay = startRelayServer({
      port,
      host: "127.0.0.1",
      verifyToken: async (token: string) => (await auth.verifyAccess(token)).userId,
    })

    const registered = await createAuthApp().request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registerBody()),
    })
    const { token } = (await registered.json()) as { token: string }

    async function join(params: string): Promise<{ code: number }> {
      return new Promise((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}${params}`)
        const done = (code: number) => resolve({ code })
        ws.once("close", (code: number) => done(code))
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) ws.close(1000)
          else done(ws.readyState === WebSocket.CLOSED ? 1006 : 1000)
        }, 500)
        ws.once("error", () => {
          // Close event follows; resolution happens there.
        })
      })
    }

    const authed = await join(
      `?diagramId=cu12-shared&mode=shared&token=${encodeURIComponent(token)}`
    )
    expect(authed.code).toBe(1000)

    const anon = await join("?diagramId=cu12-shared&mode=shared")
    expect([4401, 1008]).toContain(anon.code)

    const local = await join("?diagramId=cu12-local&mode=local")
    expect(local.code).toBe(1000)

    await relay.close()
  })
})
