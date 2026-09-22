import { NodeProps, type Node } from "@xyflow/react"
import { usePopoverAnchor } from "@/hooks/usePopoverAnchor"
import { DefaultNodeWrapper, NodeResizer } from "@/nodes/wrappers"
import { ClassSVG } from "@/components"
import { useEffect, useMemo } from "react"
import { ClassNodeProps, ClassStereotype } from "@/types"
import { useDiagramStore } from "@/store/context"
import { useShallow } from "zustand/shallow"
import { measureTextWidth, calculateMinWidth, calculateMinHeight, stereotypeLabel } from "@/utils"
import { LAYOUT, DROPS } from "@/constants"
import { PopoverManager } from "@/components/popovers/PopoverManager"
import { useDiagramModifiable } from "@/hooks/useDiagramModifiable"
import { NodeToolbar } from "@/components/toolbars/NodeToolbar"

export function Class({ id, width, height, data }: NodeProps<Node<ClassNodeProps>>) {
  const { setNodes } = useDiagramStore(
    useShallow((state) => ({
      setNodes: state.setNodes,
    }))
  )
  const {
    name = "",
    stereotype,
    isAbstract = false,
    attributes: rawAttrs,
    methods: rawMeths,
  } = data || {}

  const attributes = useMemo(
    () => (Array.isArray(rawAttrs) ? rawAttrs.filter((a) => a && typeof a.name === "string") : []),
    [rawAttrs]
  )
  const methods = useMemo(
    () => (Array.isArray(rawMeths) ? rawMeths.filter((m) => m && typeof m.name === "string") : []),
    [rawMeths]
  )

  const isDiagramModifiable = useDiagramModifiable()

  const [anchorEl, anchorRef] = usePopoverAnchor()

  const isEnumeration =
    stereotype === ClassStereotype.Enumeration ||
    (stereotype as unknown as string) === "<<enumeration>>"

  const reserveCompartments = !isEnumeration

  const showStereotype = !!stereotype
  const headerHeight = showStereotype
    ? LAYOUT.DEFAULT_HEADER_HEIGHT_WITH_STEREOTYPE
    : LAYOUT.DEFAULT_HEADER_HEIGHT

  const attributeHeight = LAYOUT.DEFAULT_ATTRIBUTE_HEIGHT
  const methodHeight = LAYOUT.DEFAULT_METHOD_HEIGHT
  const padding = LAYOUT.DEFAULT_PADDING
  const font = LAYOUT.DEFAULT_FONT
  const italicFont = `italic ${font}`

  const MAX_AUTO_CLASS_WIDTH = 320

  const maxTextWidth = useMemo(() => {
    const headerTextWidths = [
      measureTextWidth(name, isAbstract ? italicFont : font),
      showStereotype && stereotype ? measureTextWidth(stereotypeLabel(stereotype), font) : 0,
    ]
    const attributesTextWidths = attributes.map((attribute) =>
      measureTextWidth(attribute.name, font)
    )
    const methodsTextWidths = methods.map((method) =>
      measureTextWidth(method.name, method.isAbstract ? italicFont : font)
    )
    const allTextWidths = [...headerTextWidths, ...attributesTextWidths, ...methodsTextWidths]

    const result = Math.max(...allTextWidths, 0)
    return Math.min(result, MAX_AUTO_CLASS_WIDTH - 2 * padding)
  }, [stereotype, showStereotype, name, isAbstract, font, attributes, methods, italicFont, padding])

  const minWidth = useMemo(() => {
    const result = calculateMinWidth(maxTextWidth, padding)
    return Math.min(Math.max(DROPS.DEFAULT_ELEMENT_WIDTH, result), MAX_AUTO_CLASS_WIDTH)
  }, [maxTextWidth, padding])

  const minHeight = useMemo(
    () =>
      calculateMinHeight(
        headerHeight,
        attributes.length,
        methods.length,
        attributeHeight,
        methodHeight,
        reserveCompartments
      ),
    [
      headerHeight,
      attributes.length,
      methods.length,
      attributeHeight,
      methodHeight,
      reserveCompartments,
    ]
  )

  useEffect(() => {
    if (height && height !== minHeight) {
      setNodes((prev) =>
        prev.map((node) => {
          if (node.id === id) {
            return {
              ...node,
              height: minHeight,
              measured: {
                ...node.measured,
                height: minHeight,
              },
            }
          }
          return node
        })
      )
    }
  }, [minHeight, height, id, setNodes])

  useEffect(() => {
    if (width && (width < minWidth || width > MAX_AUTO_CLASS_WIDTH)) {
      setNodes((prev) =>
        prev.map((node) => {
          if (node.id === id) {
            return {
              ...node,
              width: minWidth,
              measured: {
                ...node.measured,
                width: minWidth,
              },
            }
          }
          return node
        })
      )
    }
  }, [id, setNodes, minWidth, width])

  const finalWidth = Math.min(
    Math.max(width ?? DROPS.DEFAULT_ELEMENT_WIDTH, minWidth),
    width && width > MAX_AUTO_CLASS_WIDTH ? width : MAX_AUTO_CLASS_WIDTH
  )

  return (
    <DefaultNodeWrapper width={width} height={height} elementId={id}>
      <NodeToolbar elementId={id} />

      <NodeResizer
        nodeId={id}
        isVisible={isDiagramModifiable}
        minWidth={minWidth}
        minHeight={minHeight}
        maxHeight={minHeight}
      />
      <div ref={anchorRef}>
        <ClassSVG
          width={finalWidth}
          height={minHeight}
          data={data}
          id={id}
          showAssessmentResults={!isDiagramModifiable}
        />
      </div>

      <PopoverManager anchorEl={anchorEl} elementId={id} type={"class" as const} />
    </DefaultNodeWrapper>
  )
}
