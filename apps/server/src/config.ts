import { z } from "zod"

const intEnv = (fallback: number) => z.coerce.number().int().positive().default(fallback)

const ConfigSchema = z.object({
  HOST: z.string().default("localhost"),
  PORT: intEnv(8000),
  WS_PORT: intEnv(4444),
  CORS_ORIGIN: z.string().optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  OWNER_SECRET: z.string().min(32).default("development-only-replace-in-prod"),
  MAX_VERSIONS_PER_DIAGRAM: intEnv(50),
  MAX_SNAPSHOT_BYTES: intEnv(5 * 1024 * 1024),
  MAX_DESCRIPTION_LENGTH: intEnv(240),
  MAX_NAME_LENGTH: intEnv(80),
  DIAGRAM_TTL_SECONDS: intEnv(120 * 24 * 3600),
  VERSION_TTL_SECONDS: intEnv(121 * 24 * 3600),
  AUTO_VERSION_INTERVAL_SECONDS: intEnv(30 * 60),
})

export type Config = z.infer<typeof ConfigSchema>

const DEFAULT_OWNER_SECRET = "development-only-replace-in-prod"
const DEFAULT_OWNER_SECRET_PREFIX = "development-only-replace"

export function isDefaultOwnerSecret(secret: string): boolean {
  return (
    secret === DEFAULT_OWNER_SECRET || secret.toLowerCase().startsWith(DEFAULT_OWNER_SECRET_PREFIX)
  )
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = ConfigSchema.safeParse(env)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ")
    throw new Error(`Invalid environment configuration: ${issues}`)
  }
  if (env.NODE_ENV === "production" && isDefaultOwnerSecret(result.data.OWNER_SECRET)) {
    throw new Error(
      "OWNER_SECRET is set to the development default. " +
        "Set OWNER_SECRET to a unique, high-entropy value (≥32 chars) before booting in production."
    )
  }
  return result.data
}
