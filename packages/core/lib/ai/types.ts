import type { DiagramEdgeType, DiagramNodeType } from "../modelElementTypes";
import type { UMLModel } from "../typings";

export interface DiffAttribute {
  id?: string;
  name: string;
}

export interface DiffMethod {
  id?: string;
  name: string;
}

export interface DiffElementAdd {
  id?: string;
  name: string;
  type: DiagramNodeType;
  stereotype?: string;
  position?: { x: number; y: number };
  width?: number;
  height?: number;
  attributes?: DiffAttribute[];
  methods?: DiffMethod[];
}

export interface DiffRelationshipAdd {
  id?: string;
  type: DiagramEdgeType;
  source: string; // ID or element Name
  target: string; // ID or element Name
  sourceHandle?: string;
  targetHandle?: string;
  name?: string;
}

export interface DiffElementModify {
  id: string;
  changes: {
    name?: string;
    stereotype?: string;
    attributes?: DiffAttribute[];
    methods?: DiffMethod[];
    position?: { x: number; y: number };
  };
}

export interface ModelDiff {
  add?: {
    elements?: DiffElementAdd[];
    relationships?: DiffRelationshipAdd[];
  };
  modify?: {
    elements?: DiffElementModify[];
  };
  remove?: {
    elementIds?: string[];
    relationshipIds?: string[];
  };
}

export interface ModelDiffValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface AIAdapter {
  readonly providerName: string;
  generateDiff(prompt: string, currentModel: UMLModel): Promise<ModelDiff>;
}
