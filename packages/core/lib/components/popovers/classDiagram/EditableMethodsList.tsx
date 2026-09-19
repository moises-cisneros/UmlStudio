import React, { useState, KeyboardEvent, ChangeEvent } from "react";
import { Code2, GripVertical, Plus, Trash2 } from "lucide-react";
import { IconButton, TextField, Typography } from "@/components/ui";
import { NodeStyleEditor } from "@/components/styleEditor";
import { useLabels } from "@/i18n/useLabels";
import { generateUUID, withTags } from "@/utils";
import { useDiagramStore } from "@/store";
import { useShallow } from "zustand/shallow";
import { ClassNodeElement, ClassNodeProps } from "@/types";
import { TagChips, TagPicker } from "../TagPicker";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Props {
  nodeId: string;
}

interface SortableMethodRowProps {
  id: string;
  item: ClassNodeElement;
  onMethodChange: (id: string, key: string, value: string) => void;
  onTagsChange: (id: string, tags: string[]) => void;
  onDelete: (id: string) => void;
}

const SortableMethodRow: React.FC<SortableMethodRowProps> = ({
  id,
  item,
  onMethodChange,
  onTagsChange,
  onDelete,
}) => {
  const t = useLabels();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : undefined,
  };

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
        border:
          "1px solid var(--umlstudio-border, var(--border-subtle, #243046))",
        backgroundColor:
          "color-mix(in srgb, var(--umlstudio-surface, #1e293b) 70%, transparent)",
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
          aria-label={t.reorderMethod}
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
          handleDataFieldUpdate={(key, value) =>
            onMethodChange(item.id, key, value)
          }
          sideElements={[
            <TagPicker
              key={`tags_${item.id}`}
              tags={item.tags ?? []}
              onChange={(tags) => onTagsChange(item.id, tags)}
              subject={t.methodWord}
            />,
            <IconButton
              key={`delete_${item.id}`}
              ariaLabel={t.deleteMethod}
              tooltip={t.deleteMethod}
              onClick={() => onDelete(item.id)}
            >
              <Trash2 width={15} height={15} aria-hidden="true" />
            </IconButton>,
          ]}
        />
      </div>

      <TagChips
        tags={item.tags ?? []}
        onChange={(tags) => onTagsChange(item.id, tags)}
      />
    </div>
  );
};

export const EditableMethodsList: React.FC<Props> = ({ nodeId }) => {
  const t = useLabels();
  const { nodes, setNodes } = useDiagramStore(
    useShallow((state) => ({ setNodes: state.setNodes, nodes: state.nodes })),
  );
  const [newItem, setNewItem] = useState("");

  const nodeData = nodes.find((node) => node.id === nodeId)?.data as
    | ClassNodeProps
    | undefined;
  const methods = nodeData?.methods ?? [];

  const patchMethods = (updatedMethods: typeof methods) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, methods: updatedMethods } }
          : node,
      ),
    );
  };

  const handleMethodChange = (id: string, key: string, value: string) => {
    patchMethods(
      methods.map((item) =>
        item.id === id ? { ...item, [key]: value } : item,
      ),
    );
  };

  const handleTagsChange = (id: string, tags: string[]) => {
    patchMethods(
      methods.map((item) => (item.id === id ? withTags(item, tags) : item)),
    );
  };

  const handleItemDelete = (id: string) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id !== nodeId) return node;
        return {
          ...node,
          data: {
            ...node.data,
            methods: methods.filter((item) => item.id !== id),
          },
          height: node.height! - 30,
          measured: { ...node.measured, height: node.height! - 30 },
        };
      }),
    );
  };

  const handleAddItem = () => {
    if (newItem.trim() === "") return;
    const newMethod = { id: generateUUID(), name: newItem };
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id !== nodeId) return node;
        return {
          ...node,
          data: {
            ...node.data,
            methods: [...methods, newMethod],
          },
          height: node.height! + 30,
          measured: { ...node.measured, height: node.height! + 30 },
        };
      }),
    );
    setNewItem("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") handleAddItem();
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = methods.findIndex((m) => m.id === active.id);
    const newIndex = methods.findIndex((m) => m.id === over.id);
    patchMethods(arrayMove(methods, oldIndex, newIndex));
  };

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
          <Code2
            width={14}
            height={14}
            style={{ color: "var(--brand-cyan, #00d8ff)" }}
          />
          <Typography
            variant="subtitle2"
            style={{ fontWeight: 600, fontSize: "0.8125rem" }}
          >
            {t.methods}
          </Typography>
        </div>
        <span
          style={{
            fontSize: "0.6875rem",
            fontWeight: 700,
            padding: "1px 6px",
            borderRadius: 9999,
            backgroundColor:
              "color-mix(in srgb, var(--brand-cyan, #00d8ff) 14%, transparent)",
            color: "var(--brand-cyan, #00d8ff)",
          }}
        >
          {methods.length}
        </span>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={methods.map((m) => m.id)}
          strategy={verticalListSortingStrategy}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {methods.map((item) => (
              <SortableMethodRow
                key={item.id}
                id={item.id}
                item={item}
                onMethodChange={handleMethodChange}
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
          aria-label={t.newMethod}
          placeholder={t.addMethod}
          value={newItem}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setNewItem(e.target.value)
          }
          onBlur={() => {
            if (newItem.trim() !== "") handleAddItem();
            else setNewItem("");
          }}
          onKeyDown={handleKeyDown}
        />
        <IconButton
          ariaLabel={t.addMethod}
          tooltip={t.addMethod}
          onClick={handleAddItem}
        >
          <Plus width={16} height={16} aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
};
