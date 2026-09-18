import { useDiagramModifiable } from "@/hooks/useDiagramModifiable"
import { useHandleDelete } from "@/hooks/useHandleDelete"
import { useIsOnlyThisElementSelected } from "@/hooks/useIsOnlyThisElementSelected"
import { useSelectionForCopyPaste } from "@/hooks/useSelectionForCopyPaste"
import { usePopoverStore } from "@/store"
import { ButtonGroup, IconButton } from "@/components/ui"
import { useLabels } from "@/i18n/useLabels"
import { Position, NodeToolbar as ReactFlowNodeToolbar } from "@xyflow/react"
import { Copy, Pencil, Trash2 } from "lucide-react"
import { FC } from "react"
import { useShallow } from "zustand/shallow"

interface Props {
  elementId: string
  showEdit?: boolean
}
export const NodeToolbar: FC<Props> = ({ elementId, showEdit = true }) => {
  const setPopOverElementId = usePopoverStore(
    useShallow((state) => state.setPopOverElementId)
  )
  const handleDelete = useHandleDelete(elementId)
  const { duplicateSelectedElements } = useSelectionForCopyPaste()

  const isDiagramModifiable = useDiagramModifiable()
  const selected = useIsOnlyThisElementSelected(elementId)
  const t = useLabels()

  return (
    <ReactFlowNodeToolbar
      isVisible={isDiagramModifiable && !!selected}
      position={Position.Top}
      align="end"
      offset={10}
      className="umlstudio-element-toolbar-host"
    >
      <ButtonGroup
        aria-label={t.selectionActions}
        orientation="vertical"
        className="umlstudio-element-toolbar nodrag nopan"
        onPointerDownCapture={(event) => event.stopPropagation()}
      >
        <IconButton
          ariaLabel={t.deleteElement}
          tooltip={t.deleteElement}
          onClick={handleDelete}
        >
          <Trash2 width={16} height={16} aria-hidden="true" />
        </IconButton>

        {showEdit && (
          <IconButton
            ariaLabel={t.editElement}
            tooltip={t.editElement}
            onClick={() => {
              setPopOverElementId(elementId)
            }}
          >
            <Pencil width={16} height={16} aria-hidden="true" />
          </IconButton>
        )}

        <IconButton
          ariaLabel={t.copyElement ?? "Copy node"}
          tooltip={t.copyElement ?? "Copy node"}
          onClick={(event) => {
            event.stopPropagation()
            duplicateSelectedElements()
          }}
        >
          <Copy width={16} height={16} aria-hidden="true" />
        </IconButton>
      </ButtonGroup>
    </ReactFlowNodeToolbar>
  )
}
