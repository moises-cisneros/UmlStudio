import type { OpenApiSpec } from "./types.js"

export interface OpenApiValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Validates that an OpenAPI specification conforms to OpenAPI 3.0.3 structural requirements.
 */
export function validateOpenApiSpec(spec: unknown): OpenApiValidationResult {
  const errors: string[] = []

  if (!spec || typeof spec !== "object") {
    return { valid: false, errors: ["Specification must be a non-null object"] }
  }

  const s = spec as Partial<OpenApiSpec>

  if (typeof s.openapi !== "string" || !s.openapi.startsWith("3.0")) {
    errors.push(`'openapi' version must be '3.0.x' (received: ${String(s.openapi)})`)
  }

  if (!s.info || typeof s.info !== "object") {
    errors.push("Missing required 'info' object")
  } else {
    if (!s.info.title || typeof s.info.title !== "string") {
      errors.push("'info.title' must be a non-empty string")
    }
    if (!s.info.version || typeof s.info.version !== "string") {
      errors.push("'info.version' must be a non-empty string")
    }
  }

  if (!s.paths || typeof s.paths !== "object") {
    errors.push("Missing required 'paths' object")
  } else {
    for (const [pathKey, pathItem] of Object.entries(s.paths)) {
      if (!pathKey.startsWith("/")) {
        errors.push(`Path '${pathKey}' must start with a slash '/'`)
      }
      if (!pathItem || typeof pathItem !== "object") {
        errors.push(`Path item at '${pathKey}' must be an object`)
        continue
      }

      const methods = ["get", "post", "put", "delete", "patch", "options", "head"] as const
      for (const m of methods) {
        const op = pathItem[m]
        if (op) {
          if (!op.responses || typeof op.responses !== "object") {
            errors.push(`Operation '${m.toUpperCase()} ${pathKey}' missing 'responses' object`)
          } else {
            const statusCodes = Object.keys(op.responses)
            if (statusCodes.length === 0) {
              errors.push(
                `Operation '${m.toUpperCase()} ${pathKey}' must define at least one response`
              )
            }
          }

          if (op.parameters && Array.isArray(op.parameters)) {
            for (const param of op.parameters) {
              if (!param.name) {
                errors.push(`Parameter in '${m.toUpperCase()} ${pathKey}' missing 'name'`)
              }
              if (!param.in) {
                errors.push(`Parameter in '${m.toUpperCase()} ${pathKey}' missing 'in'`)
              }
              if (param.in === "path" && !param.required) {
                errors.push(
                  `Path parameter '${param.name}' in '${pathKey}' must have 'required: true'`
                )
              }
            }
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
