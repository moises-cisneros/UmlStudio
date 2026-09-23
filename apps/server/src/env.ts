import { readFileSync } from "node:fs"
import { parseEnv } from "node:util"

function loadEnvFile(path: string): void {
  let contents: string
  try {
    contents = readFileSync(path, "utf8")
  } catch {
    // Optional env file; ignore if missing
    return
  }
  if (!contents) return
  const parsed = parseEnv(contents)
  for (const key of Object.keys(parsed)) {
    if (process.env[key] === undefined) process.env[key] = parsed[key]
  }
}

// Base configuration for every environment.
loadEnvFile(".env")

// Local seeder accounts (UMLSTUDIO_SEED_USERS) live in a git-ignored
// `.env.seed` file (see `.env.seed.example`). It is loaded automatically
// in non-production environments so `seed:users` and server boot pick the
// seeders up without manually sourcing the file. Production MUST provide
// seeders through the platform secret store instead, so this file is
// never read there. Real environment variables always win.
if (process.env.NODE_ENV !== "production") {
  loadEnvFile(".env.seed")
}
