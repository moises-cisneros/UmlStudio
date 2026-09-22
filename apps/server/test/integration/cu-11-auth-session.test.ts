import { describe, it, expect, beforeEach } from "vitest"
import { Hono } from "hono"
import { createServer } from "node:net"
import WebSocket from "ws"
import { SignJWT } from "jose"
import { hash } from "bcryptjs"
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

const TEST_JWT_SECRET = "cu11-test-jwt-secret-min-32-chars!!"
const TEST_EMAIL = "modeler@example.com"
const TEST_PASSWORD = "correct-horse-battery"
const TEST_USER_ID = "user-cu11-001"
const TEST_USER_NAME = "Ada Modeler"

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
    title: "CU-11 Session Diagram",
    type: "ClassDiagram",
    assessments: {},
    createdAt: now,
    updatedAt: now,
    nodes: [],
    edges: [],
  }
}

describe("INT-CU11: CU-11 Authentication and Session Identity", () => {
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
    await repo.saveUser({
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      passwordHash: await hash(TEST_PASSWORD, 4),
      name: TEST_USER_NAME,
      color: "#3590F3",
    })
  })

  function createAuthApp() {
    const app = new Hono<AppEnv>()
    app.onError(errorHandler)
    app.route("/api/auth", mountAuthRoutes({ redis, auth }))
    return app
  }

  it("issues 200 with access token and HttpOnly refresh cookie on valid login", async () => {
    const app = createAuthApp()
    const res = await app.request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      token: string
      user: { id: string; name: string }
    }
    expect(typeof body.token).toBe("string")
    expect(body.token.split(".")).toHaveLength(3)
    expect(body.user.id).toBe(TEST_USER_ID)
    expect(body.user.name).toBe(TEST_USER_NAME)
    const setCookies = readSetCookies(res)
    expect(setCookies.length).toBeGreaterThan(0)
    expect(setCookies[0].toLowerCase()).toContain("httponly")
  })

  it("rejects wrong password and unknown email with identical generic 401", async () => {
    const app = createAuthApp()
    const wrong = await app.request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: "wrong-password" }),
    })
    const unknown = await app.request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "nobody@example.com",
        password: "whatever",
      }),
    })
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(await wrong.json()).toEqual(await unknown.json())
    expect(readSetCookies(wrong)).toHaveLength(0)
    expect(readSetCookies(unknown)).toHaveLength(0)
  })

  it("rotates refresh credentials and rejects reuse of the old cookie", async () => {
    const app = createAuthApp()
    const login = await app.request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    })
    expect(login.status).toBe(200)
    const firstCookie = cookieHeader(login)

    const refreshed = await app.request("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { Cookie: firstCookie },
    })
    expect(refreshed.status).toBe(200)
    const refreshedBody = (await refreshed.json()) as { token: string }
    expect(typeof refreshedBody.token).toBe("string")
    const secondCookie = cookieHeader(refreshed)
    expect(secondCookie).not.toBe(firstCookie)

    const replay = await app.request("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { Cookie: firstCookie },
    })
    expect(replay.status).toBe(401)
  })

  it("revokes refresh on logout so replay after logout fails with 401", async () => {
    const app = createAuthApp()
    const login = await app.request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    })
    const loginCookie = cookieHeader(login)

    const logout = await app.request("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { Cookie: loginCookie },
    })
    expect(logout.status).toBe(200)

    const replay = await app.request("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { Cookie: loginCookie },
    })
    expect(replay.status).toBe(401)
    expect((await replay.json()) as object).not.toHaveProperty("token")
  })

  it("returns identity on /me with token and 401 without or with forged token", async () => {
    const app = createAuthApp()
    const login = await app.request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    })
    const { token } = (await login.json()) as { token: string }

    const me = await app.request("http://localhost/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(me.status).toBe(200)
    const meBody = (await me.json()) as { id: string; name: string }
    expect(meBody.id).toBe(TEST_USER_ID)
    expect(meBody.name).toBe(TEST_USER_NAME)

    const missing = await app.request("http://localhost/api/auth/me")
    expect(missing.status).toBe(401)

    const forged = await app.request("http://localhost/api/auth/me", {
      headers: { Authorization: "Bearer forged.forged.forged" },
    })
    expect(forged.status).toBe(401)
  })

  it("admits shared WS joins with token, rejects anonymous/forged with 4401/1008, keeps local tokenless", async () => {
    const port = await getFreePort()
    const relay = startRelayServer({
      port,
      host: "127.0.0.1",
      verifyToken: async (token: string) => (await auth.verifyAccess(token)).userId,
    })

    const login = await createAuthApp().request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    })
    const { token } = (await login.json()) as { token: string }

    async function join(params: string): Promise<{ code: number }> {
      // A server-rejected socket may still emit "open" before the 4401/1008
      // close frame arrives, so the close code (not the open flag) is the
      // admission signal. Admitted sockets stay open until we close them.
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
      `?diagramId=cu11-shared&mode=shared&token=${encodeURIComponent(token)}`
    )
    expect(authed.code).toBe(1000)

    const anon = await join("?diagramId=cu11-shared&mode=shared")
    expect([4401, 1008]).toContain(anon.code)

    const forgedJoin = await join("?diagramId=cu11-shared&mode=shared&token=forged")
    expect([4401, 1008]).toContain(forgedJoin.code)

    const local = await join("?diagramId=cu11-local&mode=local")
    expect(local.code).toBe(1000)

    await relay.close()
  })

  it("ignores spoofed actor and records the verified author on snapshots", async () => {
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

    const login = await createAuthApp().request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    })
    const { token } = (await login.json()) as { token: string }

    const diagramId = "cu11-spoof-diagram"
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
    expect(published[0].actor).toBe(TEST_USER_NAME)
    expect(published[0].actor).not.toBe("Mallory Spoofer")
  })

  it("rejects expired access tokens on protected calls and shared joins", async () => {
    const expired = await new SignJWT({ sub: TEST_USER_ID })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(new Date(Date.now() - 20 * 60 * 1000))
      .setExpirationTime(new Date(Date.now() - 5 * 60 * 1000))
      .sign(new TextEncoder().encode(TEST_JWT_SECRET))

    const me = await createAuthApp().request("http://localhost/api/auth/me", {
      headers: { Authorization: `Bearer ${expired}` },
    })
    expect(me.status).toBe(401)

    const port = await getFreePort()
    const relay = startRelayServer({
      port,
      host: "127.0.0.1",
      verifyToken: async (token: string) => (await auth.verifyAccess(token)).userId,
    })
    const outcome = await new Promise<{ code: number }>((resolve) => {
      const ws = new WebSocket(
        `ws://127.0.0.1:${port}?diagramId=cu11-exp&mode=shared&token=${encodeURIComponent(expired)}`
      )
      ws.once("close", (code: number) => resolve({ code }))
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) ws.close()
      }, 500)
      ws.once("error", () => {})
    })
    expect([4401, 1008]).toContain(outcome.code)
    await relay.close()
  })

  it("fails closed when JWT_SECRET is missing", () => {
    const saved = process.env.JWT_SECRET
    delete process.env.JWT_SECRET
    try {
      expect(() => getJwtSecret()).toThrow()
    } finally {
      process.env.JWT_SECRET = saved
    }
  })
})
