import { useState, type RefCallback } from "react"

export function usePopoverAnchor<T extends Element = HTMLDivElement>(): [
  T | null,
  RefCallback<T>,
] {
  return useState<T | null>(null)
}
