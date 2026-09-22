import { createContext, use, useMemo, useState, useSyncExternalStore, type ReactNode } from "react"

interface PortalContainerContextValue {
  portalContainer: HTMLElement | null
  setPortalContainer: (container: HTMLDivElement | null) => void
}

const UmlStudioPortalContainerContext = createContext<PortalContainerContextValue | null>(null)

const fullscreenListeners = new Set<() => void>()
const notifyFullscreenListeners = () => {
  for (const listener of fullscreenListeners) listener()
}

function subscribeToFullscreen(listener: () => void): () => void {
  fullscreenListeners.add(listener)
  if (fullscreenListeners.size === 1) {
    document.addEventListener("fullscreenchange", notifyFullscreenListeners)
  }
  return () => {
    fullscreenListeners.delete(listener)
    if (fullscreenListeners.size === 0) {
      document.removeEventListener("fullscreenchange", notifyFullscreenListeners)
    }
  }
}

export function UmlStudioPortalContainerProvider({ children }: { children: ReactNode }) {
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null)
  const context = useMemo(() => ({ portalContainer, setPortalContainer }), [portalContainer])

  return (
    <UmlStudioPortalContainerContext value={context}>{children}</UmlStudioPortalContainerContext>
  )
}

export function UmlStudioPortalRoot() {
  const context = use(UmlStudioPortalContainerContext)
  return (
    <div
      ref={context?.setPortalContainer}
      className="umlstudio-editor__portal-root"
      data-umlstudio-portal-root=""
    />
  )
}

export function useUmlStudioPortalContainer(): HTMLElement {
  const portalContainer = use(UmlStudioPortalContainerContext)?.portalContainer ?? null
  const fullscreenElement = useSyncExternalStore(
    subscribeToFullscreen,
    () => document.fullscreenElement ?? null,
    () => null
  )

  const bodyExcludedFromFullscreen =
    fullscreenElement != null && !fullscreenElement.contains(document.body)
  if (
    portalContainer &&
    bodyExcludedFromFullscreen &&
    fullscreenElement.contains(portalContainer)
  ) {
    return portalContainer
  }
  return document.body
}
