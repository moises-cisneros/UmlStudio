import type {
  UmlStudioNode,
  UmlStudioEdge,
  Assessment,
  InteractiveElements,
  UMLDiagramType,
} from "@umlstudio/core";

export interface Diagram {
  id: string;
  version: string;
  title: string;
  type: UMLDiagramType;
  nodes: UmlStudioNode[];
  edges: UmlStudioEdge[];
  assessments: Record<string, Assessment>;
  interactive?: InteractiveElements;
  createdAt: string;
  updatedAt: string;
}

export interface VersionSummary {
  id: string;
  diagramId: string;
  name: string;
  description: string;
  createdAt: string;
  kind: VersionKind;
  librarySchemaVersion: string;
  seq?: number;
  author?: string;
}

export type VersionKind = "user" | "auto";

export type ApiErrorCode =
  | "INVALID_PARAMS"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "CONFLICT"
  | "REVISION_MISMATCH"
  | "BODY_TOO_LARGE"
  | "NO_HEAD"
  | "REDIS_UNAVAILABLE"
  | "RENDERER_BUSY"
  | "INTERNAL";

export interface ApiErrorBody {
  error: ApiErrorCode;
  message: string;
  requestId: string;
}

export type ControlEvent =
  | {
    type: "VERSION_CREATED";
    versionId: string;
    createdAt: string;
    name: string;
    kind: VersionKind;
    actor?: string;
  }
  | {
    type: "VERSION_RESTORED";
    headRev: number;
    updatedAt: string;
    autoSnapshotVersionId: string;
    restoredFromVersionId: string;
    actor?: string;
  }
  | { type: "VERSION_DELETED"; versionId: string }
  | {
    type: "VERSION_RENAMED";
    versionId: string;
    name: string;
    description: string;
  }
  | { type: "DIAGRAM_DELETED" }
  | { type: "DIAGRAM_RENAMED"; title: string };

export type Envelope = { kind: "control"; control: ControlEvent };
