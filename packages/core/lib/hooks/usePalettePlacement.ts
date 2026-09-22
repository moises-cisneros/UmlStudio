import { useCallback } from "react"
import { useReactFlow, type Node, type XYPosition } from "@xyflow/react"
import { useShallow } from "zustand/shallow"
import { CANVAS, DROPS, type DropElementConfig } from "@/constants"
import {
  buildPaletteNode,
  getPositionOnCanvas,
  isParentNodeType,
  resizeAllParents,
  resolveTapPosition,
  snapToGrid,
} from "@/utils"
import { canDropIntoParent } from "@/utils/parentConstraints"
import { useDiagramStore } from "@/store/context"
import { log } from "../logger"

export function usePalettePlacement(dropElementConfig: DropElementConfig) {
  const snapPx = CANVAS.SNAP_TO_GRID_PX
  const { screenToFlowPosition, getIntersectingNodes } = useReactFlow()
  const {
    diagramId,
    nodes,
    setNodes,
    edges,
    setEdges,
    selectedElementIds,
    setSelectedElementsId,
    lastPlacedElementId,
    setLastPlacedElementId,
    setAssociationClassPrompt,
  } = useDiagramStore(
    useShallow((state) => ({
      diagramId: state.diagramId,
      nodes: state.nodes,
      setNodes: state.setNodes,
      edges: state.edges,
      setEdges: state.setEdges,
      selectedElementIds: state.selectedElementIds,
      setSelectedElementsId: state.setSelectedElementsId,
      lastPlacedElementId: state.lastPlacedElementId,
      setLastPlacedElementId: state.setLastPlacedElementId,
      setAssociationClassPrompt: state.setAssociationClassPrompt,
    }))
  )

  const getCanvas = useCallback(
    () => document.getElementById(`react-flow-library-${diagramId}`),
    [diagramId]
  )

  const findDropParent = useCallback(
    (hitPoint: XYPosition): Node | undefined => {
      const intersecting = getIntersectingNodes({
        x: hitPoint.x,
        y: hitPoint.y,
        width: CANVAS.MOUSE_UP_OFFSET_PX,
        height: CANVAS.MOUSE_UP_OFFSET_PX,
      }).filter(
        (node) =>
          isParentNodeType(node.type) &&
          node.type &&
          canDropIntoParent(dropElementConfig.type, node.type)
      )
      return intersecting[intersecting.length - 1]
    },
    [getIntersectingNodes, dropElementConfig.type]
  )

  const nestInParent = useCallback(
    (absolute: XYPosition): { position: XYPosition; parentId?: string } => {
      const parent = findDropParent(absolute)
      if (!parent) return { position: absolute }
      const parentOnCanvas = getPositionOnCanvas(parent, nodes)
      return {
        position: {
          x: absolute.x - parentOnCanvas.x,
          y: absolute.y - parentOnCanvas.y,
        },
        parentId: parent.id,
      }
    },
    [findDropParent, nodes]
  )

  const commitNode = useCallback(
    (build: (prev: Node[]) => Node, parentId: string | undefined, select: boolean) => {
      setNodes((prev) => {
        const newNode = build(prev)
        const next = [...prev, newNode]
        if (parentId) resizeAllParents(newNode, next)
        return select
          ? next.map((node) =>
              node.id === newNode.id ? node : node.selected ? { ...node, selected: false } : node
            )
          : next
      })
    },
    [setNodes]
  )

  const dropAtPointer = useCallback(
    (event: { clientX: number; clientY: number }, grabOffset: XYPosition): boolean => {
      const canvas = getCanvas()
      if (!canvas) {
        log.warn("Canvas element not found")
        return false
      }

      const bounds = canvas.getBoundingClientRect()
      const outside =
        event.clientX < bounds.left ||
        event.clientY < bounds.top ||
        event.clientX > bounds.right ||
        event.clientY > bounds.bottom
      if (outside) return false

      if (dropElementConfig.isAssociationClass) {
        const availableClasses = nodes.filter((n) => n.type === "class")
        if (availableClasses.length < 2) {
          setAssociationClassPrompt({
            fromNodeId: null,
            error: true,
          })
        } else {
          setAssociationClassPrompt({ fromNodeId: null })
        }
        return false
      }

      const parent = findDropParent(
        screenToFlowPosition({ x: event.clientX, y: event.clientY }, { snapToGrid: true })
      )
      const absolute = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      absolute.x -= Math.floor(grabOffset.x / snapPx) * snapPx
      absolute.y -= Math.floor(grabOffset.y / snapPx) * snapPx

      let position = absolute
      if (parent) {
        const parentOnCanvas = getPositionOnCanvas(parent, nodes)
        position = {
          x: absolute.x - parentOnCanvas.x,
          y: absolute.y - parentOnCanvas.y,
        }
      }

      commitNode(
        () =>
          buildPaletteNode(dropElementConfig, position, {
            parentId: parent?.id,
          }),
        parent?.id,
        false
      )
      return true
    },
    [
      getCanvas,
      dropElementConfig,
      findDropParent,
      screenToFlowPosition,
      snapPx,
      nodes,
      commitNode,
      setAssociationClassPrompt,
    ]
  )

  const placeAtViewportCenter = useCallback(() => {
    if (dropElementConfig.isAssociationClass) {
      const availableClasses = nodes.filter((n) => n.type === "class")
      if (availableClasses.length < 2) {
        setAssociationClassPrompt({
          fromNodeId: null,
          error: true,
        })
      } else {
        setAssociationClassPrompt({ fromNodeId: null })
      }
      return
    }

    const canvas = getCanvas()
    if (!canvas) {
      log.warn("Canvas element not found")
      return
    }
    const rect = canvas.getBoundingClientRect()
    const nodeWidth = dropElementConfig.dropWidth ?? dropElementConfig.width
    const nodeHeight = dropElementConfig.dropHeight ?? dropElementConfig.height

    const center = screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    })
    const topLeft = screenToFlowPosition({ x: rect.left, y: rect.top })
    const bottomRight = screenToFlowPosition({ x: rect.right, y: rect.bottom })

    const anchor =
      lastPlacedElementId !== null &&
      selectedElementIds.length === 1 &&
      selectedElementIds[0] === lastPlacedElementId
        ? nodes.find((node) => node.id === lastPlacedElementId)
        : undefined

    const absolute = resolveTapPosition({
      centeredPosition: snapToGrid(
        { x: center.x - nodeWidth / 2, y: center.y - nodeHeight / 2 },
        snapPx
      ),
      anchorAbsolute: anchor ? getPositionOnCanvas(anchor, nodes) : null,
      nodeWidth,
      nodeHeight,
      visibleRect: {
        minX: topLeft.x,
        minY: topLeft.y,
        maxX: bottomRight.x,
        maxY: bottomRight.y,
      },
      stepPx: DROPS.TAP_CASCADE_PX,
      snapPx,
    })

    const { position, parentId } = nestInParent(absolute)
    const newNode = buildPaletteNode(dropElementConfig, position, {
      parentId,
      selected: true,
    })
    commitNode(() => newNode, parentId, true)
    setSelectedElementsId([newNode.id])
    if (edges.some((edge) => edge.selected)) {
      setEdges(edges.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)))
    }
    setLastPlacedElementId(newNode.id)
  }, [
    getCanvas,
    dropElementConfig,
    screenToFlowPosition,
    selectedElementIds,
    nodes,
    edges,
    setEdges,
    snapPx,
    nestInParent,
    commitNode,
    setSelectedElementsId,
    lastPlacedElementId,
    setLastPlacedElementId,
    setAssociationClassPrompt,
  ])

  return { dropAtPointer, placeAtViewportCenter }
}
