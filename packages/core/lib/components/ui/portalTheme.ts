import React from "react"

export const UMLSTUDIO_PORTAL_THEME_VARS = [
  "--umlstudio-primary",
  "--umlstudio-primary-foreground",
  "--umlstudio-foreground",
  "--umlstudio-secondary",
  "--umlstudio-background",
  "--umlstudio-background-variant",
  "--umlstudio-gray",
  "--umlstudio-gray-variant",
  "--umlstudio-grid",
  "--umlstudio-guide-vertical",
  "--umlstudio-guide-horizontal",
  "--umlstudio-danger",
  "--umlstudio-surface",
  "--umlstudio-surface-sunken",
  "--umlstudio-border",
  "--umlstudio-border-subtle",
  "--umlstudio-radius",
  "--umlstudio-radius-sm",
  "--umlstudio-radius-md",
  "--umlstudio-radius-lg",
  "--umlstudio-shadow",
  "--umlstudio-hover-neutral",
  "--umlstudio-on-collaboration-cursor",
  "--umlstudio-interactive-selection",
  "--umlstudio-swatch-slate",
  "--umlstudio-swatch-red",
  "--umlstudio-swatch-orange",
  "--umlstudio-swatch-amber",
  "--umlstudio-swatch-green",
  "--umlstudio-swatch-teal",
  "--umlstudio-swatch-blue",
  "--umlstudio-swatch-violet",
  "--umlstudio-swatch-pink",
  "--umlstudio-assessment-positive-text",
  "--umlstudio-assessment-positive-bg",
  "--umlstudio-assessment-negative-text",
  "--umlstudio-assessment-negative-bg",
  "--umlstudio-assessment-zero-text",
  "--umlstudio-assessment-zero-bg",
  "--umlstudio-assessment-ungraded-text",
  "--umlstudio-assessment-ungraded-bg",
  "--panel-background",
  "--panel-shadow",
  "--text",
  "--popover-divider",
  "--home-surface-sunken",
  "--home-surface-raised",
  "--home-border-default",
  "--home-text-secondary",
  "--home-text-muted",
  "--home-accent-contrast",
  "--home-shadow-overlay",
  "--home-radius-md",
  "--home-radius-lg",
] as const

export function resolveUmlStudioThemeVars(
  anchor: Element | null | undefined
): React.CSSProperties {
  const source = anchor?.closest(".umlstudio-editor") ?? anchor
  if (!source) return {}

  const computed = getComputedStyle(source)
  const resolved: Record<string, string> = {}
  for (const variable of UMLSTUDIO_PORTAL_THEME_VARS) {
    const value = computed.getPropertyValue(variable).trim()
    if (value) resolved[variable] = value
  }
  return resolved as React.CSSProperties
}

let themeVersion = 0
const themeListeners = new Set<() => void>()
let stopObservingTheme: (() => void) | undefined

const bumpThemeVersion = () => {
  themeVersion += 1
  for (const listener of themeListeners) listener()
}

function observeTheme(): () => void {
  const observer = new MutationObserver(bumpThemeVersion)

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "class", "style"],
  })
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  })
  observer.observe(document, {
    subtree: true,
    attributes: true,
    attributeFilter: ["data-theme"],
  })
  observer.observe(document.head, { childList: true })

  const media = window.matchMedia?.("(prefers-color-scheme: dark)")
  media?.addEventListener("change", bumpThemeVersion)

  return () => {
    observer.disconnect()
    media?.removeEventListener("change", bumpThemeVersion)
  }
}

const subscribeToTheme = (listener: () => void): (() => void) => {
  themeListeners.add(listener)
  stopObservingTheme ??= observeTheme()
  return () => {
    themeListeners.delete(listener)
    if (themeListeners.size === 0) {
      stopObservingTheme?.()
      stopObservingTheme = undefined
    }
  }
}

const getThemeVersion = () => themeVersion

const useUmlStudioThemeVersion = (): number =>
  React.useSyncExternalStore(subscribeToTheme, getThemeVersion, getThemeVersion)

export function usePortalThemeVars(
  anchor: Element | null | undefined
): React.CSSProperties {
  const version = useUmlStudioThemeVersion()
  return React.useMemo(() => {
    void version
    return resolveUmlStudioThemeVars(anchor)
  }, [anchor, version])
}
