import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { Context } from "hono";
import type { AppEnv } from "../http/env.js";
import { validate } from "../http/middleware/validate.js";
import { authGuard } from "../http/middleware/auth.js";
import { Errors } from "../http/errors.js";
import { REFRESH_TTL_SECONDS, type Redis } from "../redis.js";
import {
  AuthError,
  DuplicateEmailError,
  type AuthService,
} from "../services/auth-service.js";
import { registerSchema } from "../auth/password-policy.js";

/** Refresh-session cookie: HttpOnly, Strict SameSite, rotated each refresh. */
export const REFRESH_COOKIE = "umlstudio_refresh";
const REFRESH_COOKIE_PATH = "/api/auth";

interface Deps {
  redis: Redis;
  auth: AuthService;
  refreshTtlSec?: number;
}

function setRefreshCookie(
  c: Context<AppEnv>,
  refreshJti: string,
  maxAge: number,
): void {
  setCookie(c, REFRESH_COOKIE, refreshJti, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
    path: REFRESH_COOKIE_PATH,
    maxAge,
  });
}

function clearRefreshCookie(c: Context<AppEnv>): void {
  deleteCookie(c, REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
}

const LoginBody = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
});

export function mountAuthRoutes(deps: Deps): Hono<AppEnv> {
  const { auth, refreshTtlSec = REFRESH_TTL_SECONDS } = deps;
  const router = new Hono<AppEnv>();

  // POST /api/auth/login — valid credentials → 200 + token + cookie.
  router.post(
    "/login",
    validate({ body: LoginBody }, async (c, { body }) => {
      try {
        const session = await auth.login(body.email, body.password);
        setRefreshCookie(c, session.refreshJti, refreshTtlSec);
        return c.json({ token: session.token, user: session.user }, 200);
      } catch (err) {
        if (err instanceof AuthError) throw Errors.unauthorized();
        throw err;
      }
    }),
  );

  // POST /api/auth/register — self-registration with auto-login.
  // 201 + session on success; generic 409 on duplicate; 400 with field
  // errors on policy violations. Served under the /api/auth router prefix.
  router.post("/register", async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      raw = undefined;
    }
    const parsed = registerSchema.safeParse(raw);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "(root)";
        if (!(key in fields)) fields[key] = issue.message;
      }
      const first = Object.entries(fields)[0];
      throw Errors.badRequest(
        first ? `Invalid ${first[0]}: ${first[1]}` : "Invalid registration",
        fields,
      );
    }
    try {
      const session = await auth.register(parsed.data);
      setRefreshCookie(c, session.refreshJti, refreshTtlSec);
      return c.json({ token: session.token, user: session.user }, 201);
    } catch (err) {
      if (err instanceof DuplicateEmailError) throw Errors.conflict();
      throw err;
    }
  });

  // POST /api/auth/refresh — valid cookie → 200 + rotated pair.
  router.post("/refresh", async (c) => {
    const refreshJti = getCookie(c, REFRESH_COOKIE);
    if (!refreshJti) throw Errors.unauthorized();
    try {
      const session = await auth.refresh(refreshJti);
      setRefreshCookie(c, session.refreshJti, refreshTtlSec);
      return c.json({ token: session.token, user: session.user }, 200);
    } catch (err) {
      if (err instanceof AuthError) throw Errors.unauthorized();
      throw err;
    }
  });

  // POST /api/auth/logout — revokes server-side, clears cookie. Idempotent.
  router.post("/logout", async (c) => {
    const refreshJti = getCookie(c, REFRESH_COOKIE);
    await auth.logout(refreshJti);
    clearRefreshCookie(c);
    return c.json({ ok: true }, 200);
  });

  // GET /api/auth/me — protected identity probe.
  router.use("/me", authGuard({ auth }));
  router.get("/me", (c) => c.json(c.get("user"), 200));

  return router;
}
