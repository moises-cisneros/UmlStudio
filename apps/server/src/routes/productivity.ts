import { Hono, type Context } from "hono";
import type { AppEnv } from "../http/env.js";
import { productivityCollector } from "../services/productivity-collector.js";

export function mountProductivityRoutes(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  router.get("/diagrams/:id/productivity", (c: Context<AppEnv>) => {
    const diagramId = c.req.param("id");
    if (!diagramId || !/^[A-Za-z0-9_-]{1,64}$/.test(diagramId)) {
      return c.json({ error: "Invalid diagram ID" }, 400);
    }

    const report = productivityCollector.getReport(diagramId);
    return c.json(report, 200);
  });

  router.post("/diagrams/:id/productivity/telemetry", async (c: Context<AppEnv>) => {
    const diagramId = c.req.param("id");
    if (!diagramId || !/^[A-Za-z0-9_-]{1,64}$/.test(diagramId)) {
      return c.json({ error: "Invalid diagram ID" }, 400);
    }

    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const userId = typeof body["userId"] === "string" ? body["userId"] : "anonymous";
    const userName = typeof body["userName"] === "string" ? body["userName"] : undefined;
    const color = typeof body["color"] === "string" ? body["color"] : undefined;
    const createdClasses =
      typeof body["createdClasses"] === "number" ? body["createdClasses"] : undefined;
    const createdMethods =
      typeof body["createdMethods"] === "number" ? body["createdMethods"] : undefined;
    const refactors =
      typeof body["refactors"] === "number" ? body["refactors"] : undefined;

    productivityCollector.recordActivity(
      diagramId,
      { userId, userName, color },
      { createdClasses, createdMethods, refactors },
    );

    const report = productivityCollector.getReport(diagramId);
    return c.json(report, 200);
  });

  return router;
}
