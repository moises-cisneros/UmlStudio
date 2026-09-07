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
