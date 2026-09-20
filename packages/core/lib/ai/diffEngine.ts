import type {
  UMLModel,
  UmlStudioNode,
  UmlStudioEdge,
  Assessment,
} from "../typings";
import {
  DiagramNodeTypeRecord,
  DiagramEdgeTypeRecord,
} from "../modelElementTypes";
import { generateUUID } from "../constants";
import type {
  ModelDiff,
  ModelDiffValidationResult,
  DiffElementAdd,
  DiffRelationshipAdd,
} from "./types";

const VALID_NODE_TYPES = new Set(Object.values(DiagramNodeTypeRecord));
const VALID_EDGE_TYPES = new Set(Object.values(DiagramEdgeTypeRecord));

/**
 * Validates a ModelDiff payload against the required schema structure.
 */
export function validateDiff(diff: unknown): ModelDiffValidationResult {
  const errors: string[] = [];

  if (!diff || typeof diff !== "object") {
    return { valid: false, errors: ["ModelDiff must be a non-null object"] };
  }

  const d = diff as ModelDiff;

  if (d.add) {
    if (d.add.elements) {
      if (!Array.isArray(d.add.elements)) {
        errors.push("add.elements must be an array");
      } else {
        d.add.elements.forEach((el, index) => {
          if (!el.name || typeof el.name !== "string") {
            errors.push(
              `add.elements[${index}].name is required and must be a string`,
            );
          }
          if (!el.type || !VALID_NODE_TYPES.has(el.type)) {
            errors.push(
              `add.elements[${index}].type '${el.type}' is invalid. Allowed: ${Array.from(
                VALID_NODE_TYPES,
              ).join(", ")}`,
            );
          }
        });
      }
    }

    if (d.add.relationships) {
      if (!Array.isArray(d.add.relationships)) {
        errors.push("add.relationships must be an array");
      } else {
        d.add.relationships.forEach((rel, index) => {
          if (!rel.source || typeof rel.source !== "string") {
            errors.push(`add.relationships[${index}].source is required`);
          }
          if (!rel.target || typeof rel.target !== "string") {
            errors.push(`add.relationships[${index}].target is required`);
          }
          if (!rel.type || !VALID_EDGE_TYPES.has(rel.type)) {
            errors.push(
              `add.relationships[${index}].type '${rel.type}' is invalid. Allowed: ${Array.from(
                VALID_EDGE_TYPES,
              ).join(", ")}`,
            );
          }
        });
      }
    }
  }

  if (d.modify?.elements) {
    if (!Array.isArray(d.modify.elements)) {
      errors.push("modify.elements must be an array");
    } else {
      d.modify.elements.forEach((mod, index) => {
        if (!mod.id || typeof mod.id !== "string") {
          errors.push(`modify.elements[${index}].id is required`);
        }
        if (!mod.changes || typeof mod.changes !== "object") {
          errors.push(`modify.elements[${index}].changes must be an object`);
        }
      });
    }
  }

  if (d.remove) {
    if (d.remove.elementIds && !Array.isArray(d.remove.elementIds)) {
      errors.push("remove.elementIds must be an array");
    }
    if (d.remove.relationshipIds && !Array.isArray(d.remove.relationshipIds)) {
      errors.push("remove.relationshipIds must be an array");
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Applies a ModelDiff onto a UMLModel, returning a validated, consistent new model instance.
 */
export function applyDiff(currentModel: UMLModel, diff: ModelDiff): UMLModel {
  const validation = validateDiff(diff);
  if (!validation.valid) {
    throw new Error(
      `Cannot apply invalid ModelDiff: ${validation.errors?.join("; ")}`,
    );
  }

  // Deep clone nodes, edges, assessments, interactive to maintain immutability
  const nodes: UmlStudioNode[] = currentModel.nodes.map((n) => ({
    ...n,
    position: { ...n.position },
    measured: { ...n.measured },
    data: { ...n.data },
  }));
  const edges: UmlStudioEdge[] = currentModel.edges.map((e) => ({
    ...e,
    data: {
      ...e.data,
      points: e.data.points.map((p) => ({ ...p })),
    },
  }));
  const assessments: Record<string, Assessment> = {
    ...currentModel.assessments,
  };
  const interactiveElements: Record<string, boolean> = {
    ...(currentModel.interactive?.elements ?? {}),
  };
  const interactiveRelationships: Record<string, boolean> = {
    ...(currentModel.interactive?.relationships ?? {}),
  };

  // Build name-to-id mapping from existing nodes
  const nameToId = new Map<string, string>();
  for (const node of nodes) {
    nameToId.set(node.id, node.id);
    if (node.data.name && typeof node.data.name === "string") {
      nameToId.set(node.data.name, node.id);
    }
  }

  // 1. Process Removals
  if (diff.remove) {
    const removedElementIds = new Set(diff.remove.elementIds ?? []);
    const removedRelIds = new Set(diff.remove.relationshipIds ?? []);

    // Filter nodes
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (removedElementIds.has(nodes[i].id)) {
        delete assessments[nodes[i].id];
        delete interactiveElements[nodes[i].id];
        nodes.splice(i, 1);
      }
    }

    // Filter edges (explicit removal or cascade when endpoint node was deleted)
    for (let i = edges.length - 1; i >= 0; i--) {
      const edge = edges[i];
      if (
        removedRelIds.has(edge.id) ||
        removedElementIds.has(edge.source) ||
        removedElementIds.has(edge.target)
      ) {
        delete interactiveRelationships[edge.id];
        edges.splice(i, 1);
      }
    }
  }

  // 2. Process Additions
  if (diff.add?.elements) {
    const startX = 100;
    const startY = 120;
    const spacingX = 280;
    const spacingY = 220;
    const existingCount = nodes.length;

    diff.add.elements.forEach((el: DiffElementAdd, index: number) => {
      const nodeId = el.id ?? `node-${generateUUID()}`;
      nameToId.set(el.name, nodeId);
      nameToId.set(nodeId, nodeId);

      const col = (existingCount + index) % 3;
      const row = Math.floor((existingCount + index) / 3);

      const posX = el.position?.x ?? startX + col * spacingX;
      const posY = el.position?.y ?? startY + row * spacingY;
      const width = el.width ?? 220;
      const height = el.height ?? 140;

      const formattedAttributes = (el.attributes ?? []).map((attr) => ({
        id: attr.id ?? `attr-${generateUUID()}`,
        name: attr.name,
      }));

      const formattedMethods = (el.methods ?? []).map((method) => ({
        id: method.id ?? `op-${generateUUID()}`,
        name: method.name,
      }));

      const newNode: UmlStudioNode = {
        id: nodeId,
        type: el.type,
        position: { x: posX, y: posY },
        width,
        height,
        measured: { width, height },
        data: {
          name: el.name,
          ...(el.stereotype ? { stereotype: el.stereotype } : {}),
          attributes: formattedAttributes,
          methods: formattedMethods,
        },
      };

      nodes.push(newNode);
      assessments[nodeId] = {
        modelElementId: nodeId,
        elementType: el.stereotype === "<<interface>>" ? "Interface" : "Class",
        score: 1,
      };
      interactiveElements[nodeId] = true;
    });
  }

  if (diff.add?.relationships) {
    diff.add.relationships.forEach((rel: DiffRelationshipAdd) => {
      const sourceId = nameToId.get(rel.source) ?? rel.source;
      const targetId = nameToId.get(rel.target) ?? rel.target;

      const sourceNode = nodes.find((n) => n.id === sourceId);
      const targetNode = nodes.find((n) => n.id === targetId);

      const edgeId = rel.id ?? `edge-${generateUUID()}`;

      // Calculate default orthogonal points between source and target
      const sx = sourceNode ? sourceNode.position.x + sourceNode.width : 200;
      const sy = sourceNode
        ? sourceNode.position.y + Math.floor(sourceNode.height / 2)
        : 150;
      const tx = targetNode ? targetNode.position.x : 400;
      const ty = targetNode
        ? targetNode.position.y + Math.floor(targetNode.height / 2)
        : 150;
      const midX = Math.round((sx + tx) / 2);

      const newEdge: UmlStudioEdge = {
        id: edgeId,
        source: sourceId,
        target: targetId,
        type: rel.type,
        sourceHandle: rel.sourceHandle ?? `${sourceId}-right`,
        targetHandle: rel.targetHandle ?? `${targetId}-left`,
        data: {
          points: [
            { x: sx, y: sy },
            { x: midX, y: sy },
            { x: midX, y: ty },
            { x: tx, y: ty },
          ],
        },
      };

      edges.push(newEdge);
      interactiveRelationships[edgeId] = true;
    });
  }

  // 3. Process Modifications
  if (diff.modify?.elements) {
    diff.modify.elements.forEach((mod) => {
      const targetNode = nodes.find((n) => n.id === mod.id);
      if (targetNode) {
        if (mod.changes.name !== undefined) {
          targetNode.data.name = mod.changes.name;
        }
        if (mod.changes.stereotype !== undefined) {
          targetNode.data.stereotype = mod.changes.stereotype;
        }
        if (mod.changes.attributes !== undefined) {
          targetNode.data.attributes = mod.changes.attributes.map((a) => ({
            id: a.id ?? `attr-${generateUUID()}`,
            name: a.name,
          }));
        }
        if (mod.changes.methods !== undefined) {
          targetNode.data.methods = mod.changes.methods.map((m) => ({
            id: m.id ?? `op-${generateUUID()}`,
            name: m.name,
          }));
        }
        if (mod.changes.position !== undefined) {
          targetNode.position = { ...mod.changes.position };
        }
      }
    });
  }

  return {
    ...currentModel,
    nodes,
    edges,
    assessments,
    interactive: {
      elements: interactiveElements,
      relationships: interactiveRelationships,
    },
  };
}
