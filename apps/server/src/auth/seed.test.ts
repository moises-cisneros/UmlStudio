import { describe, it, expect } from "vitest";
import {
  createAuthService,
  type StoredUser,
  type UserRepository,
} from "../services/auth-service.js";
import { DEFAULT_SEEDED_USERS, seedDefaultUsers } from "./seed.js";

const TEST_JWT_SECRET = "cu12-seed-jwt-secret-min-32-chars!!";

function mockRepo(): UserRepository & { saved: StoredUser[] } {
  const map = new Map<string, StoredUser>();
  return {
    saved: [],
    findByEmail: async (email: string) => map.get(email.toLowerCase()) ?? null,
    findById: async (id: string) => {
      for (const u of map.values()) {
        if (u.id === id) return u;
      }
      return null;
    },
    saveUser: async (user: StoredUser) => {
      map.set(user.email.toLowerCase(), user);
    },
    saveRefresh: async () => {},
    consumeRefresh: async () => null,
    revokeRefresh: async () => {},
  };
}

describe("seedDefaultUsers", () => {
  it("seeds all default users on first run", async () => {
    const repo = mockRepo();
    const auth = createAuthService({ repo, jwtSecret: TEST_JWT_SECRET });

    const result = await seedDefaultUsers(auth, repo);
    expect(result.seeded).toBe(DEFAULT_SEEDED_USERS.length);
    expect(result.existing).toBe(0);

    for (const item of DEFAULT_SEEDED_USERS) {
      const user = await repo.findByEmail(item.email);
      expect(user).not.toBeNull();
      expect(user?.name).toBe(item.name);
    }
  });

  it("is idempotent when users already exist", async () => {
    const repo = mockRepo();
    const auth = createAuthService({ repo, jwtSecret: TEST_JWT_SECRET });

    await seedDefaultUsers(auth, repo);
    const secondRun = await seedDefaultUsers(auth, repo);

    expect(secondRun.seeded).toBe(0);
    expect(secondRun.existing).toBe(DEFAULT_SEEDED_USERS.length);
  });
});
