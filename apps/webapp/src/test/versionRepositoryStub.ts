import { vi } from "vitest";
import {
  setVersionRepository,
  type RepositoryKind,
  type VersionRepository,
} from "@/services/versionRepository";
import {
  MAX_LOCAL_VERSIONS_PER_DIAGRAM,
  MAX_VERSIONS_PER_DIAGRAM,
} from "@/constants";

export function stubVersionRepository(
  kind: RepositoryKind,
  overrides: Partial<VersionRepository> = {},
): () => void {
  const notStubbed = (method: string) => () =>
    Promise.reject(new Error(`VersionRepository.${method} was not stubbed`));

  return setVersionRepository(kind, {
    kind,
    cap:
      kind === "local"
        ? MAX_LOCAL_VERSIONS_PER_DIAGRAM
        : MAX_VERSIONS_PER_DIAGRAM,
    list: vi.fn(notStubbed("list")),
    getBody: vi.fn(notStubbed("getBody")),
    create: vi.fn(notStubbed("create")),
    restore: vi.fn(notStubbed("restore")),
    editInfo: vi.fn(notStubbed("editInfo")),
    delete: vi.fn(notStubbed("delete")),
    permalink: () => null,
    ...overrides,
  } as VersionRepository);
}
