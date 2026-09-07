import { useState } from "react"

export function useStableValue<T>(
  value: T,
  isEqual: (a: T, b: T) => boolean
): T {
  const [stable, setStable] = useState(value)
  if (stable !== value && !isEqual(stable, value)) {
    setStable(value)
    return value
  }
  return stable
}
