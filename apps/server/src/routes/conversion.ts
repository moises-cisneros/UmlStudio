import { Hono, type Context } from "hono"
import type { UMLModel } from "@umlstudio/core"
import type { AppEnv } from "../http/env.js"
import { ConversionResource, QueueFullError } from "../resources/conversion-resource.js"
import { Errors } from "../http/errors.js"
import type { ConversionFormat } from "../workers/conversion-worker-thread.js"

interface Deps {
  getResource: () => ConversionResource
}

function parseModel(body: unknown): UMLModel | undefined {
  const raw =
    body && typeof body === "object" && "model" in body ? (body as { model: unknown }).model : body
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as UMLModel
    } catch {
      return undefined
    }
  }
  if (raw && typeof raw === "object") return raw as UMLModel
  return undefined
}

export function mountConversionRoutes({ getResource }: Deps): Hono<AppEnv> {
  const router = new Hono<AppEnv>()

  const convert = (format: ConversionFormat) => async (c: Context<AppEnv>) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      body = undefined
    }
    const model = parseModel(body)
    if (!model) {
      return c.json({ error: "Model must be defined!" }, 400)
    }

    const scale =
      format === "png"
        ? Number(c.req.query("scale") ?? (body as { scale?: number })?.scale)
        : undefined

    try {
      const { mime, data } = await getResource().render(format, model, scale)
      c.header("content-type", mime)
      const out = typeof data === "string" ? data : (data as Uint8Array<ArrayBuffer>)
      return c.body(out, 200)
    } catch (error) {
      if (error instanceof QueueFullError) throw Errors.rendererBusy()
      throw error
    }
  }

  router.get("/converter/status", (c) => c.text("OK", 200))
  router.post("/converter/svg", convert("svg"))
  router.post("/converter/png", convert("png"))
  router.post("/converter/pdf", convert("pdf"))

  return router
}
