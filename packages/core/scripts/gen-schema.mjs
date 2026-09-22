import * as TJS from "typescript-json-schema"
import process from "node:process"
import { writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const LIB = resolve(here, "..")

export const SCHEMA_ID = "https://unpkg.com/@umlstudio/core/schema/uml-model-4.schema.json"

export function buildModelSchema() {
  const program = TJS.programFromConfig(resolve(LIB, "tsconfig.json"))
  const schema = TJS.generateSchema(program, "UMLModel", {
    required: true,
    noExtraProps: true,
    ref: true,
    aliasRef: false,
    topRef: false,
    strictNullChecks: true,
  })

  if (!schema) throw new Error("typescript-json-schema returned no schema")

  schema.$id = SCHEMA_ID
  schema.title = "UmlStudio UML model (v4)"
  schema.description =
    "Canonical v4 UmlStudio diagram model — the output of importDiagram(). " +
    "See https://umlstudio.github.io/UmlStudio/library/api/model-contract."

  if (!schema.properties?.version) {
    throw new Error(
      "UMLModel.version property missing from generated schema — refusing to " +
        "write a schema that cannot pin the version pattern."
    )
  }
  schema.properties.version = {
    type: "string",
    pattern: "^4\\.\\d+\\.\\d+$",
    description:
      "Wire-format version. Tracks the model MAJOR line (4.x), not the npm " + "package version.",
  }

  return schema
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const schema = buildModelSchema()
  const out = resolve(LIB, "schema/uml-model-4.schema.json")
  writeFileSync(out, JSON.stringify(schema, null, 2) + "\n")
  // eslint-disable-next-line no-console
  console.log(`wrote ${out}`)
}
