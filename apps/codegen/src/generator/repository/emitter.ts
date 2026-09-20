import {
  emitRepositoryFile,
  type KernelEntity,
  type SpringBootGeneratedFile,
} from "@umlstudio/core/export";

/** Repository layer: one `JpaRepository` per entity, no hand queries. */
export function emitRepositoryLayer(
  entities: KernelEntity[],
): SpringBootGeneratedFile[] {
  return entities.map((entity) => emitRepositoryFile(entity));
}
