export const NATIVE_COLOR_INPUT_FALLBACK = "#000000"

export const SWATCH_NAMES = [
  "slate",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
] as const

export type SwatchName = (typeof SWATCH_NAMES)[number]
