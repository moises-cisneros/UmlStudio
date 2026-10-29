import { loadConfig } from "./config.js"
import { logger } from "./logger.js"
import { buildApp } from "./http/app.js"
import { bootLoadFunction, createRedisClient, getJwtSecret } from "./redis.js"
import { startRelayServer, type RelayServer } from "./ws.js"
import { createAuthorshipRepository } from "./services/room-ai/authorship-repository.js"
import { createAuthService, createRedisUserRepository } from "./services/auth-service.js"
import { seedDefaultUsers, revokeLegacySeedUsers } from "./auth/seed.js"
import { createRoomAiEventBus } from "./services/room-ai/room-ai-event-bus.js"
import { createRoomAiService } from "./services/room-ai/room-ai-service.js"
import { createRoomAiDispatcher } from "./services/room-ai/room-ai-dispatcher.js"
import { createRoomAiOrchestrator } from "./services/room-ai/room-ai-orchestrator.js"
import { createRoomAiResponder } from "./services/room-ai/room-ai-responder.js"
import { createRoomMemoryRepository } from "./services/room-ai/room-memory-repository.js"
import { getRoomAiReplicaRequirement } from "./services/room-ai/chat-repository.js"
import { InferenceNotStartedError } from "./services/room-ai/inference-not-started.js"

async function main() {
  if (process.env.NODE_ENV !== "production") {
    process.env.JWT_SECRET ||= "umlstudio-development-jwt-secret-min-32-chars-2026!"
  }
  const config = loadConfig()

  if (process.env.NODE_ENV === "production" && !config.CORS_ORIGIN) {
    logger.warn(
      { event: "config.cors_origin_missing" },
      "CORS_ORIGIN is unset in production: browser clients will be blocked by CORS. " +
        "Set it to the frontend origin (e.g. https://umlstudio.pages.dev)."
    )
  }

  const redis = createRedisClient(config.REDIS_URL)
  await redis.connect()
  logger.info({ event: "redis.connected" }, "redis connected")
  await bootLoadFunction(redis)

  redis.on("ready", () => {
    bootLoadFunction(redis).catch((err) =>
      logger.error({ err }, "function library re-load on reconnect failed")
    )
  })

  const authorship = createAuthorshipRepository(redis, config.DIAGRAM_TTL_SECONDS)
  const userRepo = createRedisUserRepository(redis)
  const auth = createAuthService({
    repo: userRepo,
    jwtSecret: getJwtSecret(),
  })

  // One-time revocation of the previously versioned demo accounts.
  // Set UMLSTUDIO_REVOKE_LEGACY=true for a single deploy, then remove it.
  if (process.env.UMLSTUDIO_REVOKE_LEGACY === "true") {
    const { revoked, missing } = await revokeLegacySeedUsers(redis)
    logger.info(
      { event: "auth.seed.legacy_revoked", revoked, missing },
      `legacy seed revocation: ${revoked} revoked, ${missing} already absent`
    )
  }

  // Idempotently seed user accounts from UMLSTUDIO_SEED_USERS (env only)
  const { seeded, existing } = await seedDefaultUsers(auth, userRepo)
  if (seeded === 0 && existing === 0) {
    logger.warn(
      { event: "auth.seed.empty" },
      "UMLSTUDIO_SEED_USERS produced no users (unset, invalid, or empty): " +
        "no accounts can log in until one is seeded or created at /register"
    )
  }

  const sharedPort =
    config.WS_PORT === config.PORT ||
    (process.env.NODE_ENV === "production" && !process.env.WS_PORT)

  let relay: RelayServer | undefined
  let httpServer: ReturnType<ReturnType<typeof buildApp>["listen"]>
  const roomAiBus = await createRoomAiEventBus(redis, (diagramId, event) => {
    relay?.publishRoomAi(diagramId, event)
  })
  const relayPublish = {
    publishControl: (diagramId: string, control: import("./types.js").ControlEvent) => {
      relay?.publishControl(diagramId, control)
    },
    publishRoomAi: (diagramId: string, event: import("@umlstudio/core").RoomAiEvent) => {
      roomAiBus
        .publish(diagramId, event)
        .catch((err) => logger.error({ err, diagramId }, "room AI event publish failed"))
    },
    getSharedBoardReplicaAtLeast: (diagramId: string, generation: string, revision: number) =>
      relay?.getSharedBoardReplicaAtLeast(diagramId, generation, revision),
  }

  const responder = createRoomAiResponder({
    serviceUrl: config.AI_SERVICE_URL,
    internalToken: config.AI_INTERNAL_TOKEN,
  })
  const roomMemory = createRoomMemoryRepository(redis, {
    ttlSeconds: config.DIAGRAM_TTL_SECONDS,
    every: config.ROOM_AI_SUMMARY_EVERY,
    summarize: async (summary, messages, diagramId = "room") => {
      const boundedMessages = messages.slice(-10).map((message) => message.slice(0, 200))
      const result = await responder({
        route: "shared",
        requester: { id: "room-ai-memory", name: "Room AI" },
        intent: "ask",
        question:
          "Update the concise shared-room summary using only the supplied public messages. Preserve confirmed decisions and unresolved questions. Do not add facts. Return only the summary.",
        board: { id: diagramId, nodes: [], edges: [] } as never,
        contextJson: JSON.stringify({
          previousSummary: summary.slice(-1000),
          publicMessages: boundedMessages,
        }),
      })
      return result.text
    },
  })
  const roomAiOrchestrator = createRoomAiOrchestrator({
    redis,
    ttlSeconds: config.DIAGRAM_TTL_SECONDS,
    getBoard: (diagramId, requirement) => {
      const replica = relay?.getSharedBoardReplicaAtLeast(
        diagramId,
        requirement.generation,
        requirement.revision
      )
      if (!replica?.isComplete()) {
        throw new InferenceNotStartedError("shared board snapshot is not ready")
      }
      const board = replica.getModel()
      if (!replica.isComplete()) {
        throw new InferenceNotStartedError("shared board snapshot is not ready")
      }
      return board
    },
    getMemory: async (diagramId) => {
      const { summary, decisions } = await roomMemory.snapshot(diagramId)
      return { summary, decisions }
    },
    getAuthorship: (diagramId) => authorship.getAll(diagramId),
    respond: responder,
    publish: (diagramId, event) => roomAiBus.publish(diagramId, event),
    recordPublicMessage: (diagramId, message) => roomMemory.recordPublicMessage(diagramId, message),
  })
  const dispatcher = createRoomAiDispatcher({
    redis,
    maxConcurrency: config.AI_MAX_CONCURRENCY,
    ttlSeconds: config.DIAGRAM_TTL_SECONDS,
    getReplicaRequirement: (diagramId, messageId) =>
      getRoomAiReplicaRequirement(redis, diagramId, messageId),
    infer: (diagramId, messageId, replica) =>
      roomAiOrchestrator.infer(diagramId, messageId, replica),
    publish: (diagramId, event) => roomAiBus.publish(diagramId, event),
  })
  const queuedRoomAi = createRoomAiService({
    redis,
    ttlSeconds: config.DIAGRAM_TTL_SECONDS,
    maxConcurrency: config.AI_MAX_CONCURRENCY,
    memory: roomMemory,
    getSharedBoardReplicaAtLeast: relayPublish.getSharedBoardReplicaAtLeast,
    publish: relayPublish.publishRoomAi,
    respondPrivately: (input) =>
      roomAiOrchestrator.respondPrivately({
        diagramId: input.diagramId,
        author: { id: input.author.id, name: input.author.name },
        text: input.text,
        ...(input.privateContext !== undefined ? { privateContext: input.privateContext } : {}),
        board: input.board,
        ...(input.onInferenceStart ? { onInferenceStart: input.onInferenceStart } : {}),
      }),
  })
  const roomAi = {
    ...queuedRoomAi,
    async postMessage(input: Parameters<typeof queuedRoomAi.postMessage>[0]) {
      const result = await queuedRoomAi.postMessage(input)
      void dispatcher
        .drainRoom(input.diagramId)
        .catch((err) =>
          logger.error({ err, diagramId: input.diagramId }, "Room AI queue drain failed")
        )
      return result
    },
  }

  if (sharedPort) {
    const app = buildApp({ config, redis, relay: relayPublish, auth, roomAi })
    httpServer = app.listen(config.PORT, config.HOST, () => {
      logger.info(
        { event: "http.listen", host: config.HOST, port: config.PORT },
        "http server listening (single port HTTP + WS)"
      )
    })
    relay = startRelayServer({
      server: httpServer as import("http").Server,
      verifyToken: (token) => auth.verifyAccess(token).then((v) => v.userId),
      resolveUserProfile: (userId) => auth.getProfile(userId),
      authorship,
    })
  } else {
    relay = startRelayServer({
      port: config.WS_PORT,
      host: config.HOST,
      verifyToken: (token) => auth.verifyAccess(token).then((v) => v.userId),
      resolveUserProfile: (userId) => auth.getProfile(userId),
      authorship,
    })
    const app = buildApp({ config, redis, relay: relayPublish, auth, roomAi })
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
      await dispatcher.close()
      await dispatcher.waitForIdle()
    } catch (err) {
      logger.error({ err }, "Room AI dispatcher close failed")
    }
    try {
      await relay?.close()
    } catch (err) {
      logger.error({ err }, "ws close failed")
    }
    try {
      await roomAiBus.close()
    } catch (err) {
      logger.error({ err }, "room AI event bus close failed")
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
