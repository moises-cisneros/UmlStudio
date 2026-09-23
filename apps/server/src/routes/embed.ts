import { Hono, type Context } from "hono"
import type { AppEnv } from "../http/env.js"
import type { Redis } from "../redis.js"
import { gunzipJson, k } from "../redis.js"
import { Errors } from "../http/errors.js"
import { validate } from "../http/middleware/validate.js"
import { type ConversionResource, QueueFullError } from "../resources/conversion-resource.js"
import { DiagramIdParams } from "./_schemas.js"
import { refreshDiagramTtl } from "./diagrams.js"
import type { Config } from "../config.js"
import type { Diagram } from "../types.js"
import type { UMLModel } from "@umlstudio/core"
import type { SvgPreviewCache } from "../services/svg-preview-cache.js"

interface Deps {
  redis: Redis
  config: Config
  getResource: () => ConversionResource
  previewCache: SvgPreviewCache
}

const CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=86400"
const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'"

const HTML_CSP = [
  "default-src 'none'",
  "img-src 'self' data:",
  "style-src 'unsafe-inline'",
  "frame-ancestors *",
].join("; ")

async function readDiagramWithEtag(
  redis: Redis,
  diagramId: string
): Promise<{ diagram: Diagram; etag: string; ttlSeconds: number } | null> {
  const multi = redis.multi()
  multi.get(k.diagram(diagramId))
  multi.hGet(k.diagramMeta(diagramId), "headRev")
  multi.ttl(k.diagram(diagramId))
  const replies = (await multi.exec()) as unknown[]
  for (const reply of replies) {
    if (reply instanceof Error) throw reply
  }

  const raw = replies[0] as string | null
  let diagram: Diagram | undefined
  if (typeof raw === "string" && raw.length > 0) {
    try {
      diagram = gunzipJson<Diagram>(raw)
    } catch {
      diagram = undefined
    }
  }
  if (!diagram) return null

  const headRev = (replies[1] as string | null) ?? "0"
  const ttlSeconds = Number(replies[2] ?? -1)
  return { diagram, etag: `W/"${headRev}"`, ttlSeconds }
}

function ifNoneMatch(header: string | undefined, etag: string): boolean {
  if (!header) return false
  if (header.trim() === "*") return true
  const opaque = (tag: string) => tag.trim().replace(/^W\//, "")
  const target = opaque(etag)
  return header.split(",").some((tag) => opaque(tag) === target)
}

function withOpaqueBackground(svg: string): string {
  const openTag = svg.match(/<svg\b[^>]*>/i)
  if (!openTag) return svg
  const viewBox = openTag[0].match(/viewBox\s*=\s*"([^"]+)"/i)
  const parts = viewBox?.[1]
    ?.trim()
    .split(/[\s,]+/)
    .map(Number)
  const rect =
    parts && parts.length === 4 && parts.every(Number.isFinite)
      ? `<rect x="${parts[0]}" y="${parts[1]}" width="${parts[2]}" height="${parts[3]}" fill="#ffffff"/>`
      : `<rect x="-100000" y="-100000" width="200000" height="200000" fill="#ffffff"/>`
  const insertAt = (openTag.index ?? 0) + openTag[0].length
  return svg.slice(0, insertAt) + rect + svg.slice(insertAt)
}

async function renderSvg(deps: Deps, diagram: Diagram, etag: string): Promise<string> {
  try {
    return await deps.previewCache.render(`${diagram.id}:${etag}`, async () => {
      const { data } = await deps.getResource().render("svg", diagram as UMLModel)
      return typeof data === "string" ? data : data.toString("utf8")
    })
  } catch (error) {
    if (error instanceof QueueFullError) throw Errors.rendererBusy()
    throw error
  }
}

const FRAME_STYLE = `
  .fr-card { fill: #ffffff; stroke: #d0d7de; }
  .fr-inset { fill: #ffffff; }
  .fr-divider { stroke: #d8dee4; }
  .fr-title { fill: #59636e; font-weight: 500; }
  .fr-btn { fill: #0f3a66; }
  .fr-btn-tx { fill: #ffffff; font-weight: 600; }
  .fr-btn-ar { stroke: #ffffff; }
  .fr-sh { flood-color: #1f2328; flood-opacity: 0.16; }
  .fr-card, .fr-title, .fr-btn-tx { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  @media (prefers-color-scheme: dark) {
    .fr-card { fill: #161b22; stroke: #30363d; }
    .fr-divider { stroke: #30363d; }
    .fr-title { fill: #9198a1; }
    .fr-btn { fill: #1f6feb; }
    .fr-sh { flood-color: #000000; flood-opacity: 0.5; }
  }`

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** Truncates to `max` characters with an ellipsis, collapsing whitespace. */
function truncateLabel(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim()
  if (t.length <= max) return t
  return t.slice(0, Math.max(1, max - 1)).trimEnd() + "…"
}

function frameDiagramSvg(svg: string, title: string, withFooter = true): string {
  const openTag = svg.match(/<svg\b[^>]*>/i)
  const vb = openTag?.[0]
    .match(/viewBox\s*=\s*"([^"]+)"/i)?.[1]
    ?.trim()
    .split(/[\s,]+/)
    .map(Number)
  if (!openTag || !vb || vb.length !== 4 || !vb.every(Number.isFinite)) {
    return withOpaqueBackground(svg)
  }
  const [minX, minY, w, h] = vb as [number, number, number, number]

  const MAT = clamp(w * 0.014, 10, 22)
  const R = clamp(w * 0.014, 12, 26)
  const PAD = clamp(w * 0.03, 22, 44)
  const STROKE = Math.max(1.4, w * 0.0013)
  const FOOTER = withFooter ? clamp(w * 0.055, 46, 78) : 0
  const insetH = withFooter ? h - MAT : h - 2 * MAT

  const r2 = (n: number) => Math.round(n * 100) / 100
  const outW = w + 2 * PAD
  const outH = h + FOOTER + 2 * PAD

  let footer = ""
  if (withFooter) {
    const FONT = clamp(FOOTER * 0.32, 13, 26)
    const GUTTER = FONT * 0.85
    const footerY = minY + h
    const footerMid = footerY + FOOTER / 2

    const label = "Open in UmlStudio"
    const arrow = FONT * 0.8
    const btnPadX = FONT * 0.95
    const btnTextW = label.length * FONT * 0.54
    const btnW = btnPadX * 2 + btnTextW + FONT * 0.6 + arrow
    const BTN_H = FOOTER * 0.62
    const btnX = minX + w - MAT - GUTTER - btnW
    const btnY = footerMid - BTN_H / 2
    const arrowX = btnX + btnW - btnPadX - arrow
    const ah = arrow * 0.34

    const titleX = minX + MAT + GUTTER
    const maxChars = Math.max(3, Math.floor((btnX - titleX - FONT * 0.8) / (FONT * 0.56)))
    const safeTitle = escapeHtml(truncateLabel(title || "UmlStudio diagram", maxChars))

    footer = `
<line class="fr-divider" x1="${r2(minX + MAT)}" y1="${r2(footerY)}" x2="${r2(minX + w - MAT)}" y2="${r2(footerY)}" stroke-width="${r2(STROKE)}"/>
<text class="fr-title" x="${r2(titleX)}" y="${r2(footerMid)}" font-size="${r2(FONT)}" dominant-baseline="central">${safeTitle}</text>
<rect class="fr-btn" x="${r2(btnX)}" y="${r2(btnY)}" width="${r2(btnW)}" height="${r2(BTN_H)}" rx="${r2(BTN_H / 2)}"/>
<text class="fr-btn-tx" x="${r2(btnX + btnPadX)}" y="${r2(footerMid)}" font-size="${r2(FONT)}" textLength="${r2(btnTextW)}" lengthAdjust="spacingAndGlyphs" dominant-baseline="central">${label}</text>
<path class="fr-btn-ar" d="M ${r2(arrowX)} ${r2(footerMid)} L ${r2(arrowX + arrow)} ${r2(footerMid)} M ${r2(arrowX + arrow - ah)} ${r2(footerMid - ah)} L ${r2(arrowX + arrow)} ${r2(footerMid)} L ${r2(arrowX + arrow - ah)} ${r2(footerMid + ah)}" fill="none" stroke-width="${r2(STROKE * 1.3)}" stroke-linecap="round" stroke-linejoin="round"/>`
  }

  const inner = svg.slice((openTag.index ?? 0) + openTag[0].length, svg.lastIndexOf("</svg>"))

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(minX - PAD)} ${r2(minY - PAD)} ${r2(outW)} ${r2(outH)}" width="${r2(outW)}" height="${r2(outH)}" shape-rendering="geometricPrecision">
<style>${FRAME_STYLE}</style>
<defs><filter id="fr-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow class="fr-sh" dx="0" dy="${r2(STROKE * 1.4)}" stdDeviation="${r2(PAD * 0.22)}"/></filter></defs>
<rect class="fr-card" filter="url(#fr-shadow)" x="${r2(minX)}" y="${r2(minY)}" width="${r2(w)}" height="${r2(h + FOOTER)}" rx="${r2(R)}" stroke-width="${r2(STROKE)}"/>
<rect class="fr-inset" x="${r2(minX + MAT)}" y="${r2(minY + MAT)}" width="${r2(w - 2 * MAT)}" height="${r2(insetH)}" rx="${r2(R * 0.5)}"/>
${inner}${footer}
</svg>`
}

export function mountEmbedApiRoutes(deps: Deps): Hono<AppEnv> {
  const { redis, config } = deps
  const router = new Hono<AppEnv>()

  router.on(
    ["GET", "HEAD"],
    "/diagrams/:diagramId/preview.svg",
    validate({ params: DiagramIdParams }, async (c, { params }) => {
      const found = await readDiagramWithEtag(redis, params.diagramId)
      if (!found) throw Errors.notFound("diagram not found")
      await refreshDiagramTtl(redis, config.DIAGRAM_TTL_SECONDS, params.diagramId, found.ttlSeconds)

      if (ifNoneMatch(c.req.header("if-none-match"), found.etag)) {
        c.header("etag", found.etag)
        c.header("cache-control", CACHE_CONTROL)
        return c.body(null, 304)
      }

      const setHeaders = () => {
        c.header("content-type", "image/svg+xml")
        c.header("etag", found.etag)
        c.header("cache-control", CACHE_CONTROL)
        c.header("x-content-type-options", "nosniff")
        c.header("content-security-policy", SVG_CSP)
      }

      if (c.req.method === "HEAD") {
        setHeaders()
        return c.body(null, 200)
      }

      const raw = await renderSvg(deps, found.diagram, found.etag)
      const svg = frameDiagramSvg(
        raw,
        found.diagram.title || "UmlStudio diagram",
        c.req.query("frame") !== "plain"
      )
      setHeaders()
      return c.body(svg, 200)
    })
  )

  return router
}

export function mountEmbedRoutes(deps: Deps): Hono<AppEnv> {
  const { redis, config } = deps
  const router = new Hono<AppEnv>()

  router.on(
    ["GET", "HEAD"],
    "/:diagramId",
    validate({ params: DiagramIdParams }, async (c, { params }) => {
      const found = await readDiagramWithEtag(redis, params.diagramId)
      if (!found) throw Errors.notFound("diagram not found")
      await refreshDiagramTtl(redis, config.DIAGRAM_TTL_SECONDS, params.diagramId, found.ttlSeconds)

      if (ifNoneMatch(c.req.header("if-none-match"), found.etag)) {
        c.header("etag", found.etag)
        c.header("cache-control", CACHE_CONTROL)
        return c.body(null, 304)
      }

      const setHeaders = () => {
        c.header("content-type", "text/html; charset=utf-8")
        c.header("etag", found.etag)
        c.header("cache-control", CACHE_CONTROL)
        c.header("x-content-type-options", "nosniff")
        c.header("content-security-policy", HTML_CSP)
        c.header("referrer-policy", "no-referrer")
        c.header("permissions-policy", "interest-cohort=(), browsing-topics=()")
      }

      if (c.req.method === "HEAD") {
        setHeaders()
        return c.body(null, 200)
      }

      const raw = await renderSvg(deps, found.diagram, found.etag)
      const html = renderEmbedHtml({
        title: found.diagram.title || "UmlStudio diagram",
        svg: withOpaqueBackground(raw),
        editorHref: buildEditorHref(c, found.diagram.id),
      })
      setHeaders()
      return c.body(html, 200)
    })
  )

  return router
}

function buildEditorHref(c: Context<AppEnv>, diagramId: string): string {
  const host = c.req.header("host") ?? ""
  const forwardedProto = c.req.header("x-forwarded-proto")
  const protocol = forwardedProto
    ? (forwardedProto.split(",")[0]?.trim() ?? "http")
    : new URL(c.req.url).protocol.replace(/:$/, "")
  return `${protocol}://${host}/shared/${encodeURIComponent(diagramId)}?view=COLLABORATE`
}

interface EmbedHtmlInput {
  title: string
  svg: string
  editorHref: string
}

function renderEmbedHtml({ title, svg, editorHref }: EmbedHtmlInput): string {
  const safeTitle = escapeHtml(title)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${safeTitle} - UmlStudio</title>
<style>
  /* The exported SVG uses fills tuned for a light canvas, so the canvas stays
     white in both colour schemes; only the chrome follows the system theme. */
  :root { color-scheme: light dark; }
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; background: #fff; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #111; }
  .umlstudio-embed { display: flex; flex-direction: column; height: 100%; min-height: 100vh; }
  .umlstudio-embed__canvas { flex: 1; display: flex; align-items: center; justify-content: center; padding: 8px; overflow: auto; background: #fff; }
  .umlstudio-embed__canvas svg { max-width: 100%; max-height: 100%; height: auto; width: auto; }
  .umlstudio-embed__footer { padding: 6px 12px; font-size: 12px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(0,0,0,0.08); }
  .umlstudio-embed__title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 12px; opacity: 0.7; }
  .umlstudio-embed__open { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; color: #fff; background: #0f3a66; text-decoration: none; padding: 5px 12px; border-radius: 6px; font-weight: 600; transition: background 0.15s ease; }
  .umlstudio-embed__open:hover { background: #15497f; }
  .umlstudio-embed__open svg { display: block; }
  @media (prefers-color-scheme: dark) {
    html, body { background: #0d1117; color: #e6edf3; }
    .umlstudio-embed__footer { border-top-color: rgba(255,255,255,0.08); }
    .umlstudio-embed__open { background: #1f6feb; }
    .umlstudio-embed__open:hover { background: #388bfd; }
  }
</style>
</head>
<body>
<main class="umlstudio-embed">
  <div class="umlstudio-embed__canvas">${svg}</div>
  <footer class="umlstudio-embed__footer">
    <span class="umlstudio-embed__title">${safeTitle}</span>
    <a class="umlstudio-embed__open" rel="noopener noreferrer" target="_top" href="${escapeHtml(editorHref)}">Open in UmlStudio<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg></a>
  </footer>
</main>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
