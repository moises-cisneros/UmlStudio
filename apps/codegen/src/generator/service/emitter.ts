import {
  emitServiceFile,
  emitServiceImplFile,
  type KernelEntity,
  type SpringBootGeneratedFile,
} from "@umlstudio/core/export"

/** Service layer: CRUD interface plus `@Service` implementation. */
export function emitServiceLayer(entities: KernelEntity[]): SpringBootGeneratedFile[] {
  return entities.flatMap((entity) => [emitServiceFile(entity), emitServiceImplFile(entity)])
}
