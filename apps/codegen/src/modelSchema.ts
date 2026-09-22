import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import Ajv, { type ValidateFunction } from "ajv"
import type { UMLModel } from "@umlstudio/core"

let cachedValidate: ValidateFunction | null = null

/** Loads the canonical v4 model schema from `@umlstudio/core/schema`. */
export function loadModelSchema(): unknown {
  const require = createRequire(import.meta.url)
  const schemaPath = require.resolve("@umlstudio/core/schema")
  const filePath = schemaPath.startsWith("file:") ? fileURLToPath(schemaPath) : schemaPath
  return JSON.parse(readFileSync(filePath, "utf8"))
}

/** Compiled Ajv validator for the canonical model (cached). */
export function getModelValidator(): ValidateFunction {
  if (!cachedValidate) {
    type AjvInstance = { compile: (schema: object) => ValidateFunction }
    type AjvCtor = new (opts?: unknown) => AjvInstance
    const AjvConstructor =
      (Ajv as unknown as { default?: AjvCtor }).default ?? (Ajv as unknown as AjvCtor)
    const ajv = new AjvConstructor({
      allowUnionTypes: true,
      strict: false,
    })
    cachedValidate = ajv.compile(loadModelSchema() as object)
  }
  return cachedValidate!
}

/** Validates a candidate payload against the canonical v4 schema. */
export function validateModel(payload: unknown): {
  valid: boolean
  errors: string[]
} {
  const validate = getModelValidator()
  const valid = validate(payload) as boolean
  if (valid) {
    return { valid: true, errors: [] }
  }
  const errors = (validate.errors ?? []).map(
    (e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`
  )
  return { valid: false, errors }
}

/** Counts class nodes (the Ajv gate requires at least one). */
export function countClassNodes(model: UMLModel): number {
  return (model.nodes ?? []).filter((node) => !node.type || node.type === "class").length
}
