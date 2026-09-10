import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createAdaptorServer, type ServerType } from "@hono/node-server";
import type { Config } from "../config.js";
import type { Redis } from "../redis.js";
import type { AppEnv } from "./env.js";
import { requestId } from "./middleware/requestId.js";
import { httpLogger } from "./middleware/logger.js";
import { configureCors } from "./middleware/cors.js";
import { ownerReader } from "./middleware/owner.js";
import { errorHandler } from "./middleware/errors.js";
import { Errors } from "./errors.js";
import { mountDiagramRoutes } from "../routes/diagrams.js";
import { mountVersionRoutes } from "../routes/versions.js";
import { mountConversionRoutes } from "../routes/conversion.js";
import { mountHealthRoutes } from "../routes/health.js";
import { mountEmbedApiRoutes, mountEmbedRoutes } from "../routes/embed.js";
import { ConversionResource } from "../resources/conversion-resource.js";
import { SvgPreviewCache } from "../services/svg-preview-cache.js";
import type { ControlEvent } from "../types.js";

export interface RelayHook {
  publishControl: (diagramId: string, control: ControlEvent) => void;
}

export interface AppDeps {
  config: Config;
  redis: Redis;
  relay?: RelayHook;
  autoLogging?: boolean;
  conversionResource?: ConversionResource;
}

export function buildApp(deps: AppDeps): ServerType {
  const { config, redis, relay, autoLogging = true, conversionResource } = deps;

  const app = new Hono<AppEnv>();

  app.use(
    bodyLimit({
      maxSize: config.MAX_SNAPSHOT_BYTES,
      onError: async (c) => {
        const body = c.req.raw.body;
        if (body) {
          const reader = body.getReader();
          try {
            for (;;) {
              const { done } = await reader.read();
              if (done) break;
            }
          } catch {}
        }
        throw Errors.bodyTooLarge();
      },
    }),
  );

  app.use(requestId());
  app.use(httpLogger({ autoLogging }));
  app.use(configureCors(config));
  app.use(ownerReader({ secret: config.OWNER_SECRET }));
  app.onError(errorHandler);

  let resource: ConversionResource | undefined = conversionResource;
  const getResource = (): ConversionResource =>
    (resource ??= new ConversionResource());

  const previewCache = new SvgPreviewCache();

  app.route("/health", mountHealthRoutes({ redis }));
  app.route("/api", mountDiagramRoutes({ config, redis }, relay));
  app.route("/api", mountVersionRoutes({ config, redis }, relay));
  app.route("/api", mountConversionRoutes({ getResource }));
  app.route(
    "/api",
    mountEmbedApiRoutes({ redis, config, getResource, previewCache }),
  );
  app.route(
    "/embed",
    mountEmbedRoutes({ redis, config, getResource, previewCache }),
  );

  return createAdaptorServer({ fetch: app.fetch });
}
