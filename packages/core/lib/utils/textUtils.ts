import { DEFAULT_FONT_SIZE, FONT_FAMILY } from "@/fontStack"

export const measureTextWidth = (() => {
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null
  const context = canvas?.getContext("2d")
  const defaultFont = `400 ${DEFAULT_FONT_SIZE}px ${FONT_FAMILY}`

  return (text: string, font: string = defaultFont): number => {
    const safeText = typeof text === "string" ? text : String(text ?? "")
    if (!context) return safeText.length * 8
    context.font = font
    return context.measureText(safeText).width
  }
})()
