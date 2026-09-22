import { Skeleton } from "@umlstudio/ui/components/skeleton"
import { Clock3, Tag } from "lucide-react"
import { useEffect, useRef, useState, type FC } from "react"
import { UmlStudioEditor, importDiagram } from "@umlstudio/core"
import { useVersionBodyQuery } from "@/queries/versionQueries"
import { useVersionRepositoryKind } from "@/contexts/VersionRepositoryContext"
import { log } from "@/logger"

const cache = new Map<string, string>()

let renderQueue: Promise<unknown> = Promise.resolve()
function enqueueRender<T>(fn: () => Promise<T>): Promise<T> {
  const next = renderQueue.then(fn, fn)
  renderQueue = next.catch(() => {})
  return next
}

interface Props {
  diagramId: string
  versionId: string
  size?: "compact" | "banner"
  isAuto?: boolean
}

function svgToDataUrl(svgText: string): string {
  const bytes = new TextEncoder().encode(svgText)
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return `data:image/svg+xml;base64,${btoa(binary)}`
}

export const VersionThumbnail: FC<Props> = ({
  diagramId,
  versionId,
  size = "banner",
  isAuto = false,
}) => {
  const kind = useVersionRepositoryKind()
  const compact = size === "compact"
  const cacheKey = `${kind}/${diagramId}/${versionId}`
  const [src, setSrc] = useState<string | null>(cache.get(cacheKey) ?? null)
  const [renderFailed, setRenderFailed] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (src) return
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        observer.disconnect()
        setIsVisible(true)
      },
      { rootMargin: "100px", threshold: 0.01 }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [src])

  const bodyQuery = useVersionBodyQuery(kind, diagramId, versionId, {
    enabled: isVisible && !src && !renderFailed,
  })

  useEffect(() => {
    const body = bodyQuery.data
    if (!isVisible || !body || src || renderFailed) return
    enqueueRender(() => {
      const model = importDiagram(body)
      return UmlStudioEditor.exportModelAsSvg(model, { svgMode: "compat" })
    })
      .then((result) => {
        const url = svgToDataUrl(result.svg)
        cache.set(cacheKey, url)
        setSrc(url)
      })
      .catch((err) => {
        log.error("Thumbnail render failed", err)
        setRenderFailed(true)
      })
  }, [bodyQuery.data, isVisible, src, renderFailed, cacheKey])

  const errored = renderFailed || bodyQuery.isError
  const KindIcon = isAuto ? Clock3 : Tag
  const w = compact ? 64 : 160
  const h = compact ? 40 : 100

  return (
    <div
      ref={ref}
      className="flex shrink-0 items-center justify-center overflow-hidden rounded bg-white"
      style={{
        width: w,
        height: h,
        color: isAuto ? "var(--home-text-muted)" : "var(--home-accent-base)",
      }}
      aria-hidden
    >
      {src ? (
        <img
          src={src}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block",
            padding: "2px",
            boxSizing: "border-box",
          }}
        />
      ) : errored ? (
        <KindIcon className={compact ? "size-4" : "size-6"} aria-hidden />
      ) : (
        <Skeleton className="rounded-none" style={{ width: w, height: h }} />
      )}
    </div>
  )
}
