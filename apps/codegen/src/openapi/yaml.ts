/**
 * Lightweight, deterministic YAML stringifier for OpenAPI 3.0 specs.
 * Produces clean, readable YAML without external runtime dependencies.
 */

function escapeYamlString(str: string): string {
  if (str === "") return '""'
  if (/^[0-9]+(\.[0-9]+)*$/.test(str)) return `"${str}"`
  if (/^(true|false|null|yes|no|on|off)$/i.test(str)) return `"${str}"`
  if (/^[:-?[\]{}&#*!|>'%@`]/.test(str)) return `"${str.replace(/"/g, '\\"')}"`
  if (/[#:\n\r\t]/.test(str)) return `"${str.replace(/"/g, '\\"')}"`
  return str
}

export function stringifyYaml(value: unknown, indentLevel = 0): string {
  const indent = "  ".repeat(indentLevel)

  if (value === null || value === undefined) {
    return "null"
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false"
  }

  if (typeof value === "number") {
    return String(value)
  }

  if (typeof value === "string") {
    if (value.includes("\n")) {
      const lines = value.split("\n")
      const blockIndent = "  ".repeat(indentLevel + 1)
      return `|\n${lines.map((l) => `${blockIndent}${l}`).join("\n")}`
    }
    return escapeYamlString(value)
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]"
    }
    const lines: string[] = []
    for (const item of value) {
      if (typeof item === "object" && item !== null) {
        const itemYaml = stringifyYaml(item, indentLevel + 1)
        const trimmed = itemYaml.trimStart()
        lines.push(`${indent}- ${trimmed}`)
      } else {
        lines.push(`${indent}- ${stringifyYaml(item, indentLevel + 1)}`)
      }
    }
    return lines.join("\n")
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined
    )

    if (entries.length === 0) {
      return "{}"
    }

    const lines: string[] = []
    for (const [k, v] of entries) {
      const keyStr = /^[a-zA-Z0-9_-]+$/.test(k) ? k : `"${k}"`

      if (
        v !== null &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        Object.keys(v as object).length > 0
      ) {
        lines.push(`${indent}${keyStr}:`)
        lines.push(stringifyYaml(v, indentLevel + 1))
      } else if (Array.isArray(v) && v.length > 0) {
        lines.push(`${indent}${keyStr}:`)
        lines.push(stringifyYaml(v, indentLevel + 1))
      } else {
        lines.push(`${indent}${keyStr}: ${stringifyYaml(v, indentLevel)}`)
      }
    }
    return lines.join("\n")
  }

  return String(value)
}

/** Converts an OpenAPI 3.0 spec object into a formatted YAML string. */
export function generateOpenApiYaml(spec: unknown): string {
  return stringifyYaml(spec, 0) + "\n"
}
