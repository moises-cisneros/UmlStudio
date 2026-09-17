import { useMemo, useState, type CSSProperties } from "react";
import {
  MiniMap,
  MiniMapNodeProps,
  Panel,
  useStore,
  type PanelPosition,
} from "@xyflow/react";
import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowUpLeft,
  ArrowUpRight,
  Compass,
} from "lucide-react";
import { useReactiveNode } from "@/hooks/useReactiveElement";
import { useLabels } from "@/i18n/useLabels";
import { ClassSVG, PackageSVG } from "./svgs";
import { DiagramNodeType } from "@/typings";
import { ClassNodeProps, DefaultNodeProps } from "@/types/nodes/NodeProps";

export interface CustomMiniMapProps {
  position?: PanelPosition;
  pannable?: boolean;
  zoomable?: boolean;
  managed?: boolean;
}

const COLLAPSE_ARROW: Partial<Record<PanelPosition, typeof ArrowDownRight>> = {
  "top-left": ArrowUpLeft,
  "top-center": ArrowUpRight,
  "top-right": ArrowUpRight,
  "bottom-left": ArrowDownLeft,
  "bottom-center": ArrowDownRight,
  "bottom-right": ArrowDownRight,
};

const MINIMAP_EXPAND_MIN_WIDTH = 640;

export const CustomMiniMap = ({
  position = "top-right",
  pannable = true,
  zoomable = true,
  managed = false,
}: CustomMiniMapProps = {}) => {
  const [minimapCollapsed, setMinimapCollapsed] = useState(true);
  const t = useLabels();
  const CollapseArrow = COLLAPSE_ARROW[position] ?? ArrowDownRight;
  const canvasWidth = useStore((s) => s.width);
  const tooNarrowToExpand =
    canvasWidth > 0 && canvasWidth < MINIMAP_EXPAND_MIN_WIDTH;

  const panelPositionClasses = position.replace("-", " ");
  const managedCollapseStyle = useMemo<CSSProperties>(() => {
    const [vertical, horizontal] = position.split("-") as [
      "top" | "bottom",
      "left" | "center" | "right",
    ];
    return {
      position: "absolute",
      [vertical]: 0,
      ...(horizontal === "left" ? { left: 0 } : { right: 0 }),
    };
  }, [position]);

  if (minimapCollapsed || tooNarrowToExpand) {
    const content = (
      <button
        type="button"
        className="umlstudio-chrome-iconbtn"
        aria-label={t.showMinimap}
        title={t.showMinimapHint}
        onClick={() => setMinimapCollapsed(false)}
      >
        <Compass width={18} height={18} aria-hidden="true" />
      </button>
    );

    return managed ? (
      <div
        className={`react-flow__panel ${panelPositionClasses} umlstudio-mm-panel`}
      >
        {content}
      </div>
    ) : (
      <Panel position={position}>{content}</Panel>
    );
  }

  const map = (
    <MiniMap
      zoomable={zoomable}
      pannable={pannable}
      position={position}
      ariaLabel={t.miniMap}
      nodeComponent={MiniMapNode}
      offsetScale={6}
      bgColor="transparent"
      className={`umlstudio-minimap${managed ? " umlstudio-mm" : ""}`}
    />
  );
  const collapse = (
    <button
      type="button"
      className="umlstudio-chrome-iconbtn"
      aria-label={t.hideMinimap}
      title={t.hideMinimap}
      onClick={() => setMinimapCollapsed(true)}
    >
      <CollapseArrow width={18} height={18} aria-hidden="true" />
    </button>
  );

  return managed ? (
    <div className="umlstudio-mm-shell">
      {map}
      <div
        className={`react-flow__panel ${panelPositionClasses} umlstudio-mm-panel umlstudio-mm-collapse`}
        style={managedCollapseStyle}
      >
        {collapse}
      </div>
    </div>
  ) : (
    <>
      {map}
      <Panel position={position}>{collapse}</Panel>
    </>
  );
};

function MiniMapNode({ id, x, y }: MiniMapNodeProps) {
  const nodeInfo = useReactiveNode(id);
  if (!nodeInfo) return null;

  switch (nodeInfo.type as DiagramNodeType) {
    case "class":
      return (
        <ClassSVG
          svgAttributes={{ x, y }}
          width={nodeInfo.width ?? 0}
          height={nodeInfo.height ?? 0}
          id={`minimap_${id}`}
          data={nodeInfo.data as ClassNodeProps}
        />
      );
    case "package":
      return (
        <PackageSVG
          width={nodeInfo.width ?? 0}
          height={nodeInfo.height ?? 0}
          id={`minimap_${id}`}
          data={nodeInfo.data as DefaultNodeProps}
          svgAttributes={{ x, y }}
        />
      );
    default:
      return <rect x={x} y={y} width={100} height={100} fill="gray" />;
  }
}
