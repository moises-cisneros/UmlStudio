import { logger } from "../logger.js"
import type { AuthService, UserRepository } from "../services/auth-service.js"

export interface SeedUser {
  name: string
  email: string
  password: string
  role: string
}

export const DEFAULT_SEEDED_USERS: readonly SeedUser[] = [
  {
    name: "Moises Cisneros",
    email: "moises@umlstudio.com",
    password: "UmlStudio#2026",
    role: "Lead Architect & Owner",
  },
  {
    name: "Lead Modeler",
    email: "admin@umlstudio.com",
    password: "UmlStudio#2026",
    role: "Admin & Lead Architect",
  },
  {
    name: "Collab Modeler",
    email: "modeler@umlstudio.com",
    password: "UmlStudio#2026",
    role: "Collaborative Modeler",
  },
  {
    name: "Alice Reviewer",
    email: "alice@umlstudio.com",
    password: "UmlStudio#2026",
    role: "Architecture Reviewer",
  },
]

/**
 * Idempotently seeds default users into the repository.
 * Safe to run on every startup or as an explicit CLI task.
 */
export async function seedDefaultUsers(
  auth: AuthService,
  repo: UserRepository
): Promise<{ seeded: number; existing: number }> {
  let seeded = 0
  let existing = 0

  for (const item of DEFAULT_SEEDED_USERS) {
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
          `seeded default user ${item.email}`
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
