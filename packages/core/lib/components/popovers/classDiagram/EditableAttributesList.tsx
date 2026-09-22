import React, { useState, KeyboardEvent, ChangeEvent } from "react"
import { GripVertical, ListTree, Plus, Trash2 } from "lucide-react"
import { IconButton, TextField, Typography } from "@/components/ui"
import { NodeStyleEditor } from "@/components/styleEditor"
import { useLabels } from "@/i18n/useLabels"
import { generateUUID, withTags } from "@/utils"
import { useDiagramStore } from "@/store"
import { useShallow } from "zustand/shallow"
import { ClassNodeElement, ClassNodeProps } from "@/types"
import { TagChips, TagPicker } from "../TagPicker"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

interface Props {
  nodeId: string
}

interface SortableAttributeRowProps {
  id: string
  nodeId: string
  item: ClassNodeElement
  onAttributeChange: (id: string, key: string, value: string) => void
  onTagsChange: (id: string, tags: string[]) => void
  onDelete: (id: string) => void
}

const SortableAttributeRow: React.FC<SortableAttributeRowProps> = ({
  id,
  item,
  onAttributeChange,
  onTagsChange,
  onDelete,
}) => {
  const t = useLabels()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "4px 6px",
        borderRadius: 6,
        border: "1px solid var(--umlstudio-border, var(--border-subtle, #243046))",
        backgroundColor: "color-mix(in srgb, var(--umlstudio-surface, #1e293b) 70%, transparent)",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 4,
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          {...attributes}
          {...listeners}
          aria-label={t.reorderAttribute}
          className="umlstudio-drag-handle"
          style={{
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
            opacity: 0.6,
            cursor: "grab",
          }}
        >
          <GripVertical width={15} height={15} aria-hidden="true" />
        </div>

        <NodeStyleEditor
          nodeData={item}
          handleDataFieldUpdate={(key, value) => onAttributeChange(item.id, key, value)}
          sideElements={[
            <TagPicker
              key={`tags_${item.id}`}
              tags={item.tags ?? []}
              onChange={(tags) => onTagsChange(item.id, tags)}
              subject={t.attributeWord}
            />,
            <IconButton
              key={`delete_${item.id}`}
              ariaLabel={t.deleteAttribute}
              tooltip={t.deleteAttribute}
              onClick={() => onDelete(item.id)}
            >
              <Trash2 width={15} height={15} aria-hidden="true" />
            </IconButton>,
          ]}
        />
      </div>

      <TagChips tags={item.tags ?? []} onChange={(tags) => onTagsChange(item.id, tags)} />
    </div>
  )
}

export const EditableAttributeList: React.FC<Props> = ({ nodeId }) => {
  const t = useLabels()
  const { nodes, setNodes } = useDiagramStore(
    useShallow((state) => ({ setNodes: state.setNodes, nodes: state.nodes }))
  )
  const [newItem, setNewItem] = useState("")

  const nodeData = nodes.find((node) => node.id === nodeId)?.data as ClassNodeProps | undefined
  const attributes = nodeData?.attributes ?? []

  const patchAttributes = (updatedAttributes: typeof attributes) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, attributes: updatedAttributes } }
          : node
      )
    )
  }

  const handleAttributeChange = (id: string, key: string, value: string) => {
    patchAttributes(attributes.map((item) => (item.id === id ? { ...item, [key]: value } : item)))
  }

  const handleTagsChange = (id: string, tags: string[]) => {
    patchAttributes(attributes.map((item) => (item.id === id ? withTags(item, tags) : item)))
  }

  const handleItemDelete = (id: string) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id !== nodeId) return node
        return {
          ...node,
          data: {
            ...node.data,
            attributes: attributes.filter((item) => item.id !== id),
          },
        }
      })
    )
  }

  const handleAddItem = () => {
    if (newItem.trim() === "") return
    const newAttribute = { id: generateUUID(), name: newItem }
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id !== nodeId) return node
        return {
          ...node,
          data: {
            ...node.data,
            attributes: [...attributes, newAttribute],
          },
        }
      })
    )
    setNewItem("")
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") handleAddItem()
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = attributes.findIndex((a) => a.id === active.id)
    const newIndex = attributes.findIndex((a) => a.id === over.id)
    patchAttributes(arrayMove(attributes, oldIndex, newIndex))
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 2,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ListTree width={14} height={14} style={{ color: "var(--dodger-blue, #3590f3)" }} />
          <Typography variant="subtitle2" style={{ fontWeight: 600, fontSize: "0.8125rem" }}>
            {t.attributes}
          </Typography>
        </div>
        <span
          style={{
            fontSize: "0.6875rem",
            fontWeight: 700,
            padding: "1px 6px",
            borderRadius: 9999,
            backgroundColor: "color-mix(in srgb, var(--dodger-blue, #3590f3) 14%, transparent)",
            color: "var(--dodger-blue, #3590f3)",
          }}
        >
          {attributes.length}
        </span>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={attributes.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {attributes.map((item) => (
              <SortableAttributeRow
                key={item.id}
                id={item.id}
                nodeId={nodeId}
                item={item}
                onAttributeChange={handleAttributeChange}
                onTagsChange={handleTagsChange}
                onDelete={handleItemDelete}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="umlstudio-add-row">
        <TextField
          fullWidth
          aria-label={t.newAttribute}
          placeholder={t.addAttribute}
          value={newItem}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setNewItem(e.target.value)}
          onBlur={() => {
            if (newItem.trim() !== "") handleAddItem()
            else setNewItem("")
          }}
          onKeyDown={handleKeyDown}
        />
        <IconButton ariaLabel={t.addAttribute} tooltip={t.addAttribute} onClick={handleAddItem}>
          <Plus width={16} height={16} aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  )
}
