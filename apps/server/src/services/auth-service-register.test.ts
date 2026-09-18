import { describe, it, expect, vi } from "vitest";
import {
  createAuthService,
  DuplicateEmailError,
  type StoredUser,
  type UserRepository,
} from "./auth-service.js";

const TEST_JWT_SECRET = "cu12-test-jwt-secret-min-32-chars!!";

function fakeRepo(overrides: Partial<UserRepository> = {}): UserRepository & {
  saved: StoredUser[];
} {
  const saved: StoredUser[] = [];
  const repo = {
    saved,
    findByEmail: async () => null,
    findById: async () => null,
    saveUser: async (user: StoredUser) => {
      saved.push(user);
    },
    saveRefresh: async () => {},
    consumeRefresh: async () => null,
    revokeRefresh: async () => {},
    ...overrides,
  };
  return repo;
}

describe("auth-service register (CU-12, reuses CU-11 issue())", () => {
  it("rejects an already-registered email without persisting", async () => {
    const existing: StoredUser = {
      id: "user-existing",
      email: "ada@example.com",
      passwordHash: "hash",
      name: "Ada Modeler",
    };
    const saveUser = vi.fn(async (_user: StoredUser) => {});
    const repo = fakeRepo({
      findByEmail: async () => existing,
      saveUser,
    });
    const auth = createAuthService({ repo, jwtSecret: TEST_JWT_SECRET });

    await expect(
      auth.register({
        name: "Someone Else",
        email: "ada@example.com",
        password: "Modeler-2026!",
      }),
    ).rejects.toBeInstanceOf(DuplicateEmailError);
    expect(saveUser).not.toHaveBeenCalled();
  });

  it("hashes the password, persists the user, and issues a login-grade session", async () => {
    const repo = fakeRepo();
    const auth = createAuthService({ repo, jwtSecret: TEST_JWT_SECRET });

    const session = await auth.register({
      name: "Ada Modeler",
      email: "ada@example.com",
      password: "Modeler-2026!",
    });

    expect(repo.saved).toHaveLength(1);
    const stored = repo.saved[0];
    expect(stored.email).toBe("ada@example.com");
    expect(stored.name).toBe("Ada Modeler");
    expect(typeof stored.id).toBe("string");
    expect(stored.id.length).toBeGreaterThan(0);
    expect(stored.passwordHash).not.toBe("Modeler-2026!");
    expect(session.user.id).toBe(stored.id);
    expect(session.token.split(".")).toHaveLength(3);
    expect(typeof session.refreshJti).toBe("string");
  });

  it("normalizes email case and whitespace before the uniqueness check", async () => {
    const findByEmail = vi.fn(async () => null);
    const repo = fakeRepo({ findByEmail });
    const auth = createAuthService({ repo, jwtSecret: TEST_JWT_SECRET });

    await auth.register({
      name: "Ada Modeler",
      email: "  ADA@Example.COM ",
      password: "Modeler-2026!",
    });

    expect(findByEmail).toHaveBeenCalledWith("ada@example.com");
    expect(repo.saved[0].email).toBe("ada@example.com");
  });
});
