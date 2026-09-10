import { Hono } from "hono";
import type { AppEnv } from "../http/env.js";
import type { Redis } from "../redis.js";

interface Deps {
  redis: Redis;
}

const UMLSTUDIO_LIBRARY_NAME = "umlstudio";

let lastDeepCheck: { ok: boolean; at: number } = { ok: false, at: 0 };
const DEEP_CHECK_TTL_MS = 30_000;

async function deepCheck(redis: Redis): Promise<boolean> {
  const now = Date.now();
  if (now - lastDeepCheck.at < DEEP_CHECK_TTL_MS) return lastDeepCheck.ok;
  try {
    await redis.ping();
    const libs = (await redis.sendCommand([
      "FUNCTION",
      "LIST",
      "LIBRARYNAME",
      UMLSTUDIO_LIBRARY_NAME,
    ])) as unknown[];
    const ok = Array.isArray(libs) && libs.length > 0;
    lastDeepCheck = { ok, at: now };
    return ok;
  } catch {
    lastDeepCheck = { ok: false, at: now };
    return false;
  }
}

export function mountHealthRoutes({ redis }: Deps): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  router.get("/", async (c) => {
    try {
      await redis.ping();
      return c.json({ status: "ok" }, 200);
    } catch {
      return c.json({ status: "error", message: "redis unavailable" }, 503);
    }
  });

  router.get("/ready", async (c) => {
    const ok = await deepCheck(redis);
    if (ok) return c.json({ status: "ok" }, 200);
    return c.json(
      {
        status: "error",
        message: "redis function library 'umlstudio' missing or unreachable",
      },
      503,
    );
  });

  return router;
}
