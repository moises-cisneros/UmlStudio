import type { UMLModel, UmlStudioEdge, UmlStudioNode } from "../typings"

export interface BoardDslBudget {
  /** Maximum size of the output in characters. Focused classes are never dropped. */
  maxChars: number
  /** Node ids that are selected on the board; always rendered complete. */
  selectedIds?: string[]
  /** Class names mentioned in the user prompt; always rendered complete. */
  mentionedNames?: string[]
  /** Node id -> user name, rendered as a trailing `@Name` on the class line. */
  owners?: Record<string, string>
}

const EDGE_LABELS: Record<string, string> = {
  ClassAggregation: "Aggregation",
  ClassInheritance: "Inheritance",
  ClassRealization: "Realization",
  ClassComposition: "Composition",
  ClassBidirectional: "Association",
  ClassUnidirectional: "DirectedAssociation",
  ClassDependency: "Dependency",
}

type Member = { name?: unknown }

function nodeName(node: UmlStudioNode): string {
  const name = node.data?.name
  return typeof name === "string" && name.trim() ? name.trim() : node.id
}

function memberNames(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return (value as Member[])
    .map((member) => (typeof member?.name === "string" ? member.name.trim() : ""))
    .filter(Boolean)
}

function classHeader(node: UmlStudioNode): string {
  const abstract = node.data?.isAbstract === true ? "abstract " : ""
  const stereotype =
    typeof node.data?.stereotype === "string" && node.data.stereotype
      ? ` <<${node.data.stereotype}>>`
      : ""
  return `${abstract}class ${nodeName(node)}${stereotype}`
}

function owner(node: UmlStudioNode, owners?: Record<string, string>): string {
  const name = owners?.[node.id]
  return name ? ` @${name}` : ""
}

function classLine(node: UmlStudioNode, owners?: Record<string, string>): string {
  const members = [...memberNames(node.data?.attributes), ...memberNames(node.data?.methods)]
  const body = members.length > 0 ? ` { ${members.join("; ")} }` : ""
  return `${classHeader(node)}${body}${owner(node, owners)}`
}

function nameOnlyLine(node: UmlStudioNode): string {
  return `class ${nodeName(node)}`
}

function packageLine(node: UmlStudioNode): string {
  return `package ${nodeName(node)}`
}

function endpoint(multiplicity: unknown): string {
  return typeof multiplicity === "string" && multiplicity.trim() ? ` "${multiplicity.trim()}"` : ""
}

function relationshipLine(edge: UmlStudioEdge, names: Map<string, string>): string {
  const source = names.get(edge.source) ?? edge.source
  const target = names.get(edge.target) ?? edge.target
  // `data` is required by the type but the server replica builds edges from an unvalidated Y.Doc.
  const data = (edge.data ?? {}) as Record<string, unknown>
  const label = EDGE_LABELS[edge.type] ?? String(edge.type)
  return `${source}${endpoint(data.sourceMultiplicity)} --${endpoint(data.targetMultiplicity)} ${target} : ${label}`
}

/**
 * Serializes a class diagram into a compact line-based text form for LLM prompts.
 * Positions and sizes are omitted. When the output exceeds `budget.maxChars`,
 * selected and mentioned classes stay complete and the others keep only their names.
 */
export function boardToDsl(model: UMLModel, budget: BoardDslBudget): string {
  const nodes = model.nodes ?? []
  const edges = model.edges ?? []
  const names = new Map(nodes.map((node) => [node.id, nodeName(node)]))
  const selected = new Set(budget.selectedIds ?? [])
  const mentioned = new Set((budget.mentionedNames ?? []).map((name) => name.toLowerCase()))
  const isFocused = (node: UmlStudioNode) =>
    selected.has(node.id) || mentioned.has(nodeName(node).toLowerCase())

  const classes = nodes.filter((node) => node.type === "class")
  const packages = nodes.filter((node) => node.type === "package")
  const relationships = edges.map((edge) => relationshipLine(edge, names))

  const full = [
    ...packages.map(packageLine),
    ...classes.map((node) => classLine(node, budget.owners)),
    ...relationships,
  ].join("\n")
  if (full.length <= budget.maxChars) return full

  const focusedIds = new Set(classes.filter(isFocused).map((node) => node.id))
  const lines = [
    ...packages.map(packageLine),
    ...classes.map((node) =>
      focusedIds.has(node.id) ? classLine(node, budget.owners) : nameOnlyLine(node)
    ),
  ]
  let size = lines.join("\n").length

  // Relationships touching a focused class go first, then the rest while budget remains.
  const prioritized = edges
    .map((edge, index) => ({ edge, line: relationships[index] }))
    .sort(
      (a, b) =>
        Number(focusedIds.has(b.edge.source) || focusedIds.has(b.edge.target)) -
        Number(focusedIds.has(a.edge.source) || focusedIds.has(a.edge.target))
    )
  for (const { edge, line } of prioritized) {
    const touchesFocus = focusedIds.has(edge.source) || focusedIds.has(edge.target)
    if (!touchesFocus && size + line.length + 1 > budget.maxChars) continue
    lines.push(line)
    size += line.length + 1
  }
  return lines.join("\n")
}
