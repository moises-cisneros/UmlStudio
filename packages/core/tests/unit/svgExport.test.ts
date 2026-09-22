import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, it, expect } from "vitest"
import { computeAppliedScale, svgToPng } from "@/export/svgToPng"
import { RasterTooLargeError } from "@/export/exportErrors"

const wasmBytes = readFileSync(
  resolve(__dirname, "../../node_modules/@resvg/resvg-wasm/index_bg.wasm")
)
const fontBuffers = [
  new Uint8Array(readFileSync(resolve(__dirname, "../../../../assets/fonts/Inter-Regular.ttf"))),
  new Uint8Array(readFileSync(resolve(__dirname, "../../../../assets/fonts/Inter-Bold.ttf"))),
]

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60" viewBox="0 0 120 60">
  <svg x="0" y="0" width="120" height="60" viewBox="0 0 120 60" overflow="visible">
    <rect x="0" y="0" width="120" height="60" fill="#ffffff" stroke="#000"/>
    <text x="60" y="20" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="600" fill="#000">
      <tspan x="60" y="16" font-size="13.6px">«interface»</tspan>
      <tspan x="60" y="32">MyClass</tspan>
    </text>
  </svg>
</svg>`
const CLIP = { width: 120, height: 60 }

describe("computeAppliedScale", () => {
  it("returns the requested scale when within budget", () => {
    expect(computeAppliedScale(100, 100, 1.5, 75_000_000, 16_384)).toBe(1.5)
  })

  it("clamps to the area budget for huge diagrams", () => {
    const scale = computeAppliedScale(10_000, 10_000, 1.5, 75_000_000, 16_384)
    expect(scale).toBeLessThan(1.5)
    expect(10_000 * scale * (10_000 * scale)).toBeLessThanOrEqual(75_000_001)
  })

  it("clamps to the per-side cap", () => {
    const scale = computeAppliedScale(20_000, 100, 1.5, 75_000_000, 16_384)
    expect(20_000 * scale).toBeLessThanOrEqual(16_384)
  })
})

describe("svgToPng", () => {
  it("rasterises to a real PNG at the requested scale", async () => {
    const result = await svgToPng(SAMPLE_SVG, CLIP, {
      scale: 2,
      background: "#ffffff",
      wasmInput: wasmBytes,
      fontBuffers,
    })
    expect(result.clamped).toBe(false)
    expect(result.appliedScale).toBe(2)
    expect(result.width).toBe(240)
    expect(result.height).toBe(120)

    const bytes = new Uint8Array(await result.blob.arrayBuffer())
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect(bytes.length).toBeGreaterThan(100)
  })

  it("reports clamped=true and a reduced scale for an over-budget diagram", async () => {
    const result = await svgToPng(SAMPLE_SVG, CLIP, {
      scale: 2,
      maxAreaPx: 10_000,
      wasmInput: wasmBytes,
      fontBuffers,
    })
    expect(result.clamped).toBe(true)
    expect(result.appliedScale).toBeLessThan(2)
  })

  it("throws a typed error on non-positive dimensions", async () => {
    await expect(
      svgToPng(SAMPLE_SVG, { width: 0, height: 60 }, { fontBuffers })
    ).rejects.toBeInstanceOf(RasterTooLargeError)
  })

  it("does not misclassify a malformed-SVG failure as too-large", async () => {
    const err = await svgToPng("not an svg at all", CLIP, {
      wasmInput: wasmBytes,
      fontBuffers,
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(RasterTooLargeError)
  })
})
