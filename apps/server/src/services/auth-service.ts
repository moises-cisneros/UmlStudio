import { randomUUID } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import {
  consumeRefreshSession,
  k,
  REFRESH_TTL_SECONDS,
  revokeRefreshSession,
  saveRefreshSession,
  type Redis,
} from "../redis.js";

/** Access-token lifetime: 15 minutes (spec token constraint). */
export const ACCESS_TTL_SECONDS = 15 * 60;

/** bcrypt cost factor for password hashing. */
export const BCRYPT_COST = 12;

export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  avatar?: string;
  color?: string;
}

export interface AuthProfile {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  color?: string;
}

export function toProfile(user: StoredUser): AuthProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    ...(user.avatar ? { avatar: user.avatar } : {}),
    ...(user.color ? { color: user.color } : {}),
  };
}

/**
 * Persistence seam for session identity. Redis-backed today;
 * a PostgreSQL implementation can replace it for without
 * touching the service or routes.
 */
export interface UserRepository {
  findByEmail(email: string): Promise<StoredUser | null>;
  findById(id: string): Promise<StoredUser | null>;
  saveUser(user: StoredUser): Promise<void>;
  saveRefresh(jti: string, userId: string, ttlSec: number): Promise<void>;
  consumeRefresh(jti: string): Promise<string | null>;
  revokeRefresh(jti: string): Promise<void>;
}

function readStoredUser(fields: Record<string, string>): StoredUser | null {
  if (!fields.id || !fields.email || !fields.passwordHash || !fields.name) {
    return null;
  }
  return {
    id: fields.id,
    email: fields.email,
    passwordHash: fields.passwordHash,
    name: fields.name,
    ...(fields.avatar ? { avatar: fields.avatar } : {}),
    ...(fields.color ? { color: fields.color } : {}),
  };
}

export function createRedisUserRepository(redis: Redis): UserRepository {
  return {
    async findByEmail(email: string): Promise<StoredUser | null> {
      const id = await redis.get(k.authUserByEmail(email));
      if (!id) return null;
      return this.findById(id);
    },
    async findById(id: string): Promise<StoredUser | null> {
      const fields = await redis.hGetAll(k.authUser(id));
      if (!fields || Object.keys(fields).length === 0) return null;
      return readStoredUser(fields);
    },
    async saveUser(user: StoredUser): Promise<void> {
      const multi = redis.multi();
      multi.hSet(k.authUser(user.id), {
        id: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
        name: user.name,
        avatar: user.avatar ?? "",
        color: user.color ?? "",
      });
      multi.set(k.authUserByEmail(user.email), user.id);
      await multi.exec();
    },
    async saveRefresh(
      jti: string,
      userId: string,
      ttlSec: number,
    ): Promise<void> {
      await saveRefreshSession(redis, jti, userId, ttlSec);
    },
    async consumeRefresh(jti: string): Promise<string | null> {
      return consumeRefreshSession(redis, jti);
    },
    async revokeRefresh(jti: string): Promise<void> {
      await revokeRefreshSession(redis, jti);
    },
  };
}

/** Thrown for every auth failure; routes map it to a generic 401. */
export class AuthError extends Error {
  constructor(message = "Invalid credentials") {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Thrown when registration targets an already-registered email.
 * Routes map it to a generic 409 that never confirms which field collided.
 */
export class DuplicateEmailError extends Error {
  constructor(message = "Registration unavailable") {
    super(message);
    this.name = "DuplicateEmailError";
  }
}

/**
 * Thrown when current password validation fails on password reset.
 * Routes map it to 400 Bad Request.
 */
export class InvalidPasswordError extends Error {
  constructor(message = "Invalid current password") {
    super(message);
    this.name = "InvalidPasswordError";
  }
}


/** Canonical email form for uniqueness checks and persistence. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Deterministic presence color derived from the email (minimal).
 * Avatar stays deferred to CU-14; awareness requires a stable color.
 */
const PRESENCE_COLORS = [
  "#3590F3",
  "#7C5CFF",
  "#22B07D",
  "#F35959",
  "#F5A524",
  "#EC4899",
  "#14B8A6",
  "#F97316",
];

export function derivePresenceColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = (hash * 31 + email.charCodeAt(i)) >>> 0;
  }
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length]!;
}

export interface SessionTokens {
  token: string;
  refreshJti: string;
  user: AuthProfile;
}

export interface VerifiedAccess {
  userId: string;
}

export interface AuthService {
  login(email: string, password: string): Promise<SessionTokens>;
  register(input: RegisterInput): Promise<SessionTokens>;
  refresh(refreshJti: string): Promise<SessionTokens>;
  logout(refreshJti: string | undefined): Promise<void>;
  verifyAccess(token: string): Promise<VerifiedAccess>;
  getProfile(userId: string): Promise<AuthProfile>;
  updateProfile(
    userId: string,
    input: { name?: string | undefined; avatar?: string | undefined; color?: string | undefined },
  ): Promise<AuthProfile>;
  changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void>;
  hashPassword(password: string): Promise<string>;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

interface AuthServiceDeps {
  repo: UserRepository;
  jwtSecret: string;
  accessTtlSec?: number;
  refreshTtlSec?: number;
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const {
    repo,
    jwtSecret,
    accessTtlSec = ACCESS_TTL_SECONDS,
    refreshTtlSec = REFRESH_TTL_SECONDS,
  } = deps;
  const secretKey = new TextEncoder().encode(jwtSecret);

  async function signAccess(userId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${accessTtlSec}s`)
      .sign(secretKey);
  }

  async function issue(user: StoredUser): Promise<SessionTokens> {
    const refreshJti = randomUUID();
    await repo.saveRefresh(refreshJti, user.id, refreshTtlSec);
    return {
      token: await signAccess(user.id),
      refreshJti,
      user: toProfile(user),
    };
  }

  return {
    async login(email: string, password: string): Promise<SessionTokens> {
      const user = await repo.findByEmail(normalizeEmail(email));
      if (!user) throw new AuthError();
      const ok = await compare(password, user.passwordHash);
      if (!ok) throw new AuthError();
      return issue(user);
    },
    /**
     * Registration. Validates uniqueness, hashes, persists, then
     * delegates to the `issue()` path — registration <<includes>>
     * login, so the session contract is login-grade by construction.
     */
    async register(input: RegisterInput): Promise<SessionTokens> {
      const email = normalizeEmail(input.email);
      const existing = await repo.findByEmail(email);
      if (existing) throw new DuplicateEmailError();
      const user: StoredUser = {
        id: randomUUID(),
        email,
        passwordHash: await hash(input.password, BCRYPT_COST),
        name: input.name.trim(),
        color: derivePresenceColor(email),
      };
      await repo.saveUser(user);
      return issue(user);
    },
    async refresh(refreshJti: string): Promise<SessionTokens> {
      const userId = await repo.consumeRefresh(refreshJti);
      if (!userId) throw new AuthError();
      const user = await repo.findById(userId);
      if (!user) throw new AuthError();
      return issue(user);
    },
    async logout(refreshJti: string | undefined): Promise<void> {
      if (refreshJti) await repo.revokeRefresh(refreshJti);
    },
    async verifyAccess(token: string): Promise<VerifiedAccess> {
      try {
        const { payload } = await jwtVerify(token, secretKey);
        if (typeof payload.sub !== "string" || payload.sub.length === 0) {
          throw new AuthError();
        }
        return { userId: payload.sub };
      } catch (err) {
        if (err instanceof AuthError) throw err;
        throw new AuthError();
      }
    },
    async getProfile(userId: string): Promise<AuthProfile> {
      const user = await repo.findById(userId);
      if (!user) throw new AuthError();
      return toProfile(user);
    },
    async updateProfile(
      userId: string,
      input: { name?: string; avatar?: string; color?: string },
    ): Promise<AuthProfile> {
      const user = await repo.findById(userId);
      if (!user) throw new AuthError();
      if (input.name !== undefined) user.name = input.name.trim();
      if (input.avatar !== undefined) user.avatar = input.avatar.trim();
      if (input.color !== undefined) user.color = input.color.trim();
      await repo.saveUser(user);
      return toProfile(user);
    },
    async changePassword(
      userId: string,
      currentPassword: string,
      newPassword: string,
    ): Promise<void> {
      const user = await repo.findById(userId);
      if (!user) throw new AuthError();
      const match = await compare(currentPassword, user.passwordHash);
      if (!match) throw new InvalidPasswordError();
      user.passwordHash = await hash(newPassword, BCRYPT_COST);
      await repo.saveUser(user);
    },
    async hashPassword(password: string): Promise<string> {
      return hash(password, BCRYPT_COST);
    },
  };
}
