import { createMiddleware } from "hono/factory"
import type { AppEnv } from "../env.js"
import { logger } from "../../logger.js"

interface HttpLoggerOptions {
  autoLogging?: boolean
}

export function httpLogger({ autoLogging = true }: HttpLoggerOptions = {}) {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (!autoLogging) {
      await next()
      return
    }
    const start = Date.now()
    await next()
    const responseTime = Date.now() - start
    logger.info(
      {
        req: {
          method: c.req.method,
          url: c.req.path,
          headers: Object.fromEntries(c.req.raw.headers),
        },
        res: {
          statusCode: c.res.status,
          headers: Object.fromEntries(c.res.headers),
        },
        responseTime,
        requestId: c.get("requestId"),
      },
      "request completed"
    )
  })
}
