import { describe, it, expect } from "vitest"
import {
  createAuthService,
  type StoredUser,
  type UserRepository,
} from "../services/auth-service.js"
import {
  LEGACY_REVOKED_SEED_EMAILS,
  loadSeedUsers,
  seedDefaultUsers,
  type SeedUser,
} from "./seed.js"

const TEST_JWT_SECRET = "cu12-seed-jwt-secret-min-32-chars!!"

const TEST_SEED_USERS: SeedUser[] = [
  { name: "Test Lead", email: "test-lead@example.com", password: "TestLead#2026!" },
  { name: "Test Modeler", email: "test-modeler@example.com", password: "TestModel#2026!" },
]

function mockRepo(): UserRepository & { saved: StoredUser[] } {
  const map = new Map<string, StoredUser>()
  return {
    saved: [],
    findByEmail: async (email: string) => map.get(email.toLowerCase()) ?? null,
    findById: async (id: string) => {
      for (const u of map.values()) {
        if (u.id === id) return u
      }
      return null
    },
    saveUser: async (user: StoredUser) => {
      map.set(user.email.toLowerCase(), user)
    },
    saveRefresh: async () => {},
    consumeRefresh: async () => null,
    revokeRefresh: async () => {},
  }
}

describe("seedDefaultUsers", () => {
  it("seeds all given users on first run", async () => {
    const repo = mockRepo()
    const auth = createAuthService({ repo, jwtSecret: TEST_JWT_SECRET })

    const result = await seedDefaultUsers(auth, repo, TEST_SEED_USERS)
    expect(result.seeded).toBe(TEST_SEED_USERS.length)
    expect(result.existing).toBe(0)

    for (const item of TEST_SEED_USERS) {
      const user = await repo.findByEmail(item.email)
      expect(user).not.toBeNull()
      expect(user?.name).toBe(item.name)
    }
  })

  it("is idempotent when users already exist", async () => {
    const repo = mockRepo()
    const auth = createAuthService({ repo, jwtSecret: TEST_JWT_SECRET })

    await seedDefaultUsers(auth, repo, TEST_SEED_USERS)
    const secondRun = await seedDefaultUsers(auth, repo, TEST_SEED_USERS)

    expect(secondRun.seeded).toBe(0)
    expect(secondRun.existing).toBe(TEST_SEED_USERS.length)
  })

  it("seeds nothing when no users are provided", async () => {
    const repo = mockRepo()
    const auth = createAuthService({ repo, jwtSecret: TEST_JWT_SECRET })

    const result = await seedDefaultUsers(auth, repo, [])
    expect(result.seeded).toBe(0)
    expect(result.existing).toBe(0)
  })
})

describe("loadSeedUsers", () => {
  it("returns empty list when UMLSTUDIO_SEED_USERS is unset", () => {
    expect(loadSeedUsers({} as NodeJS.ProcessEnv)).toEqual([])
  })

  it("parses valid JSON users from the environment", () => {
    const env = {
      UMLSTUDIO_SEED_USERS: JSON.stringify(TEST_SEED_USERS),
    } as NodeJS.ProcessEnv
    expect(loadSeedUsers(env)).toEqual(TEST_SEED_USERS)
  })

  it("skips entries with short passwords", () => {
    const env = {
      UMLSTUDIO_SEED_USERS: JSON.stringify([
        { name: "Weak", email: "weak@example.com", password: "short" },
        TEST_SEED_USERS[0],
      ]),
    } as NodeJS.ProcessEnv
    expect(loadSeedUsers(env)).toEqual([TEST_SEED_USERS[0]])
  })

  it("returns empty list on malformed JSON", () => {
    const env = { UMLSTUDIO_SEED_USERS: "not-json{" } as NodeJS.ProcessEnv
    expect(loadSeedUsers(env)).toEqual([])
  })
})

describe("LEGACY_REVOKED_SEED_EMAILS", () => {
  it("tracks the versioned demo addresses without passwords", () => {
    expect(LEGACY_REVOKED_SEED_EMAILS).toContain("admin@umlstudio.com")
    expect(LEGACY_REVOKED_SEED_EMAILS.length).toBeGreaterThan(0)
  })
})
