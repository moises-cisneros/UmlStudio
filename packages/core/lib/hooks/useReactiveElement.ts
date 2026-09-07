import { useStore } from "@xyflow/react"

export function useReactiveEdge(id: string) {
  return useStore((s) => s.edgeLookup.get(id))
}

export function useReactiveNode(id: string) {
  return useStore((s) => s.nodeLookup.get(id))
}

export function useReactiveNodeName(
  id: string | undefined,
  fallback: string
): string {
  return useStore(
    (s) => (id && (s.nodeLookup.get(id)?.data?.name as string)) || fallback
  )
}
