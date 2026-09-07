import { useMetadataStore } from "@/store"
import { UmlStudioMode, UmlStudioView } from "@/typings"
import { useMemo } from "react"
import { useShallow } from "zustand/shallow"

export const useDiagramModifiable = () => {
  const { readonlyDiagram, diagramMode, diagramView } = useMetadataStore(
    useShallow((state) => ({
      readonlyDiagram: state.readonly,
      diagramMode: state.mode,
      diagramView: state.view,
    }))
  )

  const isDiagramUpdatable = useMemo(
    () =>
      diagramMode === UmlStudioMode.Modelling &&
      diagramView === UmlStudioView.Modelling &&
      !readonlyDiagram,
    [diagramMode, diagramView, readonlyDiagram]
  )

  return isDiagramUpdatable
}
