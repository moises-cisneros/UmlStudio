import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { buildApp } from "./http/app.js";
import { bootLoadFunction, createRedisClient } from "./redis.js";
import { startRelayServer } from "./ws.js";

async function main() {
  const config = loadConfig();

  const redis = createRedisClient(config.REDIS_URL);
  await redis.connect();
  logger.info({ event: "redis.connected" }, "redis connected");
  await bootLoadFunction(redis);

  redis.on("ready", () => {
    bootLoadFunction(redis).catch((err) =>
      logger.error({ err }, "function library re-load on reconnect failed"),
    );
  });

  const relay = startRelayServer({
    port: config.WS_PORT,
    host: config.HOST,
  });

  const app = buildApp({ config, redis, relay });
  const httpServer = app.listen(config.PORT, config.HOST, () => {
    logger.info(
      { event: "http.listen", host: config.HOST, port: config.PORT },
      "http server listening",
    );
  });

  const shutdown = async (signal: string) => {
    logger.info({ event: "shutdown.begin", signal }, "shutdown");
    try {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    } catch (err) {
      logger.error({ err }, "http server close failed");
    }
    try {
      await relay.close();
    } catch (err) {
      logger.error({ err }, "ws close failed");
    }
    try {
      await redis.quit();
    } catch (err) {
      logger.error({ err }, "redis quit failed");
    }
    logger.info({ event: "shutdown.complete" });
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "fatal startup error");
  process.exit(1);
});
