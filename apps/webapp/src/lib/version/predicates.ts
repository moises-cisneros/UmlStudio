import type { VersionKind } from "@/types";

export function isNamedVersion(v: {
  kind: VersionKind;
  name?: string;
  description?: string;
}): boolean {
  return v.kind === "user" || Boolean(v.name?.trim() || v.description?.trim());
}

const VOLATILE_KEYS = new Set([
  "selected",
  "dragging",
  "resizing",
  "hidden",
  "measured",
  "selectable",
  "draggable",
  "connectable",
  "deletable",
]);

export function structuralFingerprint(model: {
  nodes: unknown;
  edges: unknown;
  assessments?: unknown;
  title?: unknown;
  type?: unknown;
  version?: unknown;
}): string {
  return JSON.stringify(
    {
      nodes: model.nodes,
      edges: model.edges,
      assessments: model.assessments,
      title: model.title,
      type: model.type,
      version: model.version,
    },
    (key, value) => (VOLATILE_KEYS.has(key) ? undefined : value),
  );
}
