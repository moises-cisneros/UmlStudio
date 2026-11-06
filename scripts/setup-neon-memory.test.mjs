import { describe, expect, it } from "vitest"
import {
  buildConnectionStrings,
  planNeonMemoryProject,
  validateMigrationSql,
  NEON_CONFIG,
} from "./setup-neon-memory.mjs"

describe("setup-neon-memory (Issue #32 / Backlog E5-05)", () => {
  it("validates that migration SQL enforces RLS and NOBYPASSRLS for memory_app", () => {
    const validSql = `
      CREATE ROLE memory_app LOGIN NOSUPERUSER NOBYPASSRLS;
      ALTER TABLE room_memory ENABLE ROW LEVEL SECURITY;
      ALTER TABLE room_memory FORCE ROW LEVEL SECURITY;
      GRANT SELECT, INSERT, UPDATE, DELETE ON room_memory TO memory_app;
      CREATE FUNCTION room_memory_purge_expired() RETURNS integer ...
    `
    const res = validateMigrationSql(validSql)
    expect(res.valid).toBe(true)
    expect(res.hasNoBypassRls).toBe(true)
    expect(res.hasEnableRls).toBe(true)
    expect(res.hasForceRls).toBe(true)
    expect(res.hasPurgeFunction).toBe(true)
    expect(res.grantsMemoryApp).toBe(true)
  })

  it("fails validation if NOBYPASSRLS or FORCE RLS is missing", () => {
    const invalidSql = `
      CREATE ROLE memory_app LOGIN NOSUPERUSER BYPASSRLS;
      CREATE TABLE room_memory (...);
    `
    const res = validateMigrationSql(invalidSql)
    expect(res.valid).toBe(false)
    expect(res.hasNoBypassRls).toBe(false)
  })

  it("generates isolated connection strings for main and dev branches", () => {
    const conns = buildConnectionStrings({
      projectName: "umlstudio-memory",
      region: "aws-us-east-2",
      role: "memory_app",
      password: "secret_password",
    })

    expect(conns.main).toContain("umlstudio-memory-main")
    expect(conns.dev).toContain("umlstudio-memory-dev")
    expect(conns.main).not.toEqual(conns.dev)
    expect(conns.main).toContain("sslmode=require")
    expect(conns.dev).toContain("sslmode=require")
  })

  it("plans Neon memory project with actual repository migration file", async () => {
    const plan = await planNeonMemoryProject()
    expect(plan.projectName).toBe(NEON_CONFIG.defaultProjectName)
    expect(plan.branches.map((b) => b.name)).toEqual(["main", "dev"])
    expect(plan.role).toBe("memory_app")
    expect(plan.validation.valid).toBe(true)
    expect(plan.renderSecretKey).toBe("MEMORY_DATABASE_URL")
  })
})
