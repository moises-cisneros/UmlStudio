import type { RepositoryKind } from "@/services/versionRepository"

export const versionKeys = {
  all: ["versions"] as const,
  list: (kind: RepositoryKind, diagramId: string) =>
    [...versionKeys.all, "list", kind, diagramId] as const,
  body: (kind: RepositoryKind, diagramId: string, versionId: string) =>
    [...versionKeys.all, "body", kind, diagramId, versionId] as const,
}

export const roomAiKeys = {
  all: ["room-ai"] as const,
  messages: (diagramId: string) => [...roomAiKeys.all, "messages", diagramId] as const,
  status: (diagramId: string) => [...roomAiKeys.all, "status", diagramId] as const,
}
