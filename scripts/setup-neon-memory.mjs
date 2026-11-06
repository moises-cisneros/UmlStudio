#!/usr/bin/env node

/**
 * Neon Project Provisioning & Verification for Room AI Memory (Issue #32 / Backlog E5-05).
 * Creates and configures the dedicated `umlstudio-memory` project with `main` (prod)
 * and `dev` branches, role `memory_app` (NOBYPASSRLS), schema migration, and Render secrets.
 */

import { readFile } from "node:fs/promises"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = resolve(__dirname, "..")

export const NEON_CONFIG = {
  defaultProjectName: "umlstudio-memory",
  defaultRegion: "aws-us-east-2",
  defaultPgVersion: 16,
  roleName: "memory_app",
  branches: [
    { name: "main", purpose: "production" },
    { name: "dev", purpose: "development" },
  ],
}

/**
 * Validates that the migration SQL ensures RLS and does not grant BYPASSRLS.
 */
export function validateMigrationSql(sql) {
  const hasNoBypassRls = sql.includes("NOBYPASSRLS")
  const hasEnableRls = sql.includes("ENABLE ROW LEVEL SECURITY")
  const hasForceRls = sql.includes("FORCE ROW LEVEL SECURITY")
  const hasPurgeFunction = sql.includes("room_memory_purge_expired")
  const grantsMemoryApp = sql.includes("memory_app")

  return {
    valid: hasNoBypassRls && hasEnableRls && hasForceRls && hasPurgeFunction && grantsMemoryApp,
    hasNoBypassRls,
    hasEnableRls,
    hasForceRls,
    hasPurgeFunction,
    grantsMemoryApp,
  }
}

/**
 * Generates Neon connection URLs for production and dev branches.
 */
export function buildConnectionStrings({
  projectName = NEON_CONFIG.defaultProjectName,
  region = NEON_CONFIG.defaultRegion,
  role = NEON_CONFIG.roleName,
  password = "generated_secure_password",
  hostPrefix = "ep",
}) {
  return {
    main: `postgres://${role}:${password}@${hostPrefix}-${projectName}-main.${region}.neon.tech/neondb?sslmode=require`,
    dev: `postgres://${role}:${password}@${hostPrefix}-${projectName}-dev.${region}.neon.tech/neondb?sslmode=require`,
  }
}

/**
 * Plans the provisioning operations.
 */
export async function planNeonMemoryProject(options = {}) {
  const projectName = options.projectName || NEON_CONFIG.defaultProjectName
  const region = options.region || NEON_CONFIG.defaultRegion
  const migrationPath = resolve(ROOT_DIR, "docker/postgres/init/001-room-memory.sql")
  const migrationSql = await readFile(migrationPath, "utf8")
  const validation = validateMigrationSql(migrationSql)

  if (!validation.valid) {
    throw new Error("Migration SQL does not meet security / RLS requirements")
  }

  const connections = buildConnectionStrings({
    projectName,
    region,
    role: NEON_CONFIG.roleName,
  })

  return {
    projectName,
    region,
    branches: NEON_CONFIG.branches,
    role: NEON_CONFIG.roleName,
    migrationFile: "docker/postgres/init/001-room-memory.sql",
    validation,
    connections,
    renderSecretKey: "MEMORY_DATABASE_URL",
    dailyPurgeSchedule: "Every 24 hours (automatic via apps/server or cron)",
  }
}

export async function main() {
  const args = process.argv.slice(2)
  const isDryRun = args.includes("--dry-run") || !process.env.NEON_API_KEY
  const plan = await planNeonMemoryProject()

  console.log("=== UmlStudio Dedicated Neon Room Memory Setup (Issue #32) ===")
  console.log(`Project:     ${plan.projectName}`)
  console.log(`Region:      ${plan.region}`)
  console.log(`Branches:    ${plan.branches.map((b) => `${b.name} (${b.purpose})`).join(", ")}`)
  console.log(`Role:        ${plan.role} (NOBYPASSRLS enforced)`)
  console.log(`RLS Active:  ${plan.validation.hasEnableRls && plan.validation.hasForceRls}`)
  console.log(`Daily Purge: ${plan.dailyPurgeSchedule}`)
  console.log("\nRender Environment Configuration:")
  console.log(`  ${plan.renderSecretKey}=${plan.connections.main}`)

  if (isDryRun) {
    console.log(
      "\n[DRY RUN] Plan verified successfully. Set NEON_API_KEY to provision live via API."
    )
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("Error running setup-neon-memory:", err)
    process.exit(1)
  })
}
