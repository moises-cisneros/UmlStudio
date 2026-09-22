import { useEffect, useRef } from "react"
import type { UMLModel } from "@umlstudio/core"
import { serverURL } from "@/constants"

interface Options {
  diagramId: string | undefined
  getModel: () => UMLModel | undefined
  isDirty: () => boolean
}

export function useFlushOnUnload(opts: Options) {
  const optsRef = useRef(opts)
  // eslint-disable-next-line react-hooks/refs
  optsRef.current = opts

  useEffect(() => {
    const handler = () => {
      const { diagramId, getModel, isDirty } = optsRef.current
      if (!diagramId || !isDirty()) return
      const model = getModel()
      if (!model) return
      void fetch(`${serverURL}/api/diagrams/${diagramId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(model),
        keepalive: true,
        credentials: "include",
      })
    }
    window.addEventListener("pagehide", handler)
    return () => window.removeEventListener("pagehide", handler)
  }, [])
}
