import { Hono } from "hono"
import { randomBytes } from "node:crypto"
import type { Config } from "../config.js"
import type { AppEnv } from "../http/env.js"
import { k, type Redis } from "../redis.js"
import type { Diagram } from "../types.js"
import type { RelayHook } from "../http/app.js"
import { Errors } from "../http/errors.js"
import { validate } from "../http/middleware/validate.js"
import { setOwnerCookie } from "../http/middleware/owner.js"
import { logger } from "../logger.js"
import { tryAutoVersion } from "../services/autoVersion.js"
import { authGuard } from "../http/middleware/auth.js"
import type { AuthService } from "../services/auth-service.js"
import { DiagramBody, DiagramIdParams, PutDiagramBody, PatchDiagramBody } from "./_schemas.js"

interface Deps {
  config: Config
  redis: Redis
  auth?: AuthService
}

/** Returns the current HEAD diagram or null if missing. */
export async function readDiagram(redis: Redis, id: string): Promise<Diagram | null> {
  const result = (await redis.json.get(k.diagram(id), { path: "$" })) as Diagram[] | null
  if (!result || !Array.isArray(result) || result.length === 0) return null
  return (result[0] as Diagram | undefined) ?? null
}

const TTL_REFRESH_THROTTLE_SECONDS = 24 * 3600

export async function refreshDiagramTtl(
  redis: Redis,
  fullTtlSeconds: number,
  id: string,
  knownTtlSeconds?: number
): Promise<void> {
  try {
    const ttl = knownTtlSeconds ?? (await redis.ttl(k.diagram(id)))
    if (ttl < 0 || ttl >= fullTtlSeconds - TTL_REFRESH_THROTTLE_SECONDS) return
    const multi = redis.multi()
    multi.expire(k.diagram(id), fullTtlSeconds)
    multi.expire(k.diagramMeta(id), fullTtlSeconds)
    await multi.exec()
  } catch (err) {
    logger.warn({ err, diagramId: id }, "diagram TTL refresh failed")
  }
}

/** Atomically writes HEAD, bumps headRev, updates updatedAt, and bumps TTLs. */
export async function saveHead(
  redis: Redis,
  config: Config,
  diagram: Diagram
): Promise<{ headRev: number; updatedAt: string }> {
  const updatedAt = new Date().toISOString()
  const persisted = { ...diagram, updatedAt }
  const ttl = config.DIAGRAM_TTL_SECONDS
  const head = k.diagram(diagram.id)
  const meta = k.diagramMeta(diagram.id)

  const multi = redis.multi()
  multi.json.set(head, "$", persisted as never)
  multi.expire(head, ttl)
  multi.hSet(meta, {
    title: diagram.title,
    type: diagram.type,
    updatedAt,
    librarySchemaVersion: diagram.version,
    ...(diagram.userId ? { userId: diagram.userId } : {}),
  })
  if (diagram.userId) {
    multi.sAdd(k.userDiagrams(diagram.userId), diagram.id)
  }
  multi.hIncrBy(meta, "headRev", 1)
  multi.expire(meta, ttl)
  const replies = (await multi.exec()) as unknown[]

  for (const reply of replies) {
    if (reply instanceof Error) throw reply
  }
  const headRev = Number(replies[3] ?? 0)
  if (!Number.isFinite(headRev)) {
    throw new Error(`saveHead: hIncrBy returned non-numeric reply: ${String(replies[3])}`)
  }
  return { headRev, updatedAt }
}

/** Cascade-deletes the diagram and its entire version family. */
export async function cascadeDeleteDiagram(redis: Redis, id: string): Promise<number> {
  const meta = await redis.hGetAll(k.diagramMeta(id))
  if (meta?.userId) {
    await redis.sRem(k.userDiagrams(meta.userId), id)
  }
  let deleted = 0
  const pattern = `diagram:{${id}}*`
  for await (const keys of redis.scanIterator({
    MATCH: pattern,
    COUNT: 200,
  })) {
    if (keys.length > 0) {
      deleted += (await redis.del(keys)) ?? 0
    }
  }
  return deleted
}

function generateDiagramId(): string {
  return randomBytes(16)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function mountDiagramRoutes({ config, redis, auth }: Deps, relay?: RelayHook): Hono<AppEnv> {
  const router = new Hono<AppEnv>()

  if (auth) {
    router.use("/diagrams", authGuard({ auth }))
    router.use("/user/diagrams", authGuard({ auth }))

    router.get("/user/diagrams", async (c) => {
      const user = c.get("user")
      if (!user) throw Errors.unauthorized()
      const diagramIds = await redis.sMembers(k.userDiagrams(user.id))
      const list = []
      for (const id of diagramIds) {
        const meta = await redis.hGetAll(k.diagramMeta(id))
        if (meta && Object.keys(meta).length > 0) {
          list.push({
            id,
            title: meta.title ?? "",
            type: meta.type ?? "ClassDiagram",
            updatedAt: meta.updatedAt ?? "",
            version: meta.librarySchemaVersion ?? "4.0.0",
          })
        }
      }
      return c.json(list, 200)
    })
  }

  router.post(
    "/diagrams",
    validate({ body: DiagramBody.omit({ id: true }).partial() }, async (c, { body }) => {
      const user = c.get("user")
      if (!user && auth) throw Errors.unauthorized()
      const id = generateDiagramId()
      const now = new Date().toISOString()
      const diagram: Diagram = {
        id,
        version: body.version ?? "4.0.0",
        title: body.title ?? "",
        type: (body.type as Diagram["type"]) ?? "ClassDiagram",
        nodes: (body.nodes ?? []) as Diagram["nodes"],
        edges: (body.edges ?? []) as Diagram["edges"],
        assessments: (body.assessments ?? {}) as Diagram["assessments"],
        ...(user?.id ? { userId: user.id } : {}),
        createdAt: now,
        updatedAt: now,
      }
      await saveHead(redis, config, diagram)
      setOwnerCookie(c, id, config.OWNER_SECRET)
      return c.json(diagram, 201)
    })
  )

  router.get(
    "/diagrams/:diagramId",
    validate({ params: DiagramIdParams }, async (c, { params }) => {
      const diagram = await readDiagram(redis, params.diagramId)
      if (!diagram) throw Errors.notFound("diagram not found")
      await refreshDiagramTtl(redis, config.DIAGRAM_TTL_SECONDS, params.diagramId)
      return c.json(diagram, 200)
    })
  )

  router.put(
    "/diagrams/:diagramId",
    validate({ params: DiagramIdParams, body: PutDiagramBody }, async (c, { params, body }) => {
      const existing = await readDiagram(redis, params.diagramId)

      const ifMatch = c.req.header("if-match")
      if (ifMatch && existing) {
        const headRevStr = await redis.hGet(k.diagramMeta(params.diagramId), "headRev")
        const currentHeadRev = headRevStr ? Number(headRevStr) : 0
        const sent = Number(ifMatch.replace(/^"|"$/g, ""))
        if (Number.isFinite(sent) && sent !== currentHeadRev) {
          throw Errors.revisionMismatch(currentHeadRev)
        }
      }

      const merged: Diagram = {
        id: params.diagramId,
        version: body.version,
        title: body.title,
        type: body.type as Diagram["type"],
        nodes: body.nodes as Diagram["nodes"],
        edges: body.edges as Diagram["edges"],
        assessments: body.assessments as Diagram["assessments"],
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const { headRev, updatedAt } = await saveHead(redis, config, merged)

      if (!c.get("isOwner")) {
        setOwnerCookie(c, params.diagramId, config.OWNER_SECRET)
      }

      void tryAutoVersion({ config, redis, relay }, params.diagramId, merged).catch((err) => {
        logger.error(
          { err, diagramId: params.diagramId, event: "version.auto.failed" },
          "auto-version failed"
        )
      })

      c.header("etag", `"${headRev}"`)
      return c.json({ headRev, updatedAt }, 200)
    })
  )

  router.patch(
    "/diagrams/:diagramId",
    validate({ params: DiagramIdParams, body: PatchDiagramBody }, async (c, { params, body }) => {
      const existing = await readDiagram(redis, params.diagramId)
      if (!existing) throw Errors.notFound("diagram not found")

      const updatedAt = new Date().toISOString()
      const merged: Diagram = {
        ...existing,
        title: body.title,
        updatedAt,
      }

      const { headRev } = await saveHead(redis, config, merged)

      if (!c.get("isOwner")) {
        setOwnerCookie(c, params.diagramId, config.OWNER_SECRET)
      }

      relay?.publishControl(params.diagramId, {
        type: "DIAGRAM_RENAMED",
        title: body.title,
      })

      logger.info(
        {
          event: "diagram.renamed",
          diagramId: params.diagramId,
          title: body.title,
          headRev,
        },
        "diagram renamed"
      )

      return c.json(
        {
          id: params.diagramId,
          title: body.title,
          headRev,
          updatedAt,
        },
        200
      )
    })
  )

  router.delete(
    "/diagrams/:diagramId",
    validate({ params: DiagramIdParams }, async (c, { params }) => {
      const deleted = await cascadeDeleteDiagram(redis, params.diagramId)
      relay?.publishControl(params.diagramId, { type: "DIAGRAM_DELETED" })
      logger.info(
        {
          event: "diagram.deleted",
          diagramId: params.diagramId,
          deletedKeys: deleted,
        },
        "diagram deleted"
      )
      return c.body(null, 204)
    })
  )

  return router
}
