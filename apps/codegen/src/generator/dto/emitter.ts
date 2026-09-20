import {
  emitRequestDtoFile,
  emitResponseDtoFile,
  type KernelEntity,
  type SpringBootGeneratedFile,
} from "@umlstudio/core/export";

/** DTO layer: validated `{Class}Request` plus `{Class}Response`. */
export function emitDtoLayer(
  entities: KernelEntity[],
): SpringBootGeneratedFile[] {
  return entities.flatMap((entity) => [
    emitRequestDtoFile(entity),
    emitResponseDtoFile(entity),
  ]);
}
