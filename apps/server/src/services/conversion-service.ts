import {
  UmlStudioEditor,
  importDiagram,
  type UMLModel,
  type SVG,
} from "@umlstudio/core";
import { findUnsupportedLabels } from "./glyph-coverage.js";
import { assertValidNodeGeometry } from "./node-geometry.js";

function toNamedHandle(
  handle: string | null | undefined,
  fallback: string,
): string {
  const h = handle ?? fallback;
  const between = h.indexOf("-between-");
  return between === -1 ? h : h.slice(0, between);
}

export class ConversionService {
  private readonly EDGE_ENDPOINT_INSET_PX = -3;

  private calculateAdjustedQuarter = (value: number): number => {
    const quarter = value / 4;
    return Math.floor(quarter / 10) * 10;
  };

  private createDefaultHandles = (width: number, height: number) => {
    const adjustedWidth = this.calculateAdjustedQuarter(width);
    const adjustedHeight = this.calculateAdjustedQuarter(height);
    const inset = this.EDGE_ENDPOINT_INSET_PX;

    const baseHandles = [
      { id: "top-left", position: "top", x: adjustedWidth, y: inset },
      { id: "top", position: "top", x: width / 2, y: inset },
      { id: "top-right", position: "top", x: width - adjustedWidth, y: inset },

      {
        id: "right-top",
        position: "right",
        x: width - inset,
        y: adjustedHeight,
      },
      { id: "right", position: "right", x: width - inset, y: height / 2 },
      {
        id: "right-bottom",
        position: "right",
        x: width - inset,
        y: height - adjustedHeight,
      },

      {
        id: "bottom-right",
        position: "bottom",
        x: width - adjustedWidth,
        y: height - inset,
      },
      { id: "bottom", position: "bottom", x: width / 2, y: height - inset },
      {
        id: "bottom-left",
        position: "bottom",
        x: adjustedWidth,
        y: height - inset,
      },

      {
        id: "left-bottom",
        position: "left",
        x: inset,
        y: height - adjustedHeight,
      },
      { id: "left", position: "left", x: inset, y: height / 2 },
      { id: "left-top", position: "left", x: inset, y: adjustedHeight },
    ];

    return baseHandles.flatMap((handle) => [
      { ...handle, type: "source", width: 1, height: 1 },
      { ...handle, type: "target", width: 1, height: 1 },
    ]);
  };

  private normalizeModelForServerRender = (model: UMLModel): UMLModel => {
    type NodeWithHandles = UMLModel["nodes"][number] & {
      handles?: unknown;
    };
    return {
      ...model,
      nodes: model.nodes.map((node) => {
        const n = node as NodeWithHandles;
        return {
          ...node,
          handles:
            n.handles ?? this.createDefaultHandles(node.width, node.height),
        };
      }),
      edges: (model.edges ?? []).map((edge, index) => ({
        ...edge,
        id:
          edge.id ??
          `${edge.source ?? "source"}-${edge.target ?? "target"}-${index}`,
        sourceHandle: toNamedHandle(edge.sourceHandle, "right"),
        targetHandle: toNamedHandle(edge.targetHandle, "left"),
        data: {
          ...(edge.data ?? {}),
          points: edge.data?.points ?? [],
        },
      })),
    };
  };

  convertToSvg = async (model: UMLModel): Promise<SVG> => {
    const imported = importDiagram(model);
    assertValidNodeGeometry(imported);
    const normalizedModel = this.normalizeModelForServerRender(imported);
    const unsupported = findUnsupportedLabels(normalizedModel);
    if (unsupported.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[umlstudio-export] ${unsupported.length} label(s) contain glyphs outside ` +
          `the bundled font and may not match the editor: ` +
          unsupported.slice(0, 5).join(" | "),
      );
    }

    const svgExport = (await UmlStudioEditor.exportModelAsSvg(normalizedModel, {
      svgMode: "compat",
    })) as SVG;

    if (
      typeof svgExport?.svg === "string" &&
      typeof svgExport.clip?.width === "number" &&
      typeof svgExport.clip?.height === "number"
    ) {
      return svgExport;
    }
    throw new Error("Failed to extract SVG: invalid export format");
  };
}
