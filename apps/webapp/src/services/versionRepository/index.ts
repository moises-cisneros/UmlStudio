import { LocalVersionRepository } from "./LocalVersionRepository";
import { RemoteVersionRepository } from "./RemoteVersionRepository";
import type { VersionRepository } from "./types";

export type RepositoryKind = VersionRepository["kind"];

const adapters: Record<RepositoryKind, VersionRepository> = {
  local: LocalVersionRepository,
  remote: RemoteVersionRepository,
};

export function getVersionRepository(kind: RepositoryKind): VersionRepository {
  return adapters[kind];
}

export function setVersionRepository(
  kind: RepositoryKind,
  repository: VersionRepository,
): () => void {
  const previous = adapters[kind];
  adapters[kind] = repository;
  return () => {
    adapters[kind] = previous;
  };
}

export { LocalVersionRepository, RemoteVersionRepository };
export { subscribeToLocalVersionEvents } from "./LocalVersionRepository";
export type {
  VersionRepository,
  ListVersionsResponse,
  CreateVersionResult,
  RestoreVersionResult,
} from "./types";
