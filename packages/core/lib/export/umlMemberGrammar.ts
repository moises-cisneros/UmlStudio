/**
 * Shared UML member-string grammar.
 *
 * Parses the visibility-prefixed member strings used across UmlStudio
 * Class Diagram nodes (`[+-#~] name [: type]` for attributes and
 * `[+-#~] name [(params)] [: returnType]` for operations).
 *
 * The regular expressions are extracted verbatim from `xmiExport.ts` so both
 * exporters share a single source of truth and cannot drift apart.
 */

export type UmlVisibilitySymbol = "+" | "-" | "#" | "~"

export type UmlVisibility = "public" | "private" | "protected" | "package"

const ATTRIBUTE_PATTERN = /^\s*([+\-#~])?\s*([a-zA-Z0-9_$]+)(?:\s*:\s*([a-zA-Z0-9_$<>,. ]+))?/

const METHOD_PATTERN =
  /^\s*([+\-#~])?\s*([a-zA-Z0-9_$]+)\s*(?:\((.*?)\))?(?:\s*:\s*([a-zA-Z0-9_$<>,. ]+))?/

const PARAMETER_PATTERN = /^([a-zA-Z0-9_$]+)(?:\s*:\s*([a-zA-Z0-9_$<>,. ]+))?/

/**
 * Maps a UML visibility symbol to its OMG UML 2.5 visibility kind.
 * A missing symbol defaults to public, matching canvas conventions.
 */
export function mapVisibilitySymbol(symbol?: string): UmlVisibility {
  switch (symbol) {
    case "-":
      return "private"
    case "#":
      return "protected"
    case "~":
      return "package"
    case "+":
    default:
      return "public"
  }
}

export interface ParsedUmlAttribute {
  /** Raw visibility symbol as written (`+`, `-`, `#`, `~` or undefined). */
  visibilitySymbol?: string
  /** Resolved OMG UML 2.5 visibility kind. */
  visibility: UmlVisibility
  /** Member name without visibility prefix or type suffix. */
  name: string
  /** Declared UML type, if present. */
  type?: string
}

/**
 * Parses a single attribute string such as `- price : double`.
 * Returns null when the string carries no usable member name.
 */
export function parseUmlAttribute(raw: string): ParsedUmlAttribute | null {
  if (!raw || !raw.trim()) {
    return null
  }
  const match = raw.match(ATTRIBUTE_PATTERN)
  const name = match?.[2] ?? ""
  if (!name) {
    return null
  }
  const visibilitySymbol = match?.[1]
  const type = match?.[3]?.trim() || undefined
  return {
    visibilitySymbol,
    visibility: mapVisibilitySymbol(visibilitySymbol),
    name,
    type,
  }
}

export interface ParsedUmlParameter {
  /** Parameter name. Falls back to `param_<index>` for empty tokens. */
  name: string
  /** Declared UML type, if present. */
  type?: string
}

/**
 * Splits a raw parameter list (`name : Type, other : OtherType`) into
 * structured parameters, preserving positional fallbacks.
 */
export function splitUmlParameters(paramsRaw: string): ParsedUmlParameter[] {
  if (!paramsRaw || !paramsRaw.trim()) {
    return []
  }
  return paramsRaw.split(",").map((token, index) => {
    const match = token.trim().match(PARAMETER_PATTERN)
    return {
      name: match?.[1] || `param_${index}`,
      type: match?.[2]?.trim() || undefined,
    }
  })
}

export interface ParsedUmlMethod {
  /** Raw visibility symbol as written (`+`, `-`, `#`, `~` or undefined). */
  visibilitySymbol?: string
  /** Resolved OMG UML 2.5 visibility kind. */
  visibility: UmlVisibility
  /** Operation name without visibility prefix, params, or return type. */
  name: string
  /** Ordered input parameters. */
  params: ParsedUmlParameter[]
  /** Declared return type, if present. */
  returnType?: string
}

/**
 * Parses a single operation string such as `+ addItem(item : Item) : void`.
 * Returns null when the string carries no usable operation name.
 */
export function parseUmlMethod(raw: string): ParsedUmlMethod | null {
  if (!raw || !raw.trim()) {
    return null
  }
  const match = raw.match(METHOD_PATTERN)
  const name = match?.[2] ?? ""
  if (!name) {
    return null
  }
  const visibilitySymbol = match?.[1]
  const params = splitUmlParameters(match?.[3] ?? "")
  const returnType = match?.[4]?.trim() || undefined
  return {
    visibilitySymbol,
    visibility: mapVisibilitySymbol(visibilitySymbol),
    name,
    params,
    returnType,
  }
}
