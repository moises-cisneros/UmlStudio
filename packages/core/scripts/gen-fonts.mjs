import subsetFont from "subset-font"
import { readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const SRC_DIR = resolve(here, "../../../assets/fonts")
const OUT_DIR = resolve(here, "../../../assets/fonts")

const ranges = [
  [0x20, 0x7e],
  [0xa0, 0xff],
  [0x100, 0x17f],
  [0x180, 0x24f],
  [0x300, 0x36f],
  [0x370, 0x3ff],
  [0x400, 0x4ff],
  [0x1e00, 0x1eff],
  [0x2013, 0x2014],
  [0x2018, 0x201f],
  [0x2026, 0x2026],
]

let chars = ""
for (const [a, b] of ranges) {
  for (let c = a; c <= b; c++) chars += String.fromCodePoint(c)
}

const fonts = ["Inter-Regular", "Inter-Bold", "Inter-Italic", "Inter-BoldItalic"]

for (const name of fonts) {
  const buf = await readFile(resolve(SRC_DIR, `${name}.ttf`))
  for (const targetFormat of ["woff2", "truetype"]) {
    const ext = targetFormat === "truetype" ? "ttf" : "woff2"
    const subset = await subsetFont(buf, chars, { targetFormat })
    await writeFile(resolve(OUT_DIR, `${name}.${ext}`), subset)
    // eslint-disable-next-line no-console
    console.log(`${name}.${ext}: ${subset.length} bytes`)
  }
}
