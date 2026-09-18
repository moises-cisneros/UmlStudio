import type { UMLModel } from "@umlstudio/core";

export type Diagram = UMLModel & {
  createdAt: string;
  updatedAt: string;
};

export type VersionKind = "user" | "auto";

export interface VersionSummary {
  id: string;
  diagramId: string;
  name: string;
  description: string;
  createdAt: string;
  kind: VersionKind;
  librarySchemaVersion: string;
  seq?: number;
}

export interface PendingVersion extends VersionSummary {
  pending?: true;
  failed?: boolean;
}

export type ApiErrorCode =
  | "INVALID_PARAMS"
  | "NOT_FOUND"
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
  [key: string]: unknown;
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
