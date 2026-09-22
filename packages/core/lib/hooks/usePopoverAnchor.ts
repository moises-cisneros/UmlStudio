import { useState, type RefCallback } from "react"

export function usePopoverAnchor<T extends Element = HTMLDivElement>(): [T | null, RefCallback<T>] {
  const [anchor, setAnchor] = useState<T | null>(null)
  return [anchor, setAnchor]
}
