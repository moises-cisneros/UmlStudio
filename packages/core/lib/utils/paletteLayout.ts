export const PALETTE = Object.freeze({
  CELL_MIN_H: 44,
  COMFORT_MIN_H: 64,
  CELL_MAX_H: 88,
  CELL_RATIO: 1.6,
  GAP: 8,
  PAD: 6,
  MAX_FRAC_W: 0.5,
  CONTENT_INSET: 6,
} as const)

export const COMPACT_PALETTE = Object.freeze({
  CELL_MIN_H: 44,
  COMFORT_MIN_H: 52,
  CELL_MAX_H: 56,
  CELL_RATIO: 1.6,
  GAP: 4,
  PAD: 4,
  MAX_FRAC_W: 0.5,
  CONTENT_INSET: 4,
} as const)

type PaletteMetrics = typeof PALETTE | typeof COMPACT_PALETTE

export interface PaletteLayout {
  cols: number
  cellW: number
  cellH: number
  scroll: boolean
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

function cellHeightFor(
  cols: number,
  count: number,
  budgetW: number,
  budgetH: number,
  chromeH: number,
  p: PaletteMetrics
): number {
  const rows = Math.ceil(count / cols)
  const fillH = (budgetH - chromeH - 2 * p.PAD - (rows - 1) * p.GAP) / rows
  const cellW = (budgetW - 2 * p.PAD - (cols - 1) * p.GAP) / cols
  const widthH = cellW / p.CELL_RATIO
  return Math.floor(Math.min(p.CELL_MAX_H, fillH, widthH))
}

export function computePaletteLayout(
  itemCount: number,
  availW: number,
  availH: number,
  chromeH: number,
  compact = false
): PaletteLayout {
  const p = compact ? COMPACT_PALETTE : PALETTE
  const floorCellW = Math.round(p.CELL_RATIO * p.CELL_MIN_H)
  if (itemCount <= 0 || availW <= 0 || availH <= 0) {
    return { cols: 1, cellW: floorCellW, cellH: p.CELL_MIN_H, scroll: false }
  }

  const budgetW = availW * p.MAX_FRAC_W
  const budgetH = availH
  const maxCols = Math.max(
    1,
    Math.min(itemCount, Math.floor((budgetW + p.GAP) / (floorCellW + p.GAP)))
  )

  let bestCols = 1
  let bestCellH = 0
  for (let cols = 1; cols <= maxCols; cols++) {
    const cellH = cellHeightFor(cols, itemCount, budgetW, budgetH, chromeH, p)
    if (cellH >= p.COMFORT_MIN_H) {
      return {
        cols,
        cellW: Math.round(p.CELL_RATIO * cellH),
        cellH,
        scroll: false,
      }
    }
    if (cellH > bestCellH) {
      bestCellH = cellH
      bestCols = cols
    }
  }

  const cellH = clamp(bestCellH, p.CELL_MIN_H, p.CELL_MAX_H)
  const rows = Math.ceil(itemCount / bestCols)
  const blockH = rows * cellH + (rows - 1) * p.GAP + 2 * p.PAD + chromeH
  return {
    cols: bestCols,
    cellW: Math.round(p.CELL_RATIO * cellH),
    cellH,
    scroll: blockH > budgetH + 1,
  }
}

export function previewScaleForCell(
  naturalWidth: number,
  naturalHeight: number,
  cellW: number,
  cellH: number,
  compact = false
): number {
  const metrics = compact ? COMPACT_PALETTE : PALETTE
  const inset = 2 * metrics.CONTENT_INSET
  return Math.min((cellW - inset) / naturalWidth, (cellH - inset) / naturalHeight)
}
