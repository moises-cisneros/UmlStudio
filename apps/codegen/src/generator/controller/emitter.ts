import {
  emitControllerFile,
  type KernelEntity,
  type SpringBootGeneratedFile,
} from "@umlstudio/core/export"

/** Controller layer: one `@RestController` per entity. */
export function emitControllerLayer(entities: KernelEntity[]): SpringBootGeneratedFile[] {
  return entities.map((entity) => emitControllerFile(entity))
}
