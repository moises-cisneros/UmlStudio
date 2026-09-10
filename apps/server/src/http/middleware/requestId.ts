import { createMiddleware } from "hono/factory";
import { randomUUID } from "node:crypto";
import type { AppEnv } from "../env.js";

const HEADER = "x-request-id";

export function requestId() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const incoming = c.req.header(HEADER);
    const id = incoming && incoming.length <= 128 ? incoming : randomUUID();
    c.set("requestId", id);
    c.header(HEADER, id);
    await next();
  });
}
