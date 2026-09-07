import { useLayoutEffect, useRef } from "react"

export function RegionMount({ el }: { el: HTMLElement }) {
  const hostRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.appendChild(el)
    return () => {
      if (el.parentNode === host) host.removeChild(el)
    }
  }, [el])
  return <div ref={hostRef} style={{ display: "contents" }} />
}
