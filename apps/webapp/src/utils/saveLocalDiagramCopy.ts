import type { UMLModel } from "@umlstudio/core";

export const cloneModelAsLocalCopy = (source: UMLModel): UMLModel => ({
  ...structuredClone(source),
  id: crypto.randomUUID(),
});
