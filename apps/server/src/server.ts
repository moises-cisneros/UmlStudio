import { loadConfig } from "./config.js"
import { logger } from "./logger.js"
import { buildApp } from "./http/app.js"
import { bootLoadFunction, createRedisClient, getJwtSecret } from "./redis.js"
import { startRelayServer } from "./ws.js"
import { createAuthService, createRedisUserRepository } from "./services/auth-service.js"
import { seedDefaultUsers } from "./auth/seed.js"

async function main() {
  if (process.env.NODE_ENV !== "production") {
    process.env.JWT_SECRET ||= "umlstudio-development-jwt-secret-min-32-chars-2026!"
  }
  const config = loadConfig()

  const redis = createRedisClient(config.REDIS_URL)
  await redis.connect()
  logger.info({ event: "redis.connected" }, "redis connected")
  await bootLoadFunction(redis)

  redis.on("ready", () => {
    bootLoadFunction(redis).catch((err) =>
      logger.error({ err }, "function library re-load on reconnect failed")
    )
  })

  const userRepo = createRedisUserRepository(redis)
  const auth = createAuthService({
    repo: userRepo,
    jwtSecret: getJwtSecret(),
  })

  // Idempotently seed default user accounts (credentials)
  await seedDefaultUsers(auth, userRepo)

  const sharedPort =
    config.WS_PORT === config.PORT ||
    (process.env.NODE_ENV === "production" && !process.env.WS_PORT)

  let relay: import("./ws.js").RelayServer
  let httpServer: ReturnType<ReturnType<typeof buildApp>["listen"]>

  if (sharedPort) {
    const relayPublish = {
      publishControl: (diagramId: string, control: import("./types.js").ControlEvent) => {
        relay?.publishControl(diagramId, control)
      },
    }
    const app = buildApp({ config, redis, relay: relayPublish, auth })
    httpServer = app.listen(config.PORT, config.HOST, () => {
      logger.info(
        { event: "http.listen", host: config.HOST, port: config.PORT },
        "http server listening (single port HTTP + WS)"
      )
    })
    relay = startRelayServer({
      server: httpServer as import("http").Server,
      verifyToken: (token) => auth.verifyAccess(token).then((v) => v.userId),
    })
  } else {
    relay = startRelayServer({
      port: config.WS_PORT,
      host: config.HOST,
      verifyToken: (token) => auth.verifyAccess(token).then((v) => v.userId),
    })
    const app = buildApp({ config, redis, relay, auth })
    httpServer = app.listen(config.PORT, config.HOST, () => {
      logger.info(
        { event: "http.listen", host: config.HOST, port: config.PORT },
        "http server listening"
      )
    })
  }

  const shutdown = async (signal: string) => {
    logger.info({ event: "shutdown.begin", signal }, "shutdown")
    try {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()))
      })
    } catch (err) {
      logger.error({ err }, "http server close failed")
    }
    try {
      await relay.close()
    } catch (err) {
      logger.error({ err }, "ws close failed")
    }
    try {
      await redis.quit()
    } catch (err) {
      logger.error({ err }, "redis quit failed")
    }
    logger.info({ event: "shutdown.complete" })
    process.exit(0)
  }
  process.on("SIGINT", () => void shutdown("SIGINT"))
  process.on("SIGTERM", () => void shutdown("SIGTERM"))
}

main().catch((err) => {
  logger.error({ err }, "fatal startup error")
  process.exit(1)
})
