import { shortcutKeyName, type UmlStudioShortcutCombo } from "@umlstudio/core";
import { isMacLike } from "./platform";

export const keycaps = (isMac: boolean = isMacLike()) => ({
  isMac,
  mod: isMac ? "⌘" : "Ctrl",
  shift: isMac ? "⇧" : "Shift",
  alt: isMac ? "⌥" : "Alt",
  delete: isMac ? "⌫" : "Delete",
});

export type Keycaps = ReturnType<typeof keycaps>;

const keyCap = (key: string, caps: Keycaps): string =>
  ({
    Escape: "Esc",
    Delete: caps.delete,
    Backspace: caps.delete,
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
  })[key] ?? key.toUpperCase();

export const formatCombo = (
  combo: UmlStudioShortcutCombo,
  caps: Keycaps,
): string[] => {
  const modifiers = caps.isMac
    ? [combo.alt && caps.alt, combo.shift && caps.shift, combo.mod && caps.mod]
    : [combo.mod && caps.mod, combo.alt && caps.alt, combo.shift && caps.shift];
  return [
    ...modifiers.filter((modifier) => typeof modifier === "string"),
    keyCap(shortcutKeyName(combo), caps),
  ];
};

export const formatComboText = (
  combo: UmlStudioShortcutCombo,
  caps: Keycaps = keycaps(),
): string => formatCombo(combo, caps).join(caps.isMac ? "" : "+");
