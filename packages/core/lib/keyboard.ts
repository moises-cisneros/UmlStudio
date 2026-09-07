interface UmlStudioShortcutModifiers {
  readonly mod?: boolean
  readonly shift?: boolean
  readonly alt?: boolean
}

export type UmlStudioShortcutCombo = UmlStudioShortcutModifiers &
  (
    | { readonly key: string; readonly code?: never }
    | { readonly code: string; readonly key?: never }
  )

export type UmlStudioShortcutId =
  | "select-all"
  | "clear-selection"
  | "delete"
  | "copy"
  | "cut"
  | "paste"
  | "duplicate"
  | "move-selection"
  | "undo"
  | "redo"
  | "zoom-in"
  | "zoom-out"
  | "reset-zoom"
  | "fit-view"
  | "zoom-to-selection"

type CanvasHandledId = "move-selection"

type HandledShortcutId = Exclude<UmlStudioShortcutId, CanvasHandledId>

interface UmlStudioShortcutBase {
  readonly combos: readonly [UmlStudioShortcutCombo, ...UmlStudioShortcutCombo[]]
  readonly requiresModifiable: boolean
}

export type UmlStudioShortcut =
  | (UmlStudioShortcutBase & {
      readonly id: HandledShortcutId
      readonly canvasHandled?: never
    })
  | (UmlStudioShortcutBase & {
      readonly id: CanvasHandledId
      readonly canvasHandled: true
    })

export const UMLSTUDIO_SHORTCUTS: readonly UmlStudioShortcut[] = [
  {
    id: "select-all",
    combos: [{ key: "a", mod: true }],
    requiresModifiable: false,
  },
  {
    id: "clear-selection",
    combos: [{ key: "Escape" }],
    requiresModifiable: false,
  },

  {
    id: "delete",
    combos: [{ key: "Delete" }, { key: "Backspace" }],
    requiresModifiable: true,
  },
  { id: "copy", combos: [{ key: "c", mod: true }], requiresModifiable: false },
  { id: "cut", combos: [{ key: "x", mod: true }], requiresModifiable: true },
  { id: "paste", combos: [{ key: "v", mod: true }], requiresModifiable: true },
  {
    id: "duplicate",
    combos: [{ key: "d", mod: true }],
    requiresModifiable: true,
  },
  {
    id: "move-selection",
    combos: [
      { key: "ArrowUp" },
      { key: "ArrowDown" },
      { key: "ArrowLeft" },
      { key: "ArrowRight" },
    ],
    requiresModifiable: true,
    canvasHandled: true,
  },

  { id: "undo", combos: [{ key: "z", mod: true }], requiresModifiable: true },
  {
    id: "redo",
    combos: [
      { key: "z", mod: true, shift: true },
      { key: "y", mod: true },
    ],
    requiresModifiable: true,
  },

  {
    id: "zoom-in",
    combos: [
      { key: "=", mod: true },
      { key: "+", mod: true },
      { key: "+", mod: true, shift: true },
    ],
    requiresModifiable: false,
  },
  {
    id: "zoom-out",
    combos: [
      { key: "-", mod: true },
      { key: "_", mod: true, shift: true },
    ],
    requiresModifiable: false,
  },
  {
    id: "reset-zoom",
    combos: [
      { code: "Digit0", mod: true },
      { code: "Digit0", mod: true, shift: true },
      { code: "Numpad0", mod: true },
    ],
    requiresModifiable: false,
  },
  {
    id: "fit-view",
    combos: [{ code: "Digit1", mod: true, shift: true }],
    requiresModifiable: false,
  },
  {
    id: "zoom-to-selection",
    combos: [{ code: "Digit2", mod: true, shift: true }],
    requiresModifiable: false,
  },
]

export function matchesShortcutCombo(
  event: Pick<
    KeyboardEvent,
    "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey"
  >,
  combo: UmlStudioShortcutCombo
): boolean {
  if (!!combo.mod !== (event.ctrlKey || event.metaKey)) return false
  if (!!combo.shift !== event.shiftKey) return false
  if (!!combo.alt !== event.altKey) return false
  return combo.code !== undefined
    ? event.code === combo.code
    : combo.key.toLowerCase() === event.key.toLowerCase()
}

export function shortcutKeyName(combo: UmlStudioShortcutCombo): string {
  return combo.key ?? combo.code.replace(/^(Key|Digit|Numpad)/, "")
}

const ARIA_KEY_NAMES: Record<string, string> = { "+": "Plus" }

export function ariaKeyshortcuts(id: UmlStudioShortcutId): string {
  const shortcut = UMLSTUDIO_SHORTCUTS.find((entry) => entry.id === id)!
  const combos = shortcut.combos.flatMap((combo) => {
    const raw = shortcutKeyName(combo)
    const tail = [
      ...(combo.alt ? ["Alt"] : []),
      ...(combo.shift ? ["Shift"] : []),
      ARIA_KEY_NAMES[raw] ?? (raw.length === 1 ? raw.toUpperCase() : raw),
    ]
    return combo.mod
      ? [["Control", ...tail].join("+"), ["Meta", ...tail].join("+")]
      : [tail.join("+")]
  })
  return [...new Set(combos)].join(" ")
}

const TYPING_TAGS = ["INPUT", "SELECT", "TEXTAREA"]

export function isTypingElement(target: Element | null): boolean {
  if (target?.nodeType !== 1) return false
  return (
    TYPING_TAGS.includes(target.nodeName) ||
    !!target.closest('[contenteditable]:not([contenteditable="false"]), .nokey')
  )
}

export function isTypingTarget(event: KeyboardEvent): boolean {
  const target = (event.composedPath?.()[0] ?? event.target) as Element | null
  return isTypingElement(target)
}

const OVERLAY_ROLES =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="combobox"]'

export function isElementInOverlay(element: Element | null): boolean {
  if (element?.nodeType !== 1) return false
  const overlay = element.closest(OVERLAY_ROLES)
  return !!overlay && !overlay.querySelector(".umlstudio-editor")
}

export function isInsideOverlay(event: KeyboardEvent): boolean {
  const target = (event.composedPath?.()[0] ?? event.target) as Element | null
  return isElementInOverlay(target)
}

const REPEATABLE: ReadonlySet<HandledShortcutId> = new Set([
  "undo",
  "redo",
  "zoom-in",
  "zoom-out",
])

export interface KeyboardShortcutDeps {
  actions: Record<HandledShortcutId, () => boolean | void>
  isDiagramModifiable: () => boolean
}

export function handleShortcutKeydown(
  event: KeyboardEvent,
  { actions, isDiagramModifiable }: KeyboardShortcutDeps
): void {
  if (event.defaultPrevented) return
  if (event.isComposing) return
  if (isTypingTarget(event)) return
  if (isInsideOverlay(event)) return

  for (const shortcut of UMLSTUDIO_SHORTCUTS) {
    if (!shortcut.combos.some((combo) => matchesShortcutCombo(event, combo))) {
      continue
    }
    if (shortcut.canvasHandled) return
    if (shortcut.requiresModifiable && !isDiagramModifiable()) return
    if (event.repeat && !REPEATABLE.has(shortcut.id)) {
      event.preventDefault()
      return
    }
    if (actions[shortcut.id]() !== false) event.preventDefault()
    return
  }
}
