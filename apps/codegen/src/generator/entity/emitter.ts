import {
  emitEntityFile,
  type KernelEntity,
  type SpringBootGeneratedFile,
  type SpringBootInheritanceStrategy,
} from "@umlstudio/core/export";

/** Entity layer: one JPA `@Entity` per kernel entity. */
export function emitEntityLayer(
  entities: KernelEntity[],
  inheritance: SpringBootInheritanceStrategy = "JOINED",
): SpringBootGeneratedFile[] {
  return entities.map((entity) => emitEntityFile(entity, inheritance));
}
