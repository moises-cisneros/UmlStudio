import { NodeStyleEditor } from "@/components";
import { useDiagramStore } from "@/store";
import { ClassNodeProps, ClassStereotype } from "@/types";
import { LAYOUT } from "@/constants";
import { withTags } from "@/utils";
import { useShallow } from "zustand/shallow";
import { EditableAttributeList } from "./EditableAttributesList";
import { EditableMethodsList } from "./EditableMethodsList";
import { ClassTypeSelect, type ClassKind } from "./ClassTypeSelect";
import { PopoverProps } from "../types";
import { useLabels } from "@/i18n/useLabels";
import { PopoverLayout, PopoverSection } from "../PopoverLayout";
import { TagChips, TagPicker } from "../TagPicker";

const KIND_TO_DATA: Record<
  ClassKind,
  { stereotype?: ClassStereotype; isAbstract: boolean }
> = {
  class: { stereotype: undefined, isAbstract: false },
  abstract: { stereotype: undefined, isAbstract: true },
  interface: { stereotype: ClassStereotype.Interface, isAbstract: false },
  enumeration: { stereotype: ClassStereotype.Enumeration, isAbstract: false },
  association: { stereotype: ClassStereotype.Association, isAbstract: false },
};

const hasKeyword = (kind: ClassKind) =>
  kind === "interface" || kind === "enumeration" || kind === "association";

const kindOf = (data: ClassNodeProps): ClassKind => {
  if (data.stereotype === ClassStereotype.Enumeration) return "enumeration";
  if (data.stereotype === ClassStereotype.Interface) return "interface";
  if (data.stereotype === ClassStereotype.Association) return "association";
  if (data.isAbstract) return "abstract";
  return "class";
};

export const ClassEditPopover: React.FC<PopoverProps> = ({ elementId }) => {
  const t = useLabels();
  const { nodes, setNodes } = useDiagramStore(
    useShallow((state) => ({
      nodes: state.nodes,
      setNodes: state.setNodes,
    })),
  );

  const node = nodes.find((node) => node.id === elementId);
  if (!node) {
    return null;
  }

  const nodeData = node.data as ClassNodeProps;
  const currentKind = kindOf(nodeData);

  const handleDataFieldUpdate = (key: string, value: string) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === elementId) {
          return {
            ...node,
            data: {
              ...node.data,
              [key]: value,
            },
          };
        }
        return node;
      }),
    );
  };

  const handleTagsUpdate = (tags: string[]) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === elementId
          ? { ...node, data: withTags(node.data, tags) }
          : node,
      ),
    );
  };

  const setKind = (next: ClassKind) => {
    const mapped = KIND_TO_DATA[next];
    const keywordLinePx =
      LAYOUT.DEFAULT_HEADER_HEIGHT_WITH_STEREOTYPE -
      LAYOUT.DEFAULT_HEADER_HEIGHT;
    const delta =
      ((hasKeyword(next) ? 1 : 0) - (hasKeyword(currentKind) ? 1 : 0)) *
      keywordLinePx;
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id !== elementId) return node;
        const height = (node.height ?? 0) + delta;
        return {
          ...node,
          data: {
            ...node.data,
            stereotype: mapped.stereotype,
            isAbstract: mapped.isAbstract,
          },
          height,
          measured: { ...node.measured, height },
        };
      }),
    );
  };

  return (
    <PopoverLayout
      title={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            gap: 8,
          }}
        >
          <span>{t.class}</span>
          <span
            style={{
              fontSize: "0.6875rem",
              fontWeight: 700,
              padding: "1px 7px",
              borderRadius: 4,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              backgroundColor:
                "color-mix(in srgb, var(--dodger-blue, #3590f3) 14%, transparent)",
              color: "var(--dodger-blue, #3590f3)",
            }}
          >
            {currentKind}
          </span>
        </div>
      }
    >
      <NodeStyleEditor
        nodeData={nodeData}
        handleDataFieldUpdate={handleDataFieldUpdate}
        sideElements={[
          <TagPicker
            key="class-tags"
            tags={nodeData.tags ?? []}
            onChange={handleTagsUpdate}
            subject={t.classWord}
          />,
        ]}
      />
      <TagChips tags={nodeData.tags ?? []} onChange={handleTagsUpdate} />
      <PopoverSection divider>
        <ClassTypeSelect value={currentKind} onChange={setKind} />
      </PopoverSection>
      <PopoverSection divider>
        <EditableAttributeList nodeId={elementId} />
      </PopoverSection>
      <PopoverSection divider>
        <EditableMethodsList nodeId={elementId} />
      </PopoverSection>
    </PopoverLayout>
  );
};
