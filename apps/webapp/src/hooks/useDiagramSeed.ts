import { useEffect, useState } from "react"
import { DiagramApiClient } from "@/services/DiagramApiClient"
import type { Diagram } from "@/types"

interface SeedState {
  diagram?: Diagram
  error?: unknown
  isPending: boolean
}

interface SeedResult {
  diagramId: string
  diagram?: Diagram
  error?: unknown
}

export function useDiagramSeed(diagramId: string | undefined, enabled: boolean): SeedState {
  const [result, setResult] = useState<SeedResult | null>(null)
  const wanted = diagramId && enabled ? diagramId : undefined

  useEffect(() => {
    if (!wanted) return

    const abort = new AbortController()
    DiagramApiClient.fetchDiagram(wanted, { signal: abort.signal })
      .then((diagram) => {
        if (!abort.signal.aborted) setResult({ diagramId: wanted, diagram })
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted) setResult({ diagramId: wanted, error })
      })

    return () => abort.abort()
  }, [wanted])

  const settled = wanted !== undefined && result?.diagramId === wanted
  return {
    diagram: settled ? result.diagram : undefined,
    error: settled ? result.error : undefined,
    isPending: !settled,
  }
}
