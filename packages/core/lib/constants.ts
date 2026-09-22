import React from "react"
import { COOLORS_PALETTE } from "@umlstudio/ui/theme"
import { FONT_FAMILY, DEFAULT_FONT_SIZE } from "@/fontStack"
import { ClassSVG } from "@/components/svgs/nodes/classDiagram/ClassSVG"
import { PackageSVG } from "@/components/svgs/nodes/classDiagram/PackageSVG"
import { DiagramNodeType } from "@/nodes"
import { ClassStereotype, UMLDiagramType } from "@/types"
import { CANVAS, EDGES, INTERFACE } from "@/utils/geometry/routingConstants"

export { CANVAS, EDGES, INTERFACE }

export const CSS_VARIABLE_FALLBACKS: Readonly<Record<string, string>> = Object.freeze({
  "--umlstudio-primary": COOLORS_PALETTE.dodgerBlue,
  "--umlstudio-primary-foreground": "#ffffff",
  "--umlstudio-foreground": "#000000",
  "--umlstudio-secondary": "#54606f",
  "--umlstudio-interactive-selection": COOLORS_PALETTE.dodgerBlue,
  "--umlstudio-dropzone-accent": COOLORS_PALETTE.dodgerBlue,
  "--umlstudio-on-collaboration-cursor": "#ffffff",
  "--umlstudio-assessment-positive-text": "#166534",
  "--umlstudio-assessment-positive-bg": "#dcfce7",
  "--umlstudio-assessment-negative-text": "#991b1b",
  "--umlstudio-assessment-negative-bg": "#fee2e2",
  "--umlstudio-assessment-zero-text": "#1e40af",
  "--umlstudio-assessment-zero-bg": "#dbeafe",
  "--umlstudio-collaboration-color-1": "#ffb61e",
  "--umlstudio-collaboration-color-2": "#37b24d",
  "--umlstudio-collaboration-color-3": "#1c7ed6",
  "--umlstudio-collaboration-color-4": "#f03e3e",
  "--umlstudio-collaboration-color-5": COOLORS_PALETTE.periwinkle,
  "--umlstudio-collaboration-color-6": "#0ca678",
  "--umlstudio-collaboration-color-7": "#f76707",
  "--umlstudio-collaboration-color-8": "#1098ad",
  "--umlstudio-guide-vertical": "#d63031",
  "--umlstudio-guide-horizontal": COOLORS_PALETTE.dodgerBlue,
  "--umlstudio-swatch-slate": "#64748b",
  "--umlstudio-swatch-red": "#dc2626",
  "--umlstudio-swatch-orange": "#ea580c",
  "--umlstudio-swatch-amber": "#d97706",
  "--umlstudio-swatch-green": "#16a34a",
  "--umlstudio-swatch-teal": "#0d9488",
  "--umlstudio-swatch-blue": COOLORS_PALETTE.dodgerBlue,
  "--umlstudio-swatch-violet": COOLORS_PALETTE.periwinkle,
  "--umlstudio-swatch-pink": "#db2777",
  "--umlstudio-background": "#ffffff",
  "--umlstudio-background-variant": "#f8f9fa",
  "--umlstudio-hover-neutral":
    "color-mix(in srgb, var(--umlstudio-foreground, #000000) 7.5%, transparent)",
  "--umlstudio-gray": "#e9ecef",
  "--umlstudio-grid": "rgba(36, 39, 36, 0.1)",
  "--umlstudio-gray-variant": "#495057",
  "--umlstudio-danger": "#ef4444",
})

export const STROKE_COLOR = CSS_VARIABLE_FALLBACKS["--umlstudio-foreground"]
export const FILL_COLOR = CSS_VARIABLE_FALLBACKS["--umlstudio-background"]

export { FONT_FAMILY, DEFAULT_FONT_SIZE }
export const INTERACTIVE_SELECTION_COLOR = `var(--umlstudio-interactive-selection, ${CSS_VARIABLE_FALLBACKS["--umlstudio-interactive-selection"]})`
export const INTERACTIVE_SELECTION_FILL = `color-mix(in srgb, var(--umlstudio-interactive-selection, ${CSS_VARIABLE_FALLBACKS["--umlstudio-interactive-selection"]}) 18%, transparent)`
export const INTERACTIVE_SELECTION_FILL_FAINT = `color-mix(in srgb, var(--umlstudio-interactive-selection, ${CSS_VARIABLE_FALLBACKS["--umlstudio-interactive-selection"]}) 10%, transparent)`
export const INTERACTIVE_SELECTION_STROKE_SOFT = `color-mix(in srgb, var(--umlstudio-interactive-selection, ${CSS_VARIABLE_FALLBACKS["--umlstudio-interactive-selection"]}) 50%, transparent)`
export const INTERACTIVE_SELECTION_FILL_STRONG = `color-mix(in srgb, var(--umlstudio-interactive-selection, ${CSS_VARIABLE_FALLBACKS["--umlstudio-interactive-selection"]}) 50%, transparent)`

export const COLLAB_CURSOR_PALETTE: ReadonlyArray<string> = Object.freeze(
  Array.from(
    { length: 8 },
    (_, i) =>
      `var(--umlstudio-collaboration-color-${i + 1}, ${
        CSS_VARIABLE_FALLBACKS[`--umlstudio-collaboration-color-${i + 1}`]
      })`
  )
)

export const LAYOUT = Object.freeze({
  DEFAULT_FONT: `400 ${DEFAULT_FONT_SIZE}px ${FONT_FAMILY}`,
  DEFAULT_HEADER_HEIGHT: 40,
  DEFAULT_HEADER_HEIGHT_WITH_STEREOTYPE: 50,
  DEFAULT_ATTRIBUTE_HEIGHT: 30,
  DEFAULT_METHOD_HEIGHT: 30,
  DEFAULT_PADDING: 10,
  LINE_WIDTH: 2,
  LINE_WIDTH_INTERFACE: 2,
  LINE_WIDTH_EDGE: 2,
  ICON_LINE_WIDTH: 1.5,
  NAME_FONT_SIZE: DEFAULT_FONT_SIZE,
  NAME_LINE_HEIGHT: Math.round(DEFAULT_FONT_SIZE * 1.2),
  STEREOTYPE_LINE_HEIGHT: 15,
  STEREOTYPE_NAME_GAP: 4,
} as const)

export const MOBILE_VIEW_QUERY = "(max-width: 767.95px), (max-width: 950px) and (max-height: 500px)"

export const generateUUID = (): string => {
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"))
  return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h.slice(6, 8).join("")}-${h.slice(8, 10).join("")}-${h.slice(10, 16).join("")}`
}

export const MARKER_BASE_SIZE = 18
const RHOMBUS_MARKER_SIZE = 24
const RHOMBUS_HEIGHT_FACTOR = 0.618

export const ZINDEX = Object.freeze({
  BASE: 0,
  HEADER_SWITCH: 1,
  DRAGGABLE_GHOST: 2,
  MINIMAP: 5,
  PANEL: 10,
  MODAL: 9998,
  LABEL: 9998,
  DRAGGABLE_ELEMENT: 9999,
  TOOLTIP: 10000,
} as const)

export type MarkerShape = "triangle" | "arrow" | "rhombus" | "circle" | "semicircle"

export interface MarkerConfig {
  readonly type: MarkerShape
  readonly filled: boolean
  readonly size: number
  readonly widthFactor: number
  readonly heightFactor: number
  readonly arcSpanDegrees?: number
}

export const MARKER_CONFIGS = Object.freeze({
  "black-rhombus": {
    type: "rhombus",
    filled: true,
    size: RHOMBUS_MARKER_SIZE,
    widthFactor: 1.0,
    heightFactor: RHOMBUS_HEIGHT_FACTOR,
  },
  "white-rhombus": {
    type: "rhombus",
    filled: false,
    size: RHOMBUS_MARKER_SIZE,
    widthFactor: 1.0,
    heightFactor: RHOMBUS_HEIGHT_FACTOR,
  },
  "white-triangle": {
    type: "triangle",
    filled: false,
    size: MARKER_BASE_SIZE,
    widthFactor: 1.0,
    heightFactor: 0.866,
  },
  "black-triangle": {
    type: "triangle",
    filled: true,
    size: MARKER_BASE_SIZE,
    widthFactor: 1.0,
    heightFactor: 0.866,
  },
  "black-arrow": {
    type: "arrow",
    filled: false,
    size: MARKER_BASE_SIZE,
    widthFactor: 1.0,
    heightFactor: 0.866,
  },
} as const satisfies Record<string, MarkerConfig>)

export type MarkerId = keyof typeof MARKER_CONFIGS

export const MARKERS = Object.freeze({
  STROKE_WIDTH: Object.freeze({
    triangle: 1.3,
    arrow: 1.5,
    rhombus: 1.3,
    circle: 1.3,
    semicircle: 2,
  } as const satisfies Record<MarkerShape, number>),
} as const)

export const DROPS = Object.freeze({
  SIDEBAR_PREVIEW_SCALE: 0.8,
  DEFAULT_ELEMENT_WIDTH: 160,
  TAP_SLOP_MOUSE_PX: 8,
  TAP_SLOP_TOUCH_PX: 16,
  TAP_CASCADE_PX: CANVAS.PASTE_OFFSET_PX,
} as const)

export type DropElementConfig = {
  readonly type: DiagramNodeType
  readonly width: number
  readonly height: number
  readonly dropWidth?: number
  readonly dropHeight?: number
  readonly defaultData?: Record<string, unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly svg: React.FC<any>
  readonly marginTop?: number
  readonly isAssociationClass?: boolean
}

export const dropElementConfigs: Readonly<
  Record<UMLDiagramType, ReadonlyArray<DropElementConfig>>
> = Object.freeze({
  [UMLDiagramType.ClassDiagram]: [
    {
      type: "package",
      width: DROPS.DEFAULT_ELEMENT_WIDTH,
      height: 120,
      defaultData: { name: "Package" },
      svg: PackageSVG,
    },
    {
      type: "class",
      width: DROPS.DEFAULT_ELEMENT_WIDTH,
      height: 100,
      defaultData: {
        name: "Class",
        methods: [],
        attributes: [],
      },
      svg: ClassSVG,
    },
    {
      type: "class",
      width: DROPS.DEFAULT_ELEMENT_WIDTH,
      height: 100,
      defaultData: {
        name: "Abstract",
        isAbstract: true,
        methods: [],
        attributes: [],
      },
      svg: ClassSVG,
    },
    {
      type: "class",
      width: DROPS.DEFAULT_ELEMENT_WIDTH,
      height: 140,
      defaultData: {
        name: "Enumeration",
        stereotype: ClassStereotype.Enumeration,
        methods: [],
        attributes: [
          { id: generateUUID(), name: "Case 1" },
          { id: generateUUID(), name: "Case 2" },
          { id: generateUUID(), name: "Case 3" },
        ],
      },
      svg: ClassSVG,
    },
    {
      type: "class",
      width: DROPS.DEFAULT_ELEMENT_WIDTH,
      height: 110,
      defaultData: {
        name: "Interface",
        stereotype: ClassStereotype.Interface,
        methods: [],
        attributes: [],
      },
      svg: ClassSVG,
    },
    {
      type: "class",
      width: DROPS.DEFAULT_ELEMENT_WIDTH,
      height: 110,
      isAssociationClass: true,
      defaultData: {
        name: "AssociationClass",
        stereotype: ClassStereotype.Association,
        methods: [],
        attributes: [],
        isAssociationClass: true,
      },
      svg: ClassSVG,
    },
  ],
})
