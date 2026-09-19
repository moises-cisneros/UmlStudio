import { Hono } from "hono";
import type { AppEnv } from "../http/env.js";
import { authGuard } from "../http/middleware/auth.js";
import { Errors } from "../http/errors.js";
import {
  type AuthService,
  InvalidPasswordError,
} from "../services/auth-service.js";
import {
  changePasswordSchema,
  updateProfileSchema,
} from "../auth/password-policy.js";

interface UserRouteDeps {
  auth: AuthService;
}

export function mountUserRoutes(deps: UserRouteDeps): Hono<AppEnv> {
  const { auth } = deps;
  const router = new Hono<AppEnv>();

  // All user management routes require valid JWT authorization
  router.use("*", authGuard({ auth }));

  /**
   * PATCH /profile (and PUT /profile)
   * Updates display name, avatar, and/or presence color.
   */
  const handleUpdateProfile = async (c: import("hono").Context<AppEnv>) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      raw = {};
    }

    const parsed = updateProfileSchema.safeParse(raw);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "(root)";
        if (!(key in fields)) fields[key] = issue.message;
      }
      const first = Object.entries(fields)[0];
      throw Errors.badRequest(
        first ? `Invalid ${first[0]}: ${first[1]}` : "Invalid profile update",
        fields,
      );
    }

    const authUser = c.get("user");
    if (!authUser) throw Errors.unauthorized();
    const updated = await auth.updateProfile(authUser.id, parsed.data);
    return c.json(updated, 200);
  };

  router.patch("/profile", handleUpdateProfile);
  router.put("/profile", handleUpdateProfile);

  /**
   * POST /change-password
   * Validates current password via bcrypt and sets new password if compliant with policy.
   */
  router.post("/change-password", async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      raw = {};
    }

    const parsed = changePasswordSchema.safeParse(raw);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "(root)";
        if (!(key in fields)) fields[key] = issue.message;
      }
      const first = Object.entries(fields)[0];
      throw Errors.badRequest(
        first ? `Invalid ${first[0]}: ${first[1]}` : "Invalid password change",
        fields,
      );
    }

    const authUser = c.get("user");
    if (!authUser) throw Errors.unauthorized();
    try {
      await auth.changePassword(
        authUser.id,
        parsed.data.currentPassword,
        parsed.data.newPassword,
      );
      return c.json({ ok: true }, 200);
    } catch (err) {
      if (err instanceof InvalidPasswordError) {
        throw Errors.badRequest("Invalid current password", {
          currentPassword: "The current password entered is incorrect",
        });
      }
      throw err;
    }
  });

  return router;
}
