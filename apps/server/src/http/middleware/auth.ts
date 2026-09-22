import { createMiddleware } from "hono/factory"
import type { AppEnv } from "../env.js"
import { Errors } from "../errors.js"
import { AuthError, type AuthService } from "../../services/auth-service.js"

interface GuardDeps {
  auth: AuthService
}

function readBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined
  const match = /^Bearer (.+)$/.exec(header.trim())
  return match ? match[1] : undefined
}

/**
 * Required Bearer guard. Verifies the access JWT, resolves the
 * registered profile, and stashes it on the context. Every failure —
 * missing, malformed, forged, or expired token — yields a generic 401.
 */
export function authGuard({ auth }: GuardDeps) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const token = readBearerToken(c.req.header("Authorization"))
    if (!token) throw Errors.unauthorized()
    try {
      const { userId } = await auth.verifyAccess(token)
      c.set("user", await auth.getProfile(userId))
    } catch (err) {
      if (err instanceof AuthError) throw Errors.unauthorized()
      throw err
    }
    await next()
  })
}

/**
 * Optional identity resolver for routes that stay public (versions):
 * when a valid Bearer token is present the verified profile is stashed,
 * otherwise the request continues anonymously. Never throws for auth
 * reasons — callers decide how to treat anonymous requests.
 */
export function authOptional({ auth }: GuardDeps) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const token = readBearerToken(c.req.header("Authorization"))
    if (token) {
      try {
        const { userId } = await auth.verifyAccess(token)
        c.set("user", await auth.getProfile(userId))
      } catch {
        // Anonymous: invalid tokens are simply ignored here.
      }
    }
    await next()
  })
}
