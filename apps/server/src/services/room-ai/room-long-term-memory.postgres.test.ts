import { readFile } from "node:fs/promises"
import { GenericContainer, type StartedTestContainer } from "testcontainers"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createPostgresLongTermMemory } from "./room-long-term-memory.js"

let container: StartedTestContainer | undefined
let owner: Pool | undefined
let app: Pool | undefined
let memory: ReturnType<typeof createPostgresLongTermMemory> | undefined

async function waitForPostgres(pool: Pool): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await pool.query("SELECT 1")
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw lastError
}

async function appRows(
  diagramId: string,
  userId: string
): Promise<{ diagram_id: string; user_id: string | null }[]> {
  const client = await app!.connect()
  try {
    await client.query("BEGIN")
    await client.query(
      "SELECT set_config('app.diagram_id', $1, true), set_config('app.user_id', $2, true)",
      [diagramId, userId]
    )
    const rows = (
      await client.query("SELECT diagram_id, user_id FROM room_memory ORDER BY created_at")
    ).rows
    await client.query("COMMIT")
    return rows
  } finally {
    client.release()
  }
}

beforeAll(async () => {
  container = await new GenericContainer("postgres:17.6-alpine")
    .withEnvironment({ POSTGRES_DB: "umlstudio", POSTGRES_PASSWORD: "owner" })
    .withExposedPorts(5432)
    .start()
  const port = container.getMappedPort(5432)
  const host = container.getHost()
  owner = new Pool({ connectionString: `postgres://postgres:owner@${host}:${port}/umlstudio` })
  await waitForPostgres(owner)
  const migration = await readFile(
    new URL("../../../../../docker/postgres/init/001-room-memory.sql", import.meta.url),
    "utf8"
  )
  await owner.query(migration)
  app = new Pool({
    connectionString: `postgres://umlstudio_app:umlstudio_local_app@${host}:${port}/umlstudio`,
  })
  memory = createPostgresLongTermMemory(
    `postgres://umlstudio_app:umlstudio_local_app@${host}:${port}/umlstudio`
  )
}, 60_000)

afterAll(async () => {
  await memory?.close?.()
  await app?.end()
  await owner?.end()
  await container?.stop()
})

describe("Postgres Room AI long-term memory", () => {
  it("enforces room and user isolation through RLS even without a WHERE clause", async () => {
    await memory!.remember({
      diagramId: "room-a",
      userId: "ana",
      scope: "room",
      kind: "decision",
      title: "A",
      content: "public room A",
    })
    await memory!.remember({
      diagramId: "room-b",
      userId: "ana",
      scope: "room",
      kind: "decision",
      title: "B",
      content: "public room B",
    })
    await memory!.remember({
      diagramId: "room-a",
      userId: "juan",
      scope: "user",
      kind: "question",
      title: "private",
      content: "juan private",
    })

    await expect(appRows("room-a", "ana")).resolves.toEqual([
      { diagram_id: "room-a", user_id: null },
    ])
    await expect(appRows("room-a", "juan")).resolves.toEqual([
      { diagram_id: "room-a", user_id: null },
      { diagram_id: "room-a", user_id: "juan" },
    ])
    await expect(appRows("room-b", "ana")).resolves.toEqual([
      { diagram_id: "room-b", user_id: null },
    ])
  })

  it("upserts a topic key and ranks only the requester's visible memories", async () => {
    const first = await memory!.remember({
      diagramId: "room-upsert",
      userId: "ana",
      scope: "room",
      kind: "decision",
      topicKey: "naming",
      title: "Naming",
      content: "Use PascalCase",
    })
    const second = await memory!.remember({
      diagramId: "room-upsert",
      userId: "ana",
      scope: "room",
      kind: "decision",
      topicKey: "naming",
      title: "Naming",
      content: "Use CamelCase",
    })
    await memory!.remember({
      diagramId: "room-upsert",
      userId: "juan",
      scope: "user",
      kind: "question",
      title: "Private",
      content: "CamelCase secreto",
    })

    expect(second).toMatchObject({ id: first.id, revision: 2, content: "Use CamelCase" })
    await expect(
      memory!.recall({ diagramId: "room-upsert", userId: "ana", query: "CamelCase" })
    ).resolves.toEqual([expect.objectContaining({ content: "Use CamelCase", revision: 2 })])
    await expect(
      memory!.recall({ diagramId: "room-upsert", userId: "juan", query: "CamelCase" })
    ).resolves.toHaveLength(2)
    await expect(
      memory!.recall({
        diagramId: "room-upsert",
        userId: "juan",
        query: "CamelCase",
        scope: "room",
      })
    ).resolves.toEqual([expect.objectContaining({ content: "Use CamelCase", revision: 2 })])
  })

  it("uses a non-BYPASSRLS application role", async () => {
    const bypass = await owner!.query(
      "SELECT rolbypassrls FROM pg_roles WHERE rolname = 'umlstudio_app'"
    )
    expect(bypass.rows[0]?.rolbypassrls).toBe(false)
  })

  it("rejects a security-definer deletion target outside the transaction room", async () => {
    const client = await app!.connect()
    try {
      await client.query("BEGIN")
      await client.query(
        "SELECT set_config('app.diagram_id', $1, true), set_config('app.user_id', $2, true)",
        ["room-a", "ana"]
      )
      await expect(client.query("SELECT room_memory_forget_diagram('room-b')")).rejects.toThrow(
        "room memory deletion target"
      )
      await client.query("ROLLBACK")
    } finally {
      client.release()
    }
  })

  it("forgets an entire deleted diagram and purges expired entries", async () => {
    await memory!.remember({
      diagramId: "room-delete",
      userId: "ana",
      scope: "room",
      kind: "summary",
      title: "public",
      content: "delete me",
    })
    await memory!.remember({
      diagramId: "room-delete",
      userId: "juan",
      scope: "user",
      kind: "question",
      title: "private",
      content: "delete me too",
    })
    await memory!.forget({ diagramId: "room-delete", userId: "ana" })
    await expect(
      owner!.query("SELECT * FROM room_memory WHERE diagram_id = 'room-delete'")
    ).resolves.toMatchObject({ rowCount: 0 })

    await memory!.remember({
      diagramId: "room-expired",
      userId: "ana",
      scope: "room",
      kind: "summary",
      title: "old",
      content: "expired memory",
    })
    const client = await app!.connect()
    try {
      await client.query("BEGIN")
      await client.query(
        "SELECT set_config('app.diagram_id', $1, true), set_config('app.user_id', $2, true)",
        ["room-expired", "ana"]
      )
      await client.query("UPDATE room_memory SET updated_at = now() - interval '121 days'")
      await client.query("COMMIT")
    } finally {
      client.release()
    }
    await expect(memory!.purgeExpired()).resolves.toBe(1)
  })
})
