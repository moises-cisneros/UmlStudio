import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { createAdaptorServer, type ServerType } from "@hono/node-server"
import type { Config } from "../config.js"
import type { Redis } from "../redis.js"
import type { AppEnv } from "./env.js"
import { requestId } from "./middleware/requestId.js"
import { httpLogger } from "./middleware/logger.js"
import { configureCors } from "./middleware/cors.js"
import { ownerReader } from "./middleware/owner.js"
import { errorHandler } from "./middleware/errors.js"
import { Errors } from "./errors.js"
import { mountAuthRoutes } from "../routes/auth.js"
import { mountUserRoutes } from "../routes/users.js"
import {
  createAuthService,
  createRedisUserRepository,
  type AuthService,
} from "../services/auth-service.js"
import { getJwtSecret } from "../redis.js"
import { mountDiagramRoutes } from "../routes/diagrams.js"
import { mountVersionRoutes } from "../routes/versions.js"
import { mountConversionRoutes } from "../routes/conversion.js"
import { mountCodegenRoutes } from "../routes/codegen.js"
import { mountProductivityRoutes } from "../routes/productivity.js"
import { mountHealthRoutes } from "../routes/health.js"
import { mountEmbedApiRoutes, mountEmbedRoutes } from "../routes/embed.js"
import { ConversionResource } from "../resources/conversion-resource.js"
import { SvgPreviewCache } from "../services/svg-preview-cache.js"
import type { ControlEvent } from "../types.js"

export interface RelayHook {
  publishControl: (diagramId: string, control: ControlEvent) => void
}

export interface AppDeps {
  config: Config
  redis: Redis
  relay?: RelayHook
  autoLogging?: boolean
  conversionResource?: ConversionResource
  auth?: AuthService
}

export function buildApp(deps: AppDeps): ServerType {
  const { config, redis, relay, autoLogging = true, conversionResource, auth: providedAuth } = deps

  const app = new Hono<AppEnv>()

  app.use(
    bodyLimit({
      maxSize: config.MAX_SNAPSHOT_BYTES,
      onError: async (c) => {
        const body = c.req.raw.body
        if (body) {
          const reader = body.getReader()
          try {
            for (;;) {
              const { done } = await reader.read()
              if (done) break
            }
          } catch {
            // Drain error ignored
          }
        }
        throw Errors.bodyTooLarge()
      },
    })
  )

  app.use(requestId())
  app.use(httpLogger({ autoLogging }))
  app.use(configureCors(config))
  app.use(ownerReader({ secret: config.OWNER_SECRET }))
  app.onError(errorHandler)

  let resource: ConversionResource | undefined = conversionResource
  const getResource = (): ConversionResource => (resource ??= new ConversionResource())

  const previewCache = new SvgPreviewCache()

  // Session identity. Fail-closed: missing JWT_SECRET refuses boot.
  const auth =
    providedAuth ??
    createAuthService({
      repo: createRedisUserRepository(redis),
      jwtSecret: getJwtSecret(),
    })

  app.route("/health", mountHealthRoutes({ redis }))
  app.route("/api/auth", mountAuthRoutes({ redis, auth }))
  app.route("/api/users", mountUserRoutes({ auth }))
  app.route("/api", mountDiagramRoutes({ config, redis, auth }, relay))
  app.route("/api", mountVersionRoutes({ config, redis, auth }, relay))
  app.route("/api", mountConversionRoutes({ getResource }))
  app.route("/api", mountCodegenRoutes())
  app.route("/api", mountProductivityRoutes())
  app.route("/api", mountEmbedApiRoutes({ redis, config, getResource, previewCache }))
  app.route("/embed", mountEmbedRoutes({ redis, config, getResource, previewCache }))

  return createAdaptorServer({ fetch: app.fetch })
}
