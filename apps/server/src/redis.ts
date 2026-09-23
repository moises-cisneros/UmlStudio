import { createClient } from "redis"
import { gzipSync, gunzipSync } from "node:zlib"
import { logger } from "./logger.js"

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export function createRedisClient(url: string) {
  const client = createClient({ url, RESP: 2 })
  client.on("error", (err) => logger.error({ err }, "redis client error"))
  return client
}

export type Redis = ReturnType<typeof createRedisClient>

export const k = {
  diagram: (id: string) => `diagram:{${id}}`,
  diagramMeta: (id: string) => `diagram:{${id}}:meta`,
  versionsIndex: (id: string) => `diagram:{${id}}:versions`,
  versionBody: (id: string, vid: string) => `diagram:{${id}}:version:${vid}`,
  versionMeta: (id: string, vid: string) => `diagram:{${id}}:version:${vid}:meta`,
  autoVersionMarker: (id: string) => `diagram:{${id}}:auto-version-marker`,
  authUser: (id: string) => `auth:user:{${id}}`,
  authUserByEmail: (email: string) => `auth:user:email:${email.toLowerCase()}`,
  authRefresh: (jti: string) => `auth:refresh:${jti}`,
  userDiagrams: (userId: string) => `auth:user:{${userId}}:diagrams`,
}

/** Default refresh-session lifetime: 7 days (open question in design). */
export const REFRESH_TTL_SECONDS = 7 * 24 * 3600

/**
 * Fail-closed signing-secret loader The JWT secret MUST come from
 * the environment — there is intentionally no default. Throws when missing
 * or blank so the service refuses to boot instead of signing with a weak key.
 */
export function getJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.JWT_SECRET
  if (!secret || secret.trim().length === 0) {
    throw new Error("JWT_SECRET is not set. Set JWT_SECRET to a high-entropy value before booting.")
  }
  return secret
}

/** Persists a refresh session: jti -> userId with TTL. */
export async function saveRefreshSession(
  client: Redis,
  jti: string,
  userId: string,
  ttlSec: number = REFRESH_TTL_SECONDS
): Promise<void> {
  await client.set(k.authRefresh(jti), userId, { EX: ttlSec })
}

/**
 * Atomically consumes a refresh session (GET + DEL) for rotation. Returns
 * the bound userId, or null when expired, revoked, or never issued.
 */
export async function consumeRefreshSession(client: Redis, jti: string): Promise<string | null> {
  const multi = client.multi()
  multi.get(k.authRefresh(jti))
  multi.del(k.authRefresh(jti))
  const replies = (await multi.exec()) as unknown[]
  const userId = replies[0]
  return typeof userId === "string" ? userId : null
}

/** Revokes a refresh session immediately (logout). Idempotent. */
export async function revokeRefreshSession(client: Redis, jti: string): Promise<void> {
  await client.del(k.authRefresh(jti))
}

/** Returns gzip-then-base64-encoded JSON as a string. */
export function gzipJson(value: unknown): string {
  return gzipSync(Buffer.from(JSON.stringify(value), "utf8")).toString("base64")
}

/** Decompresses a base64-encoded gzipped JSON string back to an object. */
export function gunzipJson<T>(s: string): T {
  return JSON.parse(gunzipSync(Buffer.from(s, "base64")).toString("utf8")) as T
}

export const COMMIT_VERSION_SOURCE = `#!lua name=umlstudio

-- Eviction priority:
--   1. First evicted: raw unnamed autosaves — kind='auto', name='', desc=''.
--      These are background recovery infrastructure; the user never asked for
--      them explicitly.
--   2. Protected: any version the user explicitly saved (kind='user') OR that
--      has a non-empty name / description. A user-initiated save is a
--      deliberate milestone regardless of whether a description was written.
--   3. Last resort: if the cap is hit entirely by protected rows, evict the
--      oldest protected ones too.
--
-- Returns parallel arrays: { evictedIds[], evictedKinds[] } where each kind
-- is 'unnamed' (disposable autosave) or 'named' (user cared, evicted only
-- because cap was exhausted by protected rows). The client uses this to show
-- a truthful toast instead of always claiming "autosave removed".
local function evict_with_priority(versionsKey, headKey, count, maxV)
  local need = count - maxV
  if need <= 0 then return { {}, {} } end

  local all = redis.call('ZRANGE', versionsKey, 0, -1)  -- oldest-first
  local evictedIds = {}
  local evictedKinds = {}
  local protectedQueue = {}

  -- First pass: drop unnamed auto-snapshots oldest-first up to need.
  for _, vid in ipairs(all) do
    local metaKey = headKey .. ':version:' .. vid .. ':meta'
    local meta = redis.call('HMGET', metaKey, 'name', 'description', 'kind')
    local name = meta[1] or ''
    local desc = meta[2] or ''
    local kind = meta[3] or 'auto'
    if name == '' and desc == '' and kind ~= 'user' then
      if #evictedIds < need then
        redis.call('DEL', headKey .. ':version:' .. vid)
        redis.call('DEL', metaKey)
        redis.call('ZREM', versionsKey, vid)
        table.insert(evictedIds, vid)
        table.insert(evictedKinds, 'unnamed')
      end
    else
      table.insert(protectedQueue, vid)
    end
  end

  -- Second pass: fall back to the oldest protected (named) rows when the
  -- unnamed pool was exhausted. In normal operation this branch is not
  -- taken — the cap is sized so unnamed autosaves alone cover churn.
  if #evictedIds < need then
    for _, vid in ipairs(protectedQueue) do
      if #evictedIds >= need then break end
      redis.call('DEL', headKey .. ':version:' .. vid)
      redis.call('DEL', headKey .. ':version:' .. vid .. ':meta')
      redis.call('ZREM', versionsKey, vid)
      table.insert(evictedIds, vid)
      table.insert(evictedKinds, 'named')
    end
  end

  return { evictedIds, evictedKinds }
end

local function commit_snapshot(keys, args)
  -- keys[1] = diagram:{id}
  -- keys[2] = diagram:{id}:versions
  -- keys[3] = diagram:{id}:meta
  --
  -- args[1] = vid (ULID)
  -- args[2] = nowMs
  -- args[3] = ttlSec
  -- args[4] = maxVersions
  -- args[5] = name
  -- args[6] = description
  -- args[7] = kind ('user' | 'auto')
  -- args[8] = librarySchemaVersion
  -- args[9] = gzipBody (base64 string)
  -- args[10] = author (server-resolved verified user id; '' when anonymous)

  if redis.call('EXISTS', keys[1]) == 0 then
    return redis.error_reply('NO_HEAD')
  end

  local vid = args[1]
  local vKey = keys[1] .. ':version:' .. vid
  local vMetaKey = vKey .. ':meta'
  local ttl = tonumber(args[3])

  -- Monotonic per-diagram counter. Survives eviction — used as the
  -- displayed "#N" so the user sees their absolute creation rank, not
  -- the rank-among-currently-stored. HINCRBY auto-creates the field
  -- starting at 1 on the first commit.
  local seq = redis.call('HINCRBY', keys[3], 'versionSeq', 1)

  redis.call('SET', vKey, args[9], 'EX', ttl)
  redis.call('HSET', vMetaKey,
    'name', args[5],
    'description', args[6],
    'createdAt', args[2],
    'kind', args[7],
    'librarySchemaVersion', args[8],
    'author', args[10],
    'seq', tostring(seq))
  redis.call('EXPIRE', vMetaKey, ttl)

  redis.call('ZADD', keys[2], args[2], vid)
  redis.call('EXPIRE', keys[2], ttl)

  local count = redis.call('ZCARD', keys[2])
  local maxV = tonumber(args[4])
  local evictResult = evict_with_priority(keys[2], keys[1], count, maxV)

  return { vid, evictResult[1], evictResult[2], tostring(seq) }
end

-- Truly atomic restore: writes the auto-snapshot + flips HEAD + bumps
-- headRev in one Lua transaction so a concurrent autosave can never observe
-- a torn state (auto-snapshot saved but HEAD not yet rolled, or vice versa).
-- HEAD is a gzip+base64 string (see gzipJson): Lua has no gunzip, so the
-- caller passes both bodies pre-encoded —
--   - args[8] is the gzipped+base64 pre-restore body (auto-snapshot wire form)
--   - args[10] is the gzipped+base64 restored HEAD body, pre-encoded by TS
--     from the source version (plain SET/GET storage, no RedisJSON needed).
local function restore_version(keys, args)
  -- keys[1] = diagram:{id}
  -- keys[2] = diagram:{id}:versions
  -- keys[3] = diagram:{id}:meta
  --
  -- args[1]  = autoVid (ULID for the new auto-snapshot)
  -- args[2]  = nowMs
  -- args[3]  = ttlSec for the version family
  -- args[4]  = ttlSecHead for HEAD
  -- args[5]  = maxVersions (FIFO cap)
  -- args[6]  = autoName (e.g. "Auto-saved before restoring 'X'")
  -- args[7]  = librarySchemaVersion of the auto-snapshot
  -- args[8]  = preRestoreGzipBody (base64-gzipped JSON)
  -- args[9]  = restoreFromVid (verified for safety)
  -- args[10] = headGzipBody (base64-gzipped JSON, pre-encoded by TS)
  -- args[11] = author (server-resolved verified user id; '' when anonymous)

  if redis.call('EXISTS', keys[1]) == 0 then
    return redis.error_reply('NO_HEAD')
  end
  local sourceKey = keys[1] .. ':version:' .. args[9]
  if redis.call('EXISTS', sourceKey) == 0 then
    return redis.error_reply('NO_VERSION_BODY')
  end

  local autoVid = args[1]
  local autoKey = keys[1] .. ':version:' .. autoVid
  local autoMeta = autoKey .. ':meta'
  local ttl = tonumber(args[3])

  -- Pre-restore snapshot keeps a non-empty name (passed in args[6]) so it
  -- counts as protected — eviction won't sweep it the way it sweeps raw
  -- autosaves. The name is auto-generated server-side: "Before restoring
  -- '<X>'", giving the user a self-explanatory recovery anchor.
  --
  -- Order: HEAD swap goes first, then the auto-snapshot is committed and
  -- eviction runs. Lua does not roll back side effects of earlier
  -- redis.call's, so if the HEAD write fails (OOM, malformed input)
  -- we want to abort BEFORE eviction has destroyed older rows. Doing
  -- eviction first risks losing named milestones to a HEAD-write that
  -- never lands.
  local ttlHead = tonumber(args[4])
  redis.call('SET', keys[1], args[10])
  redis.call('EXPIRE', keys[1], ttlHead)
  redis.call('HSET', keys[3], 'updatedAt', args[2])
  local newRev = redis.call('HINCRBY', keys[3], 'headRev', 1)
  redis.call('EXPIRE', keys[3], ttlHead)

  local autoSeq = redis.call('HINCRBY', keys[3], 'versionSeq', 1)
  redis.call('SET', autoKey, args[8], 'EX', ttl)
  redis.call('HSET', autoMeta,
    'name', args[6],
    'description', '',
    'createdAt', args[2],
    'kind', 'auto',
    'librarySchemaVersion', args[7],
    'author', args[11],
    'seq', tostring(autoSeq))
  redis.call('EXPIRE', autoMeta, ttl)
  redis.call('ZADD', keys[2], args[2], autoVid)
  redis.call('EXPIRE', keys[2], ttl)

  local count = redis.call('ZCARD', keys[2])
  local maxV = tonumber(args[5])
  local evictResult = evict_with_priority(keys[2], keys[1], count, maxV)
  local evicted = evictResult[1]

  return { autoVid, tostring(newRev), evicted }
end

-- Stable cursor pagination. Returns ULIDs newest-first whose (score, member)
-- is strictly less than the supplied cursor pair. ULIDs are monotonic with
-- score, so ties are broken by member-lex DESC. Without this, callers that
-- write multiple snapshots in the same millisecond would lose rows on the
-- next page (an exclusive score boundary drops every member at that score).
local function list_versions_before(keys, args)
  -- keys[1] = diagram:{id}:versions
  --
  -- args[1] = beforeScore (number-as-string; '+inf' means no cursor)
  -- args[2] = beforeMember (ULID; '' when no cursor)
  -- args[3] = limit (string-encoded int)

  local limit = tonumber(args[3])
  local beforeScore = args[1]
  local beforeMember = args[2]

  local raw
  if beforeScore == '+inf' then
    raw = redis.call('ZRANGE', keys[1], '+inf', '-inf',
      'BYSCORE', 'REV', 'WITHSCORES', 'LIMIT', '0', tostring(limit + 1))
  else
    raw = redis.call('ZRANGE', keys[1],
      '(' .. beforeScore, '-inf',
      'BYSCORE', 'REV', 'WITHSCORES', 'LIMIT', '0', tostring(limit + 1))
  end

  -- raw is interleaved [member, score, member, score, ...]; rebuild as pairs.
  local pairs_out = {}
  for i = 1, #raw, 2 do
    table.insert(pairs_out, { raw[i], raw[i + 1] })
  end

  -- If a cursor was supplied at score X, also include rows at score X but
  -- with member-lex < beforeMember (the BYSCORE exclusive boundary skipped
  -- them). Walk the same-score band with ZRANGEBYLEX limited to (-, before).
  if beforeScore ~= '+inf' and beforeMember ~= '' then
    local sameScore = redis.call('ZRANGEBYSCORE', keys[1],
      beforeScore, beforeScore, 'LIMIT', '0', '1000')
    for _, m in ipairs(sameScore) do
      if m < beforeMember then
        table.insert(pairs_out, 1, { m, beforeScore })
      end
    end
    -- Re-sort newest-first (score desc, member desc) and trim.
    table.sort(pairs_out, function(a, b)
      if a[2] == b[2] then return a[1] > b[1] end
      return tonumber(a[2]) > tonumber(b[2])
    end)
  end

  -- Truncate to limit + 1 (caller uses the +1 to derive nextCursor).
  local out = {}
  for i = 1, math.min(#pairs_out, limit + 1) do
    table.insert(out, pairs_out[i][1])
  end
  return out
end

redis.register_function{
  function_name = 'commit_snapshot',
  callback = commit_snapshot
}

redis.register_function{
  function_name = 'restore_version',
  callback = restore_version
}

redis.register_function{
  function_name = 'list_versions_before',
  callback = list_versions_before,
  flags = { 'no-writes' }
}
`

/**
 * Load the umlstudio Lua function library at boot. Idempotent — `REPLACE`
 * upgrades existing definitions. Diagram HEADs are plain gzip+base64 strings,
 * so the RedisJSON module is NOT required; its presence is only logged for
 * diagnostics. Never throws for a missing module.
 */
export async function bootLoadFunction(client: Redis): Promise<void> {
  try {
    const modules = (await client.sendCommand(["MODULE", "LIST"])) as unknown
    if (Array.isArray(modules)) {
      const reJson = modules.find((m: unknown) => {
        if (!Array.isArray(m)) return false
        const nameIndex = m.findIndex((x) => x === "name")
        return nameIndex >= 0 && m[nameIndex + 1] === "ReJSON"
      })
      if (!reJson) {
        logger.warn("RedisJSON module check: ReJSON not found in MODULE LIST")
      }
    }
  } catch (err) {
    logger.info(
      { reason: (err as Error).message },
      "MODULE LIST restricted by ACL in managed Redis, bypassing preflight"
    )
  }

  try {
    await client.sendCommand(["FUNCTION", "DELETE", "apollon"])
  } catch {
    // Ignore error if legacy function does not exist
  }

  try {
    await client.sendCommand(["FUNCTION", "LOAD", "REPLACE", COMMIT_VERSION_SOURCE])
    logger.info({ event: "redis.function.loaded", lib: "umlstudio" })
  } catch (err) {
    logger.warn(
      { event: "redis.function.load_warning", err: (err as Error).message },
      "FUNCTION LOAD not permitted or failed; falling back to client-side logic if applicable"
    )
  }
}

/**
 * FCALL wrapper that surfaces application-level Redis errors as JS errors with
 * a normalized `code` field. Callers match on `err.code`.
 */
export class RedisAppError extends Error {
  constructor(
    public readonly code: string,
    message?: string
  ) {
    super(message ?? code)
    this.name = "RedisAppError"
  }
}

export async function fcall(
  client: Redis,
  fnName: string,
  keys: string[],
  args: string[]
): Promise<unknown> {
  try {
    return await client.sendCommand(["FCALL", fnName, String(keys.length), ...keys, ...args])
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const match = message.match(/(NO_HEAD|NO_VERSION_BODY)/)
    if (match) {
      throw new RedisAppError(match[1] ?? "FCALL_ERROR", message)
    }
    throw err
  }
}
