import type { ReactElement } from "react"
import { UMLDiagramType } from "@umlstudio/core"

const iconClassName = "h-10 w-10"

const renderClassDiagramIcon = (className = iconClassName): ReactElement => (
  <svg className={className} viewBox="0 0 48 48" fill="none">
    <rect x="6" y="8" width="36" height="30" rx="3" stroke="currentColor" strokeWidth="2" />
    <line x1="6" y1="18" x2="42" y2="18" stroke="currentColor" strokeWidth="2" />
    <line x1="14" y1="25" x2="34" y2="25" stroke="currentColor" strokeWidth="2" />
    <line x1="14" y1="31" x2="28" y2="31" stroke="currentColor" strokeWidth="2" />
  </svg>
)

type DiagramTile = {
  type: UMLDiagramType
  title: string
  renderIcon: (className?: string) => ReactElement
  icon: ReactElement
}

const makeTile = (
  type: UMLDiagramType,
  title: string,
  renderIcon: (className?: string) => ReactElement
): DiagramTile => ({
  type,
  title,
  renderIcon,
  get icon() {
    return renderIcon()
  },
})

const diagramTiles = {
  classDiagram: makeTile(UMLDiagramType.ClassDiagram, "Class Diagram", renderClassDiagramIcon),
}

const tilesByType: Partial<Record<UMLDiagramType, DiagramTile>> = Object.values(
  diagramTiles
).reduce<Partial<Record<UMLDiagramType, DiagramTile>>>((result, tile) => {
  result[tile.type] = tile
  return result
}, {})

export const getDiagramTypeLabel = (type: UMLDiagramType) => tilesByType[type]?.title ?? type

const shortLabelsByType: Partial<Record<UMLDiagramType, string>> = {
  ClassDiagram: "Class",
}

export const getDiagramTypeShortLabel = (type: UMLDiagramType): string =>
  shortLabelsByType[type] ?? type

export const getDiagramTypeIcon = (type: UMLDiagramType, customClassName?: string) => {
  const tile = tilesByType[type]
  if (tile) {
    return tile.renderIcon(customClassName ?? iconClassName)
  }

  return (
    <svg
      className={customClassName ?? iconClassName}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <rect x="8" y="10" width="32" height="28" rx="3" stroke="currentColor" strokeWidth="2" />
      <line x1="12" y1="18" x2="36" y2="18" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}
