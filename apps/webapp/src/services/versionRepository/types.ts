import type { UMLModel } from "@umlstudio/core"
import type { Diagram, VersionSummary } from "@/types"

export interface ListVersionsResponse {
  versions: VersionSummary[]
  nextCursor?: string
  total: number
}

export interface CreateVersionResult extends VersionSummary {
  evictedVersionIds?: string[]
  evictedKinds?: ("unnamed" | "named")[]
  total?: number
  cap?: number
  headRev?: number
}

export interface RestoreVersionResult {
  headRev?: number
  updatedAt: string
  autoSnapshotVersionId: string
}

export interface VersionRepository {
  readonly kind: "local" | "remote"

  readonly cap: number

  list(
    diagramId: string,
    opts?: { limit?: number; before?: string; signal?: AbortSignal }
  ): Promise<ListVersionsResponse>

  create(
    diagramId: string,
    body: UMLModel,
    opts: { name?: string; description?: string; actor?: string }
  ): Promise<CreateVersionResult>

  getBody(diagramId: string, versionId: string, opts?: { signal?: AbortSignal }): Promise<Diagram>

  restore(
    diagramId: string,
    versionId: string,
    opts: { currentBody: UMLModel; actor?: string }
  ): Promise<RestoreVersionResult>

  editInfo(
    diagramId: string,
    versionId: string,
    patch: { name?: string; description?: string }
  ): Promise<VersionSummary>

  delete(diagramId: string, versionId: string): Promise<void>

  permalink(diagramId: string, versionId: string): string | null

  purgeDiagram?(diagramId: string): Promise<void>

  requestPersistence?(): Promise<void>
}
