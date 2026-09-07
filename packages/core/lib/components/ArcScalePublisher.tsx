import { useStore } from "@xyflow/react"
import { useLayoutEffect } from "react"
import { getHandleScreenScale } from "@/utils/geometry/scalar"

export const ArcScalePublisher = () => {
  const domNode = useStore((state) => state.domNode)
  const scale = useStore((state) => getHandleScreenScale(state.transform[2]))

  useLayoutEffect(() => {
    domNode?.style.setProperty("--arc-scale", String(scale))
  }, [domNode, scale])

  return null
}
