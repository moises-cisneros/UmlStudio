import { useCallback, useEffect, useMemo, useRef } from "react"

export type ThumbnailViewportPriority = {
  observe: (id: string, node: Element | null) => () => void
  pickNext: (candidateIds: Iterable<string>) => string | null
}

const VIEWPORT_PREWARM_MARGIN = "320px 0px"

type VisibleEntry = {
  top: number
}

export const useThumbnailViewportPriority = (): ThumbnailViewportPriority => {
  const visibleRef = useRef(new Map<string, VisibleEntry>())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const nodeToIdRef = useRef(new Map<Element, string>())

  const ensureObserver = useCallback(() => {
    if (observerRef.current || typeof IntersectionObserver === "undefined") {
      return observerRef.current
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = visibleRef.current
        for (const entry of entries) {
          const id = nodeToIdRef.current.get(entry.target)
          if (!id) continue
          if (entry.isIntersecting) {
            visible.set(id, { top: entry.boundingClientRect.top })
          } else {
            visible.delete(id)
          }
        }
      },
      { rootMargin: VIEWPORT_PREWARM_MARGIN, threshold: 0 }
    )
    observerRef.current = observer
    return observer
  }, [])

  const observe = useCallback(
    (id: string, node: Element | null) => {
      if (!node) return () => {}
      const observer = ensureObserver()
      if (!observer) return () => {}

      nodeToIdRef.current.set(node, id)
      observer.observe(node)

      return () => {
        observer.unobserve(node)
        nodeToIdRef.current.delete(node)
        visibleRef.current.delete(id)
      }
    },
    [ensureObserver]
  )

  const pickNext = useCallback((candidateIds: Iterable<string>) => {
    const visible = visibleRef.current
    if (visible.size === 0) return null

    let bestId: string | null = null
    let bestTop = Number.POSITIVE_INFINITY
    for (const id of candidateIds) {
      const entry = visible.get(id)
      if (!entry) continue
      if (entry.top < bestTop) {
        bestTop = entry.top
        bestId = id
      }
    }
    return bestId
  }, [])

  useEffect(() => {
    const observerRef_ = observerRef
    const nodeToId = nodeToIdRef.current
    const visible = visibleRef.current
    return () => {
      observerRef_.current?.disconnect()
      observerRef_.current = null
      nodeToId.clear()
      visible.clear()
    }
  }, [])

  return useMemo(() => ({ observe, pickNext }), [observe, pickNext])
}
