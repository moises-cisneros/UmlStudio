export interface UmlStudioTheme {
  primary?: string
  primaryForeground?: string
  foreground?: string
  secondary?: string
  background?: string
  backgroundVariant?: string
  gray?: string
  grayVariant?: string
  grid?: string
  guideVertical?: string
  guideHorizontal?: string
  danger?: string
  surface?: string
  surfaceSunken?: string
  border?: string
  borderSubtle?: string
  radius?: string
  accent?: string
  accentSoft?: string
  tint?: string
}

const TOKEN_VAR_MAP: Record<keyof UmlStudioTheme, `--umlstudio-${string}`> = {
  primary: "--umlstudio-primary",
  primaryForeground: "--umlstudio-primary-foreground",
  foreground: "--umlstudio-foreground",
  secondary: "--umlstudio-secondary",
  background: "--umlstudio-background",
  backgroundVariant: "--umlstudio-background-variant",
  gray: "--umlstudio-gray",
  grayVariant: "--umlstudio-gray-variant",
  grid: "--umlstudio-grid",
  guideVertical: "--umlstudio-guide-vertical",
  guideHorizontal: "--umlstudio-guide-horizontal",
  danger: "--umlstudio-danger",
  surface: "--umlstudio-surface",
  surfaceSunken: "--umlstudio-surface-sunken",
  border: "--umlstudio-border",
  borderSubtle: "--umlstudio-border-subtle",
  radius: "--umlstudio-radius",
  accent: "--umlstudio-accent",
  accentSoft: "--umlstudio-accent-soft",
  tint: "--umlstudio-tint",
}

export function createUmlStudioTheme(
  theme: UmlStudioTheme
): Record<`--umlstudio-${string}`, string> {
  const style: Record<`--umlstudio-${string}`, string> = {}
  for (const key of Object.keys(TOKEN_VAR_MAP) as (keyof UmlStudioTheme)[]) {
    const value = theme[key]
    if (value !== undefined) {
      style[TOKEN_VAR_MAP[key]] = value
    }
  }
  return style
}

export const COOLORS_PALETTE = {
  lavenderVeil: "#f1e3f3",
  periwinkle: "#c2bbf0",
  babyBlueIce: "#8fb8ed",
  deepSkyBlue: "#62bfed",
  dodgerBlue: "#3590f3",
} as const

export const DEFAULT_LIGHT_THEME: UmlStudioTheme = {
  primary: COOLORS_PALETTE.dodgerBlue,
  primaryForeground: "#ffffff",
  foreground: "#12161f",
  secondary: "#54606f",
  background: "#ffffff",
  backgroundVariant: "#f8fafc",
  gray: "#e9ecef",
  grayVariant: "#495057",
  grid: "rgba(36, 39, 36, 0.08)",
  guideVertical: "#d63031",
  guideHorizontal: COOLORS_PALETTE.dodgerBlue,
  danger: "#ef4444",
  surface: "#ffffff",
  surfaceSunken: "#f1f5f9",
  border: "#cbd5e1",
  borderSubtle: "#e2e8f0",
  radius: "6px",
  accent: COOLORS_PALETTE.deepSkyBlue,
  accentSoft: COOLORS_PALETTE.babyBlueIce,
  tint: COOLORS_PALETTE.periwinkle,
}

export const DEFAULT_DARK_THEME: UmlStudioTheme = {
  primary: COOLORS_PALETTE.dodgerBlue,
  primaryForeground: "#ffffff",
  foreground: "#f8fafc",
  secondary: "#94a3b8",
  background: "#0b0f19",
  backgroundVariant: "#101626",
  gray: "#1e293b",
  grayVariant: "#475569",
  grid: "rgba(98, 191, 237, 0.08)",
  guideVertical: "#d63031",
  guideHorizontal: COOLORS_PALETTE.dodgerBlue,
  danger: "#f87171",
  surface: "#151d2e",
  surfaceSunken: "#0c101a",
  border: "#243046",
  borderSubtle: "#192233",
  radius: "6px",
  accent: COOLORS_PALETTE.deepSkyBlue,
  accentSoft: "rgba(98, 191, 237, 0.2)",
  tint: COOLORS_PALETTE.periwinkle,
}
