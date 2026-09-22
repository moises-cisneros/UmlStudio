import { useMemo } from "react"
import { useInternalNode } from "@xyflow/react"
import { useDiagramStore, useEdgeGeometryStore } from "@/store"
import {
  computeInterfaceLabelSide,
  type InterfaceLabelSide,
} from "@/utils/geometry/interfaceLabelLayout"

export function useInterfaceLabelSide(
  id: string,
  opts?: { badgeTopRight?: boolean }
): InterfaceLabelSide {
  const edges = useDiagramStore((state) => state.edges)
  const internal = useInternalNode(id)
  const rectX = internal?.internals.positionAbsolute.x
  const rectY = internal?.internals.positionAbsolute.y
  const rectWidth = internal?.measured.width
  const rectHeight = internal?.measured.height
  const geometryById = useEdgeGeometryStore((state) => state.geometryById)
  return useMemo(() => {
    const rect =
      rectX !== undefined && rectY !== undefined && rectWidth && rectHeight
        ? { x: rectX, y: rectY, width: rectWidth, height: rectHeight }
        : undefined
    return computeInterfaceLabelSide(edges, id, {
      badgeTopRight: opts?.badgeTopRight,
      geometry: rect ? { rect, routeById: geometryById } : undefined,
    })
  }, [edges, id, opts?.badgeTopRight, rectX, rectY, rectWidth, rectHeight, geometryById])
}
