import { logger } from "../logger.js"
import { k, type Redis } from "../redis.js"
import type { AuthService, UserRepository } from "../services/auth-service.js"

export interface SeedUser {
  name: string
  email: string
  password: string
}

/**
 * Email addresses of the previously versioned demo accounts whose credentials
 * were committed to the repository. Passwords are intentionally NOT listed
 * here. These accounts must be revoked (deleted) in every environment where
 * they may have been seeded. New seeder accounts MUST use different
 * addresses (see `.env.seed.example`).
 */
export const LEGACY_REVOKED_SEED_EMAILS: readonly string[] = [
  "moises@umlstudio.com",
  "admin@umlstudio.com",
  "modeler@umlstudio.com",
  "alice@umlstudio.com",
]

function isValidSeedUser(value: unknown): value is SeedUser {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.name === "string" &&
    candidate.name.trim().length > 0 &&
    typeof candidate.email === "string" &&
    candidate.email.includes("@") &&
    typeof candidate.password === "string" &&
    candidate.password.length >= 12
  )
}

/**
 * Loads seeder accounts exclusively from the environment. The JSON document
 * lives in `UMLSTUDIO_SEED_USERS` and is NEVER committed: local development
 * reads it from an ignored `.env.seed` file (see `.env.seed.example`), and
 * production reads it from the platform secret store (Render env vars).
 * Returns an empty list when unset, so boot never creates accounts by itself.
 */
export function loadSeedUsers(env: NodeJS.ProcessEnv = process.env): SeedUser[] {
  const raw = env.UMLSTUDIO_SEED_USERS
  if (!raw || raw.trim().length === 0) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      logger.warn(
        { event: "auth.seed.invalid" },
        "UMLSTUDIO_SEED_USERS must be a JSON array; skipping seeding"
      )
      return []
    }
    const users = parsed.filter(isValidSeedUser)
    if (users.length !== parsed.length) {
      logger.warn(
        { event: "auth.seed.invalid_entries" },
        "some UMLSTUDIO_SEED_USERS entries were invalid and were skipped " +
          "(name/email required, password min 12 chars)"
      )
    }
    return users
  } catch (err) {
    logger.warn(
      { event: "auth.seed.parse_error", err },
      "could not parse UMLSTUDIO_SEED_USERS; skipping seeding"
    )
    return []
  }
}

/**
 * Idempotently seeds users from the environment into the repository.
 * Safe to run on every startup or as an explicit CLI task. Creates nothing
 * when `UMLSTUDIO_SEED_USERS` is unset. Callers (mostly tests) may pass an
 * explicit list instead.
 */
export async function seedDefaultUsers(
  auth: AuthService,
  repo: UserRepository,
  users: SeedUser[] = loadSeedUsers()
): Promise<{ seeded: number; existing: number }> {
  let seeded = 0
  let existing = 0

  for (const item of users) {
    try {
      const user = await repo.findByEmail(item.email)
      if (!user) {
        await auth.register({
          name: item.name,
          email: item.email,
          password: item.password,
        })
        seeded++
        logger.info(
          {
            event: "auth.seed.user_created",
            email: item.email,
            name: item.name,
          },
          `seeded user ${item.email}`
        )
      } else {
        existing++
      }
    } catch (err) {
      logger.warn(
        { event: "auth.seed.error", email: item.email, err },
        `could not seed user ${item.email}`
      )
    }
  }

  return { seeded, existing }
}

/**
 * Deletes the previously versioned demo accounts (emails only, see
 * `LEGACY_REVOKED_SEED_EMAILS`) from Redis. Passwords are never needed for
 * revocation: the user hash and the email index are removed outright, which
 * invalidates credential login immediately. Refresh sessions already issued
 * for these users expire by TTL; restart the server to drop in-memory state.
 */
export async function revokeLegacySeedUsers(
  redis: Redis,
  emails: readonly string[] = LEGACY_REVOKED_SEED_EMAILS
): Promise<{ revoked: number; missing: number }> {
  let revoked = 0
  let missing = 0

  for (const email of emails) {
    try {
      const id = await redis.get(k.authUserByEmail(email))
      if (!id) {
        missing++
        continue
      }
      const multi = redis.multi()
      multi.del(k.authUser(id))
      multi.del(k.authUserByEmail(email))
      await multi.exec()
      revoked++
      logger.info({ event: "auth.seed.legacy_revoked", email }, `revoked legacy seed user ${email}`)
    } catch (err) {
      logger.warn(
        { event: "auth.seed.revoke_error", email, err },
        `could not revoke legacy seed user ${email}`
      )
    }
  }

  return { revoked, missing }
}
