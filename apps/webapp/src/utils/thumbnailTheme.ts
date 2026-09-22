type RgbColor = {
  r: number
  g: number
  b: number
  a: number
}

const DARK_THEME_TOKEN_FALLBACK = {
  ink: "#ffffff",
  surface: "#13161c",
} as const

let darkThumbnailTokens: { ink: string; surface: string } | null = null

const resolveDarkThumbnailTokens = (): { ink: string; surface: string } => {
  if (darkThumbnailTokens) return darkThumbnailTokens

  if (typeof document === "undefined") {
    return DARK_THEME_TOKEN_FALLBACK
  }

  const root = document.documentElement
  const previousTheme = root.getAttribute("data-theme")

  root.setAttribute("data-theme", "dark")
  try {
    const styles = getComputedStyle(root)
    const ink = styles.getPropertyValue("--umlstudio-foreground").trim()
    const surface = styles.getPropertyValue("--umlstudio-background").trim()
    darkThumbnailTokens = {
      ink: parseCssColor(ink) ? ink : DARK_THEME_TOKEN_FALLBACK.ink,
      surface: parseCssColor(surface) ? surface : DARK_THEME_TOKEN_FALLBACK.surface,
    }
  } finally {
    if (previousTheme === null) {
      root.removeAttribute("data-theme")
    } else {
      root.setAttribute("data-theme", previousTheme)
    }
  }

  return darkThumbnailTokens
}

const THUMBNAIL_THEME_CACHE_LIMIT = 300

type ThumbnailThemeCacheEntry = {
  lightDataUrl?: string
  darkSvg?: string
  darkDataUrl?: string
}

export type ThumbnailThemeSources = {
  lightDataUrl: string
  darkDataUrl: string
}

const thumbnailThemeCache = new Map<string, ThumbnailThemeCacheEntry>()

export const toSvgDataUrl = (svgString: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`

const parseCssColor = (value: string): RgbColor | null => {
  const normalized = value.trim().toLowerCase()
  if (
    normalized.length === 0 ||
    normalized === "none" ||
    normalized === "transparent" ||
    normalized === "currentcolor" ||
    normalized === "inherit" ||
    normalized.startsWith("url(")
  ) {
    return null
  }

  if (normalized === "black") {
    return { r: 0, g: 0, b: 0, a: 1 }
  }

  if (normalized === "white") {
    return { r: 255, g: 255, b: 255, a: 1 }
  }

  if (normalized.startsWith("#")) {
    const hex = normalized.slice(1)
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b, a = "f"] = hex
      return {
        r: Number.parseInt(r + r, 16),
        g: Number.parseInt(g + g, 16),
        b: Number.parseInt(b + b, 16),
        a: Number.parseInt(a + a, 16) / 255,
      }
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
      }
    }
    return null
  }

  const rgbaMatch = normalized.match(
    /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)$/
  )
  if (rgbaMatch) {
    const [, r, g, b, a] = rgbaMatch
    return {
      r: Number(r),
      g: Number(g),
      b: Number(b),
      a: a ? Number(a) : 1,
    }
  }

  return null
}

const getColorLuminance = ({ r, g, b }: RgbColor): number => 0.2126 * r + 0.7152 * g + 0.0722 * b

const adaptSvgColorForDarkTheme = (value: string, role: "fill" | "stroke" | "color"): string => {
  const parsedColor = parseCssColor(value)
  if (!parsedColor || parsedColor.a === 0) {
    return value
  }

  const luminance = getColorLuminance(parsedColor)
  const isNearBlack = luminance < 70
  const isNearWhite = luminance > 230

  const { ink, surface } = resolveDarkThumbnailTokens()

  if (isNearBlack) {
    return ink
  }

  if (role === "fill" && isNearWhite) {
    return surface
  }

  return value
}

export const applyDarkThemeToThumbnailSvg = (svgString: string): string => {
  const parser = new DOMParser()
  const parsedDocument = parser.parseFromString(svgString, "image/svg+xml")
  const parseError = parsedDocument.querySelector("parsererror")
  const svgElement = parsedDocument.documentElement

  if (parseError || !svgElement || svgElement.tagName.toLowerCase() !== "svg") {
    return svgString
  }

  const rewriteStyleAttribute = (styleValue: string) => {
    const declarations = styleValue
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean)

    const rewritten = declarations.map((declaration) => {
      const separatorIndex = declaration.indexOf(":")
      if (separatorIndex < 0) return declaration
      const property = declaration.slice(0, separatorIndex).trim().toLowerCase()
      const rawValue = declaration.slice(separatorIndex + 1).trim()

      if (property === "fill" || property === "stroke" || property === "color") {
        const nextValue = adaptSvgColorForDarkTheme(
          rawValue,
          property as "fill" | "stroke" | "color"
        )
        return `${property}:${nextValue}`
      }

      return declaration
    })

    return rewritten.join(";")
  }

  const nodes = svgElement.querySelectorAll("*")
  for (const node of nodes) {
    const fill = node.getAttribute("fill")
    if (fill) {
      node.setAttribute("fill", adaptSvgColorForDarkTheme(fill, "fill"))
    }

    const stroke = node.getAttribute("stroke")
    if (stroke) {
      node.setAttribute("stroke", adaptSvgColorForDarkTheme(stroke, "stroke"))
    }

    const color = node.getAttribute("color")
    if (color) {
      node.setAttribute("color", adaptSvgColorForDarkTheme(color, "color"))
    }

    const style = node.getAttribute("style")
    if (style) {
      node.setAttribute("style", rewriteStyleAttribute(style))
    }
  }

  return new XMLSerializer().serializeToString(svgElement)
}

const pruneThumbnailThemeCache = () => {
  while (thumbnailThemeCache.size > THUMBNAIL_THEME_CACHE_LIMIT) {
    const oldestKey = thumbnailThemeCache.keys().next().value
    if (!oldestKey) {
      break
    }
    thumbnailThemeCache.delete(oldestKey)
  }
}

export const getCachedThumbnailSources = (
  cacheKey: string,
  svgString: string | null,
  { eager = false } = {}
): ThumbnailThemeSources | null => {
  if (!svgString) return null

  let cacheEntry = thumbnailThemeCache.get(cacheKey)
  if (!cacheEntry) {
    pruneThumbnailThemeCache()
    cacheEntry = {}
    thumbnailThemeCache.set(cacheKey, cacheEntry)
  }

  thumbnailThemeCache.delete(cacheKey)
  thumbnailThemeCache.set(cacheKey, cacheEntry)

  if (!cacheEntry.lightDataUrl) {
    cacheEntry.lightDataUrl = toSvgDataUrl(svgString)
  }

  if (eager) {
    if (!cacheEntry.darkSvg) {
      cacheEntry.darkSvg = applyDarkThemeToThumbnailSvg(svgString)
    }
    if (!cacheEntry.darkDataUrl) {
      cacheEntry.darkDataUrl = toSvgDataUrl(cacheEntry.darkSvg)
    }
  }

  return {
    lightDataUrl: cacheEntry.lightDataUrl,
    darkDataUrl: cacheEntry.darkDataUrl ?? cacheEntry.lightDataUrl,
  }
}
