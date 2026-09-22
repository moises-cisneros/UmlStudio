import type { UMLModel } from "@umlstudio/core"

export class InvalidModelGeometryError extends Error {
  readonly code = "INVALID_MODEL_GEOMETRY"
  constructor(message: string) {
    super(message)
    this.name = "InvalidModelGeometryError"
  }
}

const isPositiveFinite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0

export function assertValidNodeGeometry(model: UMLModel): void {
  for (const node of model.nodes ?? []) {
    const m = node.measured
    if (
      !isPositiveFinite(node.width) ||
      !isPositiveFinite(node.height) ||
      !isPositiveFinite(m?.width) ||
      !isPositiveFinite(m?.height)
    ) {
      throw new InvalidModelGeometryError(
        `Node "${node.id}" (${node.type}) has invalid dimensions ` +
          `(width=${node.width}, height=${node.height}, ` +
          `measured=${m?.width}×${m?.height}); cannot export faithfully.`
      )
    }
  }
}
