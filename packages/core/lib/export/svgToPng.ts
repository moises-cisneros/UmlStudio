import interBoldUrl from "@fonts/Inter-Bold.ttf?url"
import interRegularUrl from "@fonts/Inter-Regular.ttf?url"
import interItalicUrl from "@fonts/Inter-Italic.ttf?url"
import interBoldItalicUrl from "@fonts/Inter-BoldItalic.ttf?url"
import { DEFAULT_FONT_SIZE } from "@/fontStack"
import { RasterTooLargeError } from "./exportErrors"

const DEFAULT_MAX_AREA_PX = 75_000_000
const DEFAULT_MAX_DIMENSION_PX = 16_384
const STEM_DARKEN_EM = 0.0156

export type SvgToPngOptions = {
  scale?: number
  background?: string | null
  maxAreaPx?: number
  maxDimensionPx?: number
  wasmInput?: WebAssembly.Module | BufferSource | Response | Promise<Response>
  fontBuffers?: Uint8Array[]
}

export type SvgToPngResult = {
  blob: Blob
  appliedScale: number
  clamped: boolean
  width: number
  height: number
}

export function computeAppliedScale(
  width: number,
  height: number,
  requestedScale: number,
  maxAreaPx: number,
  maxDimensionPx: number
): number {
  if (width <= 0 || height <= 0) return requestedScale
  return Math.min(
    requestedScale,
    Math.sqrt(maxAreaPx / (width * height)),
    maxDimensionPx / width,
    maxDimensionPx / height
  )
}

let wasmBoot: Promise<void> | null = null
let cachedFonts: Promise<Uint8Array[]> | null = null

async function ensureWasm(
  initWasm: (input: NonNullable<SvgToPngOptions["wasmInput"]>) => Promise<void>,
  wasmInput: SvgToPngOptions["wasmInput"]
): Promise<void> {
  if (!wasmInput) {
    throw new Error(
      "svgToPng requires opts.wasmInput (the @resvg/resvg-wasm binary). " +
        'In Vite: import url from "@resvg/resvg-wasm/index_bg.wasm?url"; ' +
        "svgToPng(svg, clip, { wasmInput: fetch(url) })."
    )
  }
  if (!wasmBoot) {
    wasmBoot = Promise.resolve(wasmInput)
      .then(initWasm)
      .catch((err) => {
        if (/already initialized/i.test(String(err))) return
        wasmBoot = null
        throw err
      })
  }
  return wasmBoot
}

async function loadBundledFonts(): Promise<Uint8Array[]> {
  if (!cachedFonts) {
    cachedFonts = Promise.all(
      [interRegularUrl, interBoldUrl, interItalicUrl, interBoldItalicUrl].map(async (url) => {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`Failed to load font ${url}: ${res.status}`)
        return new Uint8Array(await res.arrayBuffer())
      })
    )
  }
  return cachedFonts
}

const SVG_DEFAULT_TEXT_FILL = "#000000"

function prepareSvgForRaster(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml")
  doc.querySelectorAll("text").forEach((text) => {
    const fill = text.getAttribute("fill") || SVG_DEFAULT_TEXT_FILL
    if (fill === "none") return
    const fontSize = parseFloat(text.getAttribute("font-size") ?? "") || DEFAULT_FONT_SIZE
    text.setAttribute("stroke", fill)
    text.setAttribute("paint-order", "stroke")
    text.setAttribute("stroke-linejoin", "round")
    text.setAttribute("stroke-width", String(STEM_DARKEN_EM * fontSize))
    text.querySelectorAll("tspan").forEach((tspan) => {
      const size = parseFloat(tspan.getAttribute("font-size") ?? "")
      if (size) tspan.setAttribute("stroke-width", String(STEM_DARKEN_EM * size))
    })
  })
  return new XMLSerializer().serializeToString(doc)
}

export async function svgToPng(
  svg: string,
  clip: { width: number; height: number },
  opts: SvgToPngOptions = {}
): Promise<SvgToPngResult> {
  const requestedScale = opts.scale ?? 1.5
  const maxAreaPx = opts.maxAreaPx ?? DEFAULT_MAX_AREA_PX
  const maxDimensionPx = opts.maxDimensionPx ?? DEFAULT_MAX_DIMENSION_PX
  const background = opts.background ?? null

  if (clip.width <= 0 || clip.height <= 0) {
    throw new RasterTooLargeError(
      `Diagram has zero or negative dimensions (${clip.width}x${clip.height}).`,
      clip.width,
      clip.height
    )
  }

  const appliedScale = computeAppliedScale(
    clip.width,
    clip.height,
    requestedScale,
    maxAreaPx,
    maxDimensionPx
  )
  const clamped = appliedScale < requestedScale

  const { initWasm, Resvg } = await import("@resvg/resvg-wasm")
  await ensureWasm(initWasm, opts.wasmInput)
  const fontBuffers = opts.fontBuffers ?? (await loadBundledFonts())

  let resvg: InstanceType<typeof Resvg> | undefined
  let rendered: ReturnType<InstanceType<typeof Resvg>["render"]> | undefined
  try {
    resvg = new Resvg(prepareSvgForRaster(svg), {
      fitTo: { mode: "zoom", value: appliedScale },
      background: background ?? "rgba(0,0,0,0)",
      font: {
        loadSystemFonts: false,
        fontBuffers,
        defaultFontFamily: "Inter",
      },
    })
    rendered = resvg.render()
    const png = new Uint8Array(rendered.asPng())
    const { width, height } = rendered
    return {
      blob: new Blob([png], { type: "image/png" }),
      appliedScale,
      clamped,
      width,
      height,
    }
  } catch (err) {
    if (err instanceof RangeError) {
      const cw = Math.round(clip.width * appliedScale)
      const ch = Math.round(clip.height * appliedScale)
      throw new RasterTooLargeError(
        `PNG render ran out of memory at ${cw}x${ch}: ${err.message}`,
        cw,
        ch
      )
    }
    throw err
  } finally {
    rendered?.free()
    resvg?.free()
  }
}
