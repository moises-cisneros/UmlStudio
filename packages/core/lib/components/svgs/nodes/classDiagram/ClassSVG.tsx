import { ClassNodeElement, ClassNodeProps, ClassStereotype } from "@/types"
import { LAYOUT } from "@/constants"
import { SeparationLine } from "@/components/svgs/nodes/SeparationLine"
import { HeaderSection } from "../HeaderSection"
import { RowBlockSection } from "../RowBlockSection"
import { useDiagramStore } from "@/store"
import { useShallow } from "zustand/shallow"
import AssessmentIcon from "../../AssessmentIcon"
import { SVGComponentProps } from "@/types/SVG"
import { AssessmentSelectableElement } from "@/components/AssessmentSelectableElement"
import { StyledRect } from "../../StyledElements"
import { getCustomColorsFromData } from "@/utils/layoutUtils"

export type ClassSVGProps = SVGComponentProps & {
  data: ClassNodeProps
}

export const ClassSVG = ({
  id,
  width,
  height,
  SIDEBAR_PREVIEW_SCALE,
  svgAttributes,
  showAssessmentResults = false,
  data,
}: ClassSVGProps) => {
  const { name = "", stereotype, isAbstract = false } = data || {}
  const rawAttrs = Array.isArray(data?.attributes) ? data.attributes : []
  const rawMeths = Array.isArray(data?.methods) ? data.methods : []
  const attributes = rawAttrs.filter((a) => a && typeof a.name === "string")
  const methods = rawMeths.filter((m) => m && typeof m.name === "string")

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

  const effectiveAttrCount = reserveCompartments
    ? Math.max(1, attributes.length)
    : attributes.length
  const attrCompartmentHeight = effectiveAttrCount * attributeHeight
  const shouldShowMethodsCompartment = !isEnumeration

  const assessments = useDiagramStore(useShallow((state) => state.assessments))

  const processElements = (elements: ClassNodeElement[]) =>
    elements.map((el) => {
      const score = assessments[el.id]?.score
      return { ...el, score }
    })

  const processedAttributes = processElements(attributes)
  const processedMethods = processElements(methods)
  const nodeScore = assessments[id]?.score

  const scaledWidth = width * (SIDEBAR_PREVIEW_SCALE ?? 1)
  const scaledHeight = height * (SIDEBAR_PREVIEW_SCALE ?? 1)
  const { fillColor, strokeColor, textColor } = getCustomColorsFromData(data)

  return (
    <svg
      width={scaledWidth}
      height={scaledHeight}
      viewBox={`0 0 ${width} ${height}`}
      overflow="visible"
      {...svgAttributes}
    >
      <AssessmentSelectableElement
        elementId={id}
        width={width}
        itemHeight={headerHeight}
        yOffset={0}
        highlightable={false}
        badge={
          showAssessmentResults ? (
            <AssessmentIcon score={nodeScore} x={width - 15} y={-15} />
          ) : undefined
        }
      >
        <StyledRect x={0} y={0} width={width} height={height} stroke={strokeColor} />

        <HeaderSection
          showStereotype={showStereotype}
          stereotype={stereotype}
          name={name}
          width={width}
          headerHeight={headerHeight}
          isAbstract={isAbstract}
          textColor={textColor}
          fill={fillColor}
        />
      </AssessmentSelectableElement>

      {(effectiveAttrCount > 0 || shouldShowMethodsCompartment) && (
        <SeparationLine y={headerHeight} width={width} strokeColor={strokeColor} />
      )}

      <RowBlockSection
        items={processedAttributes}
        padding={padding}
        itemHeight={attributeHeight}
        width={width}
        offsetFromTop={headerHeight}
        showAssessmentResults={showAssessmentResults}
        itemElementType="attribute"
      />

      {shouldShowMethodsCompartment && (
        <>
          <SeparationLine
            y={headerHeight + attrCompartmentHeight}
            width={width}
            strokeColor={strokeColor}
          />
          <RowBlockSection
            items={processedMethods}
            padding={padding}
            itemHeight={methodHeight}
            width={width}
            offsetFromTop={headerHeight + attrCompartmentHeight}
            showAssessmentResults={showAssessmentResults}
            itemElementType="method"
          />
        </>
      )}
    </svg>
  )
}
