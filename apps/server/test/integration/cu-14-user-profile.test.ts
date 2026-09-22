import { describe, it, expect, beforeEach } from "vitest"
import { Hono } from "hono"
import type { AppEnv } from "../../src/http/env.js"
import { errorHandler } from "../../src/http/middleware/errors.js"
import { getRedis } from "../../src/__tests__/setup.js"
import {
  createAuthService,
  createRedisUserRepository,
  type AuthService,
} from "../../src/services/auth-service.js"
import { mountAuthRoutes } from "../../src/routes/auth.js"
import { mountUserRoutes } from "../../src/routes/users.js"

const TEST_JWT_SECRET = "cu14-test-jwt-secret-min-32-chars!!"
const INITIAL_PASSWORD = "Password123!"
const NEW_PASSWORD = "NewPassword456#"

describe("INT-CU14: User Profile and Security", () => {
  let app: Hono<AppEnv>
  let auth: AuthService

  beforeEach(async () => {
    const redis = await getRedis()
    const repo = createRedisUserRepository(redis)
    auth = createAuthService({
      repo,
      jwtSecret: TEST_JWT_SECRET,
    })

    app = new Hono<AppEnv>()
    app.onError(errorHandler)
    app.route("/api/auth", mountAuthRoutes({ redis, auth }))
    app.route("/api/users", mountUserRoutes({ auth }))
  })

  async function registerAndGetToken(email: string, name: string) {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        name,
        password: INITIAL_PASSWORD,
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    return { token: body.token as string, user: body.user }
  }

  it("actualiza avatar, nombre y color en /api/users/profile con sesión activa", async () => {
    const { token } = await registerAndGetToken("ada.profile@example.com", "Ada Lovelace")

    const patchRes = await app.request("/api/users/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: "Ada Augusta King",
        avatar: "avatar-robot",
        color: "#EC4899",
      }),
    })

    expect(patchRes.status).toBe(200)
    const profile = await patchRes.json()
    expect(profile.name).toBe("Ada Augusta King")
    expect(profile.avatar).toBe("avatar-robot")
    expect(profile.color).toBe("#EC4899")

    // Verificar en /api/auth/me
    const meRes = await app.request("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(meRes.status).toBe(200)
    const me = await meRes.json()
    expect(me.name).toBe("Ada Augusta King")
    expect(me.avatar).toBe("avatar-robot")
    expect(me.color).toBe("#EC4899")
  })

  it("rechaza actualización de perfil sin token con 401 Unauthorized", async () => {
    const res = await app.request("/api/users/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Hacker" }),
    })
    expect(res.status).toBe(401)
  })

  it("rechaza cambio de contraseña con clave actual incorrecta (FA-01) con 400 Bad Request", async () => {
    const { token } = await registerAndGetToken("wrong.pwd@example.com", "Test User")

    const res = await app.request("/api/users/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        currentPassword: "IncorrectPassword123!",
        newPassword: NEW_PASSWORD,
      }),
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; message: string }
    expect(body.message).toContain("Invalid current password")
  })

  it("rechaza cambio de contraseña cuando la nueva no cumple política (FA-02) con 400 Bad Request", async () => {
    const { token } = await registerAndGetToken("weak.pwd@example.com", "Test User")

    const res = await app.request("/api/users/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        currentPassword: INITIAL_PASSWORD,
        newPassword: "short", // Falta longitud, símbolos, etc.
      }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it("ejecuta cambio exitoso de contraseña, invalida login previo y admite nueva clave", async () => {
    const email = "security.flow@example.com"
    const { token } = await registerAndGetToken(email, "Security Champion")

    // 1. Cambiar contraseña
    const changeRes = await app.request("/api/users/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        currentPassword: INITIAL_PASSWORD,
        newPassword: NEW_PASSWORD,
      }),
    })
    expect(changeRes.status).toBe(200)
    const changeBody = await changeRes.json()
    expect(changeBody.ok).toBe(true)

    // 2. Intentar login con la contraseña antigua -> 401 Unauthorized
    const oldLoginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password: INITIAL_PASSWORD,
      }),
    })
    expect(oldLoginRes.status).toBe(401)

    // 3. Intentar login con la nueva contraseña -> 200 OK
    const newLoginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password: NEW_PASSWORD,
      }),
    })
    expect(newLoginRes.status).toBe(200)
    const newSession = await newLoginRes.json()
    expect(newSession.token).toBeDefined()
    expect(newSession.user.email).toBe(email)
  })
})
