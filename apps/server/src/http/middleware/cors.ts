import { cors } from "hono/cors"
import type { Config } from "../../config.js"

export function configureCors(config: Config) {
  const allowedOrigins = config.CORS_ORIGIN
    ? config.CORS_ORIGIN.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    : []
  return cors({
    origin: allowedOrigins,
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization", "If-Match", "If-None-Match"],
    exposeHeaders: ["x-owner-match", "x-request-id", "etag"],
  })
}
