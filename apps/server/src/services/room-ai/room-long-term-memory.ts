import { randomUUID } from "node:crypto"
import { Pool, type PoolClient } from "pg"
import type { Redis } from "../../redis.js"
import { k } from "../../redis.js"
import { logger } from "../../logger.js"

export type RoomMemoryKind = "summary" | "decision" | "proposal" | "question"
export type RoomMemoryScope = "room" | "user"

export interface RoomLongTermMemoryEntry {
  id: string
  scope: RoomMemoryScope
  kind: RoomMemoryKind
  topicKey: string | null
  userId: string | null
  title: string
  content: string
  authorId: string | null
  revision: number
  createdAt: string
  updatedAt: string
}

export interface RememberRoomMemoryInput {
  diagramId: string
  userId: string
  scope: RoomMemoryScope
  kind: RoomMemoryKind
  topicKey?: string
  title: string
  content: string
  authorId?: string
}

export interface RoomLongTermMemory {
  remember(input: RememberRoomMemoryInput): Promise<RoomLongTermMemoryEntry>
  recall(input: {
    diagramId: string
    userId: string
    query: string
    scope?: "room" | "all"
  }): Promise<RoomLongTermMemoryEntry[]>
  forget(input: { diagramId: string; userId: string }): Promise<void>
  flushPendingDeletes?(): Promise<void>
  purgeExpired(): Promise<number>
  close?(): Promise<void>
}

const MAX_TEXT = 8_000
const fallbackKey = (diagramId: string) => k.aiLongTermMemory(diagramId)

function validate(input: RememberRoomMemoryInput): void {
  if (!input.diagramId || !input.userId || !input.title.trim() || !input.content.trim()) {
    throw new Error("Invalid Room AI long-term memory entry")
  }
  if (input.title.length > 240 || input.content.length > MAX_TEXT) {
    throw new Error("Room AI long-term memory entry exceeds limits")
  }
  if (input.scope === "room" && input.authorId && input.authorId.length > 255) {
    throw new Error("Invalid Room AI long-term memory author")
  }
}

function entryUserId(input: RememberRoomMemoryInput): string | null {
  return input.scope === "user" ? input.userId : null
}

export class RoomLongTermMemoryDeletionPendingError extends Error {
  constructor() {
    super("Postgres Room AI memory deletion is pending retry")
    this.name = "RoomLongTermMemoryDeletionPendingError"
  }
}

function toEntry(row: Record<string, unknown>): RoomLongTermMemoryEntry {
  return {
    id: String(row.id),
    scope: row.scope as RoomMemoryScope,
    kind: row.kind as RoomMemoryKind,
    topicKey: typeof row.topic_key === "string" ? row.topic_key : null,
    userId: typeof row.user_id === "string" ? row.user_id : null,
    title: String(row.title),
    content: String(row.content),
    authorId: typeof row.author_id === "string" ? row.author_id : null,
    revision: Number(row.revision),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }
}

async function scoped<T>(
  pool: Pool,
  diagramId: string,
  userId: string,
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query(
      "SELECT set_config('app.diagram_id', $1, true), set_config('app.user_id', $2, true)",
      [diagramId, userId]
    )
    const result = await operation(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export function createPostgresLongTermMemory(databaseUrl: string): RoomLongTermMemory {
  const pool = new Pool({ connectionString: databaseUrl })
  return {
    async remember(input) {
      validate(input)
      return scoped(pool, input.diagramId, input.userId, async (client) => {
        const params = [
          input.diagramId,
          input.scope,
          entryUserId(input),
          input.kind,
          input.topicKey ?? null,
          input.title.trim(),
          input.content.trim(),
          input.authorId ?? null,
        ]
        const sql = input.topicKey
          ? `INSERT INTO room_memory (diagram_id, scope, user_id, kind, topic_key, title, content, author_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (diagram_id, scope, COALESCE(user_id, ''), topic_key) WHERE topic_key IS NOT NULL
             DO UPDATE SET kind=EXCLUDED.kind,title=EXCLUDED.title,content=EXCLUDED.content,author_id=EXCLUDED.author_id,revision=room_memory.revision+1,updated_at=now()
             RETURNING *`
          : "INSERT INTO room_memory (diagram_id, scope, user_id, kind, topic_key, title, content, author_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *"
        return toEntry((await client.query(sql, params)).rows[0] as Record<string, unknown>)
      })
    },
    async recall({ diagramId, userId, query, scope = "all" }) {
      if (!query.trim()) return []
      return scoped(pool, diagramId, userId, async (client) =>
        (
          await client.query(
            `SELECT * FROM room_memory WHERE search @@ websearch_to_tsquery('spanish', $1)
         ${scope === "room" ? "AND scope = 'room'" : ""}
         ORDER BY ts_rank_cd(search, websearch_to_tsquery('spanish', $1)) DESC, updated_at DESC LIMIT 3`,
            [query]
          )
        ).rows.map((row) => toEntry(row as Record<string, unknown>))
      )
    },
    async forget({ diagramId, userId }) {
      await scoped(pool, diagramId, userId, async (client) => {
        await client.query("SELECT room_memory_forget_diagram($1)", [diagramId])
      })
    },
    async purgeExpired() {
      return scoped(pool, "room-memory-maintenance", "room-memory-maintenance", async (client) =>
        Number(
          (await client.query("SELECT room_memory_purge_expired() AS deleted")).rows[0]?.deleted ??
            0
        )
      )
    },
    async close() {
      await pool.end()
    },
  }
}

export function createRedisLongTermMemory(redis: Redis, ttlSeconds: number): RoomLongTermMemory {
  async function list(diagramId: string): Promise<RoomLongTermMemoryEntry[]> {
    const raw = await redis.get(fallbackKey(diagramId))
    if (!raw) return []
    try {
      return JSON.parse(raw) as RoomLongTermMemoryEntry[]
    } catch {
      return []
    }
  }
  async function save(diagramId: string, entries: RoomLongTermMemoryEntry[]) {
    await redis.set(fallbackKey(diagramId), JSON.stringify(entries), { EX: ttlSeconds })
  }
  return {
    async remember(input) {
      validate(input)
      const entries = await list(input.diagramId)
      const now = new Date().toISOString()
      const entryUser = entryUserId(input)
      const index = input.topicKey
        ? entries.findIndex(
            (entry) =>
              entry.scope === input.scope &&
              entry.userId === entryUser &&
              entry.topicKey === input.topicKey
          )
        : -1
      const previous = entries[index]
      const entry: RoomLongTermMemoryEntry = {
        id: previous?.id ?? randomUUID(),
        scope: input.scope,
        kind: input.kind,
        topicKey: input.topicKey ?? null,
        userId: entryUser,
        title: input.title.trim(),
        content: input.content.trim(),
        authorId: input.authorId ?? null,
        revision: (previous?.revision ?? 0) + 1,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      }
      if (index >= 0) entries[index] = entry
      else entries.push(entry)
      await save(input.diagramId, entries)
      return entry
    },
    async recall({ diagramId, userId, query, scope = "all" }) {
      const terms = query.toLocaleLowerCase("es").split(/\s+/).filter(Boolean)
      return (await list(diagramId))
        .filter((entry) => entry.scope === "room" || (scope === "all" && entry.userId === userId))
        .map((entry) => ({
          entry,
          score: terms.reduce(
            (n, term) =>
              n + Number(`${entry.title} ${entry.content}`.toLocaleLowerCase("es").includes(term)),
            0
          ),
        }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(({ entry }) => entry)
    },
    async forget({ diagramId }) {
      await redis.del(fallbackKey(diagramId))
    },
    async purgeExpired() {
      return 0
    },
  }
}

export function createLongTermMemory(options: {
  mode: "redis" | "postgres"
  databaseUrl?: string
  redis: Redis
  ttlSeconds: number
}): RoomLongTermMemory {
  const fallback = createRedisLongTermMemory(options.redis, options.ttlSeconds)
  if (options.mode !== "postgres" || !options.databaseUrl) return fallback
  const primary = createPostgresLongTermMemory(options.databaseUrl)
  const withFallback = async <T>(
    operation: (memory: RoomLongTermMemory) => Promise<T>
  ): Promise<T> => {
    try {
      return await operation(primary)
    } catch (err) {
      const code = typeof err === "object" && err && "code" in err ? String(err.code) : ""
      if (!/^(08|57P01|ECONNREFUSED|ETIMEDOUT)/.test(code)) throw err
      logger.warn(
        { err, event: "room_ai.long_term_memory.fallback" },
        "Postgres Room AI memory unavailable; using Redis fallback"
      )
      return operation(fallback)
    }
  }
  return {
    remember: (input) => withFallback((memory) => memory.remember(input)),
    recall: (input) => withFallback((memory) => memory.recall(input)),
    async forget(input) {
      try {
        await primary.forget(input)
      } catch (err) {
        const code = typeof err === "object" && err && "code" in err ? String(err.code) : ""
        if (!/^(08|57P01|ECONNREFUSED|ETIMEDOUT)/.test(code)) throw err
        await fallback.forget(input)
        await options.redis.hSet(k.aiLongTermMemoryPendingDeletes, input.diagramId, input.userId)
        logger.warn(
          { err, event: "room_ai.long_term_memory.delete_pending", diagramId: input.diagramId },
          "Postgres Room AI memory deletion is pending retry"
        )
        throw new RoomLongTermMemoryDeletionPendingError()
      }
      await fallback.forget(input)
      await options.redis.hDel(k.aiLongTermMemoryPendingDeletes, input.diagramId)
    },
    async flushPendingDeletes() {
      const pending = await options.redis.hGetAll(k.aiLongTermMemoryPendingDeletes)
      for (const [diagramId, userId] of Object.entries(pending)) {
        try {
          await primary.forget({ diagramId, userId })
          await fallback.forget({ diagramId, userId })
          await options.redis.hDel(k.aiLongTermMemoryPendingDeletes, diagramId)
        } catch (err) {
          logger.warn(
            { err, event: "room_ai.long_term_memory.delete_retry_failed", diagramId },
            "Postgres Room AI memory deletion retry failed"
          )
        }
      }
    },
    purgeExpired: () => withFallback((memory) => memory.purgeExpired()),
    close: async () => {
      await primary.close?.()
    },
  }
}
