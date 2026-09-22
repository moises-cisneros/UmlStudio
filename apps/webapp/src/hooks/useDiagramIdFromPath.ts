import { useLocation } from "@tanstack/react-router"

const RESERVED_TOP_LEVEL_PATHS: ReadonlySet<string> = new Set()

export function useDiagramIdFromPath(): string | undefined {
  const location = useLocation()
  const segments = location.pathname.split("/").filter(Boolean)
  const head = segments[0]
  if (!head) return undefined
  if (RESERVED_TOP_LEVEL_PATHS.has(head)) return undefined

  if (head === "shared" || head === "local") {
    return segments[1] || undefined
  }

  return head
}
