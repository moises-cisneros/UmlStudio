import type { UMLModel } from "../typings"
import { DiagramEdgeTypeRecord } from "../modelElementTypes"
import { UMLDiagramType } from "../types/DiagramType"
import { parseUmlAttribute, parseUmlMethod } from "./umlMemberGrammar"

export interface SpringBootExportOptions {
  /**
   * Root package name for the generated Spring Boot application.
   * @default "com.example.umlstudio"
   */
  packageName?: string
  /**
   * Target Java version.
   * @default 21
   */
  javaVersion?: 17 | 21
  /**
   * Whether to include Jakarta / JPA annotations in entity classes.
   * @default true
   */
  includeJpaAnnotations?: boolean
}

export interface SpringBootGeneratedFile {
  /** Relative path inside the project tree, e.g. "src/main/java/com/example/domain/User.java" */
  path: string
  /** Java source code content */
  content: string
}

export interface SpringBootExportResult {
  /** All generated Java files grouped by relative path */
  files: SpringBootGeneratedFile[]
  /** Summary of generated entities and components */
  summary: {
    totalEntities: number
    totalRepositories: number
    totalControllers: number
  }
}

/**
 * Skeleton exporter to translate a UmlStudio UMLModel into a Spring Boot project structure.
 * Concrete translation logic will be implemented as use cases are defined.
 */
export async function exportToSpringBoot(
  model: UMLModel,
  options: SpringBootExportOptions = {}
): Promise<SpringBootExportResult> {
  const basePackage = options.packageName ?? "com.example.umlstudio"
  const classNodes = (model.nodes ?? []).filter((node) => !node.type || node.type === "class")

  const files: SpringBootGeneratedFile[] = classNodes.map((node) => {
    const rawName = typeof node.data?.name === "string" ? node.data.name : undefined
    const className = rawName || "UnnamedEntity"
    const packagePath = basePackage.replace(/\./g, "/")
    return {
      path: `src/main/java/${packagePath}/model/${className}.java`,
      content: [
        `package ${basePackage}.model;`,
        "",
        options.includeJpaAnnotations !== false
          ? "import jakarta.persistence.Entity;\nimport jakarta.persistence.Id;\nimport jakarta.persistence.Table;\n"
          : "",
        options.includeJpaAnnotations !== false ? "@Entity\n@Table" : "",
        `public class ${className} {`,
        "  // TODO: Fields and methods will be generated from UML diagram attributes and operations",
        "}",
        "",
      ]
        .filter(Boolean)
        .join("\n"),
    }
  })

  return {
    files,
    summary: {
      totalEntities: classNodes.length,
      totalRepositories: 0,
      totalControllers: 0,
    },
  }
}

// ---------------------------------------------------------------------------
// Full five-layer kernel: AST -> JPA entities, repositories,
// services, DTOs, controllers. The skeleton above is preserved verbatim for
// backward compatibility; the functions below power @umlstudio/codegen.
// ---------------------------------------------------------------------------

/** JPA inheritance mapping strategy for entity hierarchies. */
export type SpringBootInheritanceStrategy = "JOINED" | "SINGLE_TABLE"

export interface SpringBootFullExportOptions extends SpringBootExportOptions {
  /**
   * Optional FA-03 subset filter: class or package node ids to generate.
   * Only selected classes (plus directly referenced types) are emitted.
   */
  selection?: string[] | undefined
  /**
   * Inheritance mapping for entity hierarchies.
   * @default "JOINED"
   */
  inheritance?: SpringBootInheritanceStrategy | undefined
}

export interface SpringBootFullExportSummary {
  totalEntities: number
  totalRepositories: number
  totalServices: number
  totalDtos: number
  totalControllers: number
}

export interface SpringBootFullExportResult {
  /** All generated Java files grouped by relative path. */
  files: SpringBootGeneratedFile[]
  /** Non-fatal mapping notes (unknown types, skipped members, ...). */
  warnings: string[]
  summary: SpringBootFullExportSummary
}

/** Thrown when the model is not a Class Diagram (OMG UML 2.5 guard). */
export class NonClassDiagramError extends Error {
  readonly code = "NON_CLASS_DIAGRAM"
  constructor(modelType: unknown) {
    super(
      `Spring Boot generation supports ClassDiagram models only (received: ${String(modelType)})`
    )
    this.name = "NonClassDiagramError"
  }
}

/** Thrown when the model carries no generatable entity class. */
export class EmptyModelError extends Error {
  readonly code = "EMPTY_MODEL"
  constructor() {
    super("Spring Boot generation requires at least one class node")
    this.name = "EmptyModelError"
  }
}

export interface JavaTypeMapping {
  javaType: string
  sqlType: string
  imports: string[]
  unknown: boolean
}

/**
 * Canonical UML -> Java -> PostgreSQL type table (design contract).
 * Unknown types fall back to String/TEXT and are flagged via `unknown`.
 */
export function mapUmlTypeToJava(umlType: string | undefined): JavaTypeMapping {
  const norm = (umlType ?? "").trim().toLowerCase()
  if (!norm) {
    return { javaType: "String", sqlType: "VARCHAR(255)", imports: [], unknown: false }
  }
  switch (norm) {
    case "string":
      return { javaType: "String", sqlType: "VARCHAR(255)", imports: [], unknown: false }
    case "int":
    case "integer":
      return { javaType: "Integer", sqlType: "INTEGER", imports: [], unknown: false }
    case "long":
      return { javaType: "Long", sqlType: "BIGINT", imports: [], unknown: false }
    case "number":
    case "float":
    case "double":
    case "real":
    case "decimal":
    case "bigdecimal":
      return {
        javaType: "BigDecimal",
        sqlType: "NUMERIC(12,2)",
        imports: ["java.math.BigDecimal"],
        unknown: false,
      }
    case "boolean":
    case "bool":
      return { javaType: "Boolean", sqlType: "BOOLEAN", imports: [], unknown: false }
    case "date":
    case "localdate":
    case "sqldate":
      return {
        javaType: "LocalDate",
        sqlType: "DATE",
        imports: ["java.time.LocalDate"],
        unknown: false,
      }
    case "time":
    case "localtime":
    case "sqltime":
      return {
        javaType: "LocalTime",
        sqlType: "TIME",
        imports: ["java.time.LocalTime"],
        unknown: false,
      }
    case "datetime":
    case "localdatetime":
    case "timestamp":
      return {
        javaType: "LocalDateTime",
        sqlType: "TIMESTAMP",
        imports: ["java.time.LocalDateTime"],
        unknown: false,
      }
    default:
      return { javaType: "String", sqlType: "TEXT", imports: [], unknown: true }
  }
}

/** Returns a realistic, executable example value tailored for the given field and type. */
export function getExecutableExample(fieldName: string, javaType: string): string {
  const normType = javaType.toLowerCase()
  const lowField = fieldName.toLowerCase()

  if (normType === "date" || normType === "localdate") {
    return "2026-09-21"
  }
  if (normType === "time" || normType === "localtime") {
    return "14:30:00"
  }
  if (normType === "timestamp" || normType === "datetime" || normType === "localdatetime") {
    return "2026-09-21T14:30:00Z"
  }
  if (normType === "boolean") {
    return "true"
  }
  if (normType === "integer" || normType === "int" || normType === "short" || normType === "byte") {
    if (lowField.includes("edad") || lowField.includes("age")) return "25"
    if (
      lowField.includes("cantidad") ||
      lowField.includes("stock") ||
      lowField.includes("quantity")
    )
      return "10"
    if (lowField.includes("año") || lowField.includes("year")) return "2026"
    return "1"
  }
  if (normType === "long") {
    if (lowField.includes("id")) return "1"
    return "100"
  }
  if (normType === "bigdecimal" || normType === "double" || normType === "float") {
    if (
      lowField.includes("precio") ||
      lowField.includes("price") ||
      lowField.includes("monto") ||
      lowField.includes("saldo") ||
      lowField.includes("costo") ||
      lowField.includes("fee") ||
      lowField.includes("tarifa") ||
      lowField.includes("total")
    ) {
      return "99.95"
    }
    return "50.00"
  }

  // String / text semantic inference
  if (lowField.includes("email") || lowField.includes("correo")) return "usuario@example.com"
  if (
    lowField.includes("telefono") ||
    lowField.includes("phone") ||
    lowField.includes("celular") ||
    lowField.includes("tel")
  )
    return "+59170012345"
  if (lowField.includes("nombre") || lowField.includes("name")) return "Juan"
  if (lowField.includes("apellido") || lowField.includes("lastname")) return "Perez"
  if (lowField.includes("direccion") || lowField.includes("address")) return "Av. Principal 123"
  if (lowField.includes("ciudad") || lowField.includes("city")) return "La Paz"
  if (lowField.includes("pais") || lowField.includes("country")) return "Bolivia"
  if (lowField.includes("codigo") || lowField.includes("code")) return "COD-001"
  if (
    lowField.includes("descripcion") ||
    lowField.includes("description") ||
    lowField.includes("detalle")
  )
    return "Descripcion de prueba"
  if (lowField.includes("titulo") || lowField.includes("title")) return "Titulo de ejemplo"
  if (lowField.includes("usuario") || lowField.includes("username")) return "jperez"
  if (
    lowField.includes("password") ||
    lowField.includes("contrasena") ||
    lowField.includes("clave")
  )
    return "Password123*"
  if (lowField.includes("estado") || lowField.includes("status")) return "ACTIVO"
  if (
    lowField.includes("url") ||
    lowField.includes("link") ||
    lowField.includes("imagen") ||
    lowField.includes("image")
  )
    return "https://example.com/imagen.png"

  return `Ejemplo ${fieldName}`
}

const JAVA_RESERVED = new Set([
  "abstract",
  "assert",
  "boolean",
  "break",
  "byte",
  "case",
  "catch",
  "char",
  "class",
  "const",
  "continue",
  "default",
  "do",
  "double",
  "else",
  "enum",
  "extends",
  "final",
  "finally",
  "float",
  "for",
  "goto",
  "if",
  "implements",
  "import",
  "instanceof",
  "int",
  "interface",
  "long",
  "native",
  "new",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "short",
  "static",
  "strictfp",
  "super",
  "switch",
  "synchronized",
  "this",
  "throw",
  "throws",
  "transient",
  "try",
  "void",
  "volatile",
  "while",
  "true",
  "false",
  "null",
  "var",
  "record",
  "sealed",
  "permits",
])

/** UpperCamelCase sanitised Java type name. */
export function toPascalCase(raw: string): string {
  const parts = raw.split(/[^a-zA-Z0-9]+/).filter(Boolean)
  const base = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("")
  const cleaned = base.replace(/[^a-zA-Z0-9_$]/g, "") || "Unnamed"
  const prefixed = /^[0-9]/.test(cleaned) ? `C${cleaned}` : cleaned
  return JAVA_RESERVED.has(prefixed.toLowerCase()) || JAVA_RESERVED.has(prefixed)
    ? `${prefixed}Entity`
    : prefixed
}

/** lowerCamelCase sanitised Java field/variable name. */
export function toCamelCase(raw: string): string {
  const pascal = toPascalCase(raw)
  const lowered = pascal.charAt(0).toLowerCase() + pascal.slice(1)
  const cleaned = lowered.replace(/[^a-zA-Z0-9_$]/g, "") || "field"
  const prefixed = /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned
  return JAVA_RESERVED.has(prefixed) ? `${prefixed}_` : prefixed
}

/** snake_case sanitised SQL identifier. */
export function toSnakeCase(raw: string): string {
  const kebab = toKebabCase(raw)
  return kebab.replace(/-/g, "_")
}

/** kebab-case sanitised URL segment. */
export function toKebabCase(raw: string): string {
  const cleaned = raw
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  return cleaned.split(/\s+/).filter(Boolean).join("-").toLowerCase()
}

/** Naive English pluralisation for REST collection paths. */
export function pluralize(word: string): string {
  if (!word) {
    return word
  }
  if (/[^aeiou]y$/i.test(word)) {
    return word.slice(0, -1) + "ies"
  }
  if (/(s|x|z|ch|sh)$/i.test(word)) {
    return `${word}es`
  }
  return `${word}s`
}

export type KernelRelationKind = "many-to-one" | "one-to-many" | "many-to-many"

export interface KernelRelation {
  kind: KernelRelationKind
  fieldName: string
  targetEntity: string
  targetTable: string
  mappedBy?: string | undefined
  /** FK column on this side (many-to-one). */
  joinColumn?: string | undefined
  /** Join table on the owning side (many-to-many). */
  joinTable?: string | undefined
  joinColumnName?: string | undefined
  inverseJoinColumnName?: string | undefined
  cascadeAll: boolean
  orphanRemoval: boolean
  nullable: boolean
  onDelete: "CASCADE" | "SET NULL" | "NO ACTION"
}

export interface KernelScalarColumn {
  fieldName: string
  javaType: string
  columnName: string
  sqlType: string
  nullable: boolean
  id: boolean
  /** Validation annotations for the Request DTO (e.g. "@NotBlank"). */
  dtoAnnotations: string[]
  enumerated: boolean
}

export interface KernelEntity {
  nodeId: string
  className: string
  tableName: string
  /** Dotted Java package (base plus parent package chain). */
  packagePath: string
  abstract: boolean
  parent?: string | undefined
  interfaces: string[]
  scalars: KernelScalarColumn[]
  relations: KernelRelation[]
  /** Target entity names injected into the service implementation. */
  dependencyServices: string[]
  hasChildren: boolean
}

export interface KernelEnum {
  nodeId: string
  name: string
  packagePath: string
  values: string[]
}

export interface KernelInterfaceMethod {
  name: string
  returnType: string
  params: { name: string; type: string }[]
}

export interface KernelInterface {
  nodeId: string
  name: string
  packagePath: string
  methods: KernelInterfaceMethod[]
}

export interface KernelJoinTable {
  tableName: string
  sourceEntity: string
  targetEntity: string
  sourceTable: string
  targetTable: string
  sourceColumn: string
  targetColumn: string
}

export interface KernelModel {
  entities: KernelEntity[]
  enums: KernelEnum[]
  interfaces: KernelInterface[]
  joinTables: KernelJoinTable[]
  warnings: string[]
}

interface NodeDataShape {
  name?: unknown
  stereotype?: unknown
  attributes?: unknown
  methods?: unknown
  isAssociationClass?: unknown
  associationEdgeId?: unknown
}

interface EdgeDataShape {
  label?: unknown
  sourceRole?: unknown
  targetRole?: unknown
  sourceMultiplicity?: unknown
  targetMultiplicity?: unknown
  associationClassNodeId?: unknown
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function readMemberList(value: unknown): { id?: string; name: string }[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter(
      (entry): entry is { id?: string; name: string } =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { name?: unknown }).name === "string"
    )
    .map((entry) => ({ id: entry.id, name: entry.name }))
}

function cleanRole(value: unknown): string {
  const raw = readString(value)?.trim() ?? ""
  if (!raw || raw.toLowerCase() === "source" || raw.toLowerCase() === "target") {
    return ""
  }
  return raw.replace(/^\+/, "").trim()
}

/**
 * Builds the generation kernel model: classifies nodes, maps the UML ->
 * Java -> PostgreSQL type table, resolves JPA relations from edges and
 * collects warnings. Pure and network-free.
 */
export function buildKernelModel(
  model: UMLModel,
  options: SpringBootFullExportOptions = {}
): KernelModel {
  if (model.type !== UMLDiagramType.ClassDiagram) {
    throw new NonClassDiagramError(model.type)
  }
  const warnings: string[] = []
  const basePackage = options.packageName ?? "com.example.umlstudio"
  const nodes = model.nodes ?? []
  const edges = model.edges ?? []

  const packageNames = new Map<string, string>()
  for (const node of nodes) {
    if (node.type === "package") {
      const data = node.data as NodeDataShape
      const raw = readString(data?.name) ?? node.id
      packageNames.set(node.id, toPascalCase(raw))
    }
  }

  const packagePathFor = (parentId?: string): string => {
    const chain: string[] = []
    const seen = new Set<string>()
    let current = parentId
    while (current && !seen.has(current)) {
      seen.add(current)
      const segment = packageNames.get(current)
      if (segment) {
        chain.unshift(segment.toLowerCase())
      }
      const parent = nodes.find((n) => n.id === current)
      current = parent?.parentId
    }
    return chain.length > 0 ? `${basePackage}.${chain.join(".")}` : basePackage
  }

  // -- FA-03 subset filter -------------------------------------------------
  let selected: Set<string> | null = null
  if (options.selection && options.selection.length > 0) {
    selected = new Set(options.selection)
    const knownIds = new Set(nodes.map((n) => n.id))
    for (const id of selected) {
      if (!knownIds.has(id)) {
        warnings.push(`Selection id "${id}" does not match any node and was ignored`)
      }
    }
    // Package selection pulls in its whole subtree.
    let grew = true
    while (grew) {
      grew = false
      for (const node of nodes) {
        if (node.parentId && selected.has(node.parentId) && !selected.has(node.id)) {
          selected.add(node.id)
          grew = true
        }
      }
    }
  }

  interface ClassCandidate {
    id: string
    parentId?: string
    className: string
    stereotype: "class" | "abstract" | "interface" | "enum"
    data: NodeDataShape
    associationEdgeId?: string
    isAssociationClass: boolean
  }

  const candidates = new Map<string, ClassCandidate>()
  for (const node of nodes) {
    if (node.type !== "class" && node.type) {
      continue
    }
    const data = (node.data ?? {}) as NodeDataShape
    const rawName = readString(data.name) ?? "UnnamedEntity"
    const stereo = (readString(data.stereotype) ?? "").toLowerCase()
    const kind =
      stereo === "interface"
        ? "interface"
        : stereo === "enumeration" || stereo === "enum"
          ? "enum"
          : stereo === "abstract"
            ? "abstract"
            : "class"
    candidates.set(node.id, {
      id: node.id,
      parentId: node.parentId,
      className: toPascalCase(rawName),
      stereotype: kind,
      data,
      associationEdgeId: readString(data.associationEdgeId),
      isAssociationClass:
        Boolean(data.isAssociationClass) ||
        edges.some(
          (e) => readString((e.data as EdgeDataShape)?.associationClassNodeId) === node.id
        ),
    })
  }

  if (selected) {
    // Keep selected classes plus directly referenced types (edges either way).
    const referenced = new Set<string>()
    for (const edge of edges) {
      if (selected.has(edge.source) || selected.has(edge.target)) {
        referenced.add(edge.source)
        referenced.add(edge.target)
      }
      const link = readString((edge.data as EdgeDataShape)?.associationClassNodeId)
      if (link && (selected.has(edge.source) || selected.has(edge.target))) {
        referenced.add(link)
      }
    }
    for (const id of [...candidates.keys()]) {
      if (!selected.has(id) && !referenced.has(id)) {
        candidates.delete(id)
      }
    }
  }

  // Association-class intermediates consumed as pure N:M join tables.
  const consumedIntermediates = new Set<string>()
  const joinTables: KernelJoinTable[] = []
  interface PendingManyToMany {
    sourceId: string
    targetId: string
    intermediateId: string
  }
  const pendingManyToMany: PendingManyToMany[] = []

  for (const edge of edges) {
    const link = readString((edge.data as EdgeDataShape)?.associationClassNodeId)
    if (!link) {
      continue
    }
    const intermediate = candidates.get(link)
    if (!intermediate) {
      continue
    }
    const attrs = readMemberList(intermediate.data.attributes)
    const methods = readMemberList(intermediate.data.methods)
    if (attrs.length === 0 && methods.length === 0) {
      consumedIntermediates.add(link)
      pendingManyToMany.push({
        sourceId: edge.source,
        targetId: edge.target,
        intermediateId: link,
      })
    } else {
      warnings.push(
        `Association class "${intermediate.className}" carries extra attributes; join skipped, link emitted without mapping`
      )
    }
  }

  const enumNames = new Set<string>()
  for (const candidate of candidates.values()) {
    if (candidate.stereotype === "enum") {
      enumNames.add(candidate.className)
    }
  }

  const entities: KernelEntity[] = []
  const enums: KernelEnum[] = []
  const interfaces: KernelInterface[] = []
  const byNodeId = new Map<string, KernelEntity>()
  const byClassName = new Map<string, KernelEntity>()

  for (const candidate of candidates.values()) {
    if (consumedIntermediates.has(candidate.id)) {
      continue
    }
    const packagePath = packagePathFor(candidate.parentId)
    if (candidate.stereotype === "enum") {
      const values = readMemberList(candidate.data.attributes)
        .map((attr) => parseUmlAttribute(attr.name)?.name ?? "")
        .map((name) =>
          name
            .replace(/[^a-zA-Z0-9_]/g, "_")
            .toUpperCase()
            .replace(/^([0-9])/, "_$1")
        )
        .filter(Boolean)
      if (values.length === 0) {
        warnings.push(`Enumeration "${candidate.className}" has no values`)
      }
      enums.push({
        nodeId: candidate.id,
        name: candidate.className,
        packagePath,
        values,
      })
      continue
    }
    if (candidate.stereotype === "interface") {
      const methods = readMemberList(candidate.data.methods)
        .map((m) => parseUmlMethod(m.name))
        .filter((m): m is NonNullable<typeof m> => m !== null)
        .map((m) => ({
          name: toCamelCase(m.name),
          returnType: m.returnType ? mapUmlTypeToJava(m.returnType).javaType : "void",
          params: m.params.map((p) => ({
            name: toCamelCase(p.name),
            type: p.type ? mapUmlTypeToJava(p.type).javaType : "String",
          })),
        }))
      interfaces.push({
        nodeId: candidate.id,
        name: candidate.className,
        packagePath,
        methods,
      })
      continue
    }

    const scalars: KernelScalarColumn[] = [
      {
        fieldName: "id",
        javaType: "Long",
        columnName: "id",
        sqlType: "BIGSERIAL",
        nullable: false,
        id: true,
        dtoAnnotations: [],
        enumerated: false,
      },
    ]
    const takenNames = new Set<string>(["id"])
    const claimName = (desired: string, context: string): string => {
      let name = desired || "field"
      let counter = 2
      while (takenNames.has(name)) {
        warnings.push(
          `Duplicate member "${desired}" in class "${candidate.className}" renamed to "${desired}${counter}" (${context})`
        )
        name = `${desired}${counter}`
        counter += 1
      }
      takenNames.add(name)
      return name
    }

    for (const attr of readMemberList(candidate.data.attributes)) {
      const parsed = parseUmlAttribute(attr.name)
      if (!parsed) {
        warnings.push(
          `Unparsable attribute "${attr.name}" in class "${candidate.className}" skipped`
        )
        continue
      }
      if (parsed.name.toLowerCase() === "id") {
        warnings.push(
          `Attribute "id" in class "${candidate.className}" is reserved; synthetic primary key used instead`
        )
        continue
      }
      const fieldName = claimName(toCamelCase(parsed.name), "attribute")
      if (parsed.type && enumNames.has(toPascalCase(parsed.type))) {
        const enumType = toPascalCase(parsed.type)
        scalars.push({
          fieldName,
          javaType: enumType,
          columnName: toSnakeCase(fieldName),
          sqlType: "VARCHAR(255)",
          nullable: true,
          id: false,
          dtoAnnotations: [],
          enumerated: true,
        })
        continue
      }
      const mapped = mapUmlTypeToJava(parsed.type)
      if (mapped.unknown) {
        warnings.push(
          `Unknown type "${parsed.type}" for attribute "${parsed.name}" in class "${candidate.className}"; defaulted to String/TEXT`
        )
      }
      const dtoAnnotations =
        mapped.javaType === "String"
          ? ["@NotBlank"]
          : mapped.javaType === "Integer" ||
              mapped.javaType === "Long" ||
              mapped.javaType === "BigDecimal"
            ? ["@Positive"]
            : []
      scalars.push({
        fieldName,
        javaType: mapped.javaType,
        columnName: toSnakeCase(fieldName),
        sqlType: mapped.sqlType,
        nullable: true,
        id: false,
        dtoAnnotations,
        enumerated: false,
      })
    }

    const methodMembers = readMemberList(candidate.data.methods)
    if (methodMembers.length > 0) {
      warnings.push(
        `Class "${candidate.className}" defines ${methodMembers.length} operation(s); custom logic cannot be synthesized, only CRUD methods are generated`
      )
    }

    const entity: KernelEntity = {
      nodeId: candidate.id,
      className: candidate.className,
      tableName: toSnakeCase(candidate.className),
      packagePath,
      abstract: candidate.stereotype === "abstract",
      interfaces: [],
      scalars,
      relations: [],
      dependencyServices: [],
      hasChildren: false,
    }
    entities.push(entity)
    byNodeId.set(candidate.id, entity)
    byClassName.set(candidate.className, entity)
  }

  if (entities.length === 0) {
    throw new EmptyModelError()
  }

  const claimRelationName = (entity: KernelEntity, taken: Set<string>, desired: string): string => {
    let name = desired || "related"
    let counter = 2
    while (taken.has(name)) {
      warnings.push(
        `Duplicate association end "${desired}" in class "${entity.className}" renamed to "${desired}${counter}"`
      )
      name = `${desired}${counter}`
      counter += 1
    }
    taken.add(name)
    return name
  }

  const takenByEntity = new Map<string, Set<string>>()
  const takenFor = (entity: KernelEntity): Set<string> => {
    let taken = takenByEntity.get(entity.nodeId)
    if (!taken) {
      taken = new Set(entity.scalars.map((s) => s.fieldName))
      takenByEntity.set(entity.nodeId, taken)
    }
    return taken
  }

  for (const edge of edges) {
    const source = byNodeId.get(edge.source)
    const target = byNodeId.get(edge.target)
    const data = (edge.data ?? {}) as EdgeDataShape

    if (edge.type === DiagramEdgeTypeRecord.ClassInheritance) {
      if (!source || !target) {
        continue
      }
      const targetCandidate = candidates.get(edge.target)
      if (
        targetCandidate?.stereotype === "interface" ||
        interfaces.some((i) => i.nodeId === edge.target)
      ) {
        if (!source.interfaces.includes(target.className)) {
          source.interfaces.push(target.className)
        }
        warnings.push(`Inheritance edge to interface "${target.className}" treated as realization`)
        continue
      }
      source.parent = target.className
      target.hasChildren = true
      continue
    }

    if (edge.type === DiagramEdgeTypeRecord.ClassRealization) {
      if (!source || !target) {
        continue
      }
      if (!source.interfaces.includes(target.className)) {
        source.interfaces.push(target.className)
      }
      continue
    }

    if (edge.type === DiagramEdgeTypeRecord.ClassDependency) {
      if (!source || !target) {
        continue
      }
      if (!source.dependencyServices.includes(target.className)) {
        source.dependencyServices.push(target.className)
      }
      continue
    }

    if (readString(data.associationClassNodeId)) {
      continue
    }

    if (
      edge.type !== DiagramEdgeTypeRecord.ClassBidirectional &&
      edge.type !== DiagramEdgeTypeRecord.ClassUnidirectional &&
      edge.type !== DiagramEdgeTypeRecord.ClassAggregation &&
      edge.type !== DiagramEdgeTypeRecord.ClassComposition
    ) {
      continue
    }
    if (!source || !target) {
      continue
    }

    const targetRole = cleanRole(data.targetRole)
    const sourceRole = cleanRole(data.sourceRole)
    const forwardBase = targetRole || target.className
    const backwardBase = sourceRole || source.className

    if (
      edge.type === DiagramEdgeTypeRecord.ClassUnidirectional ||
      edge.type === DiagramEdgeTypeRecord.ClassBidirectional
    ) {
      const joinColumn = toSnakeCase(`${toCamelCase(forwardBase)}_id`)
      const fieldName = claimRelationName(source, takenFor(source), toCamelCase(forwardBase))
      source.relations.push({
        kind: "many-to-one",
        fieldName,
        targetEntity: target.className,
        targetTable: target.tableName,
        joinColumn,
        cascadeAll: false,
        orphanRemoval: false,
        nullable: true,
        onDelete: "SET NULL",
      })
      if (edge.type === DiagramEdgeTypeRecord.ClassBidirectional) {
        const backField = claimRelationName(
          target,
          takenFor(target),
          pluralize(toCamelCase(backwardBase))
        )
        target.relations.push({
          kind: "one-to-many",
          fieldName: backField,
          targetEntity: source.className,
          targetTable: source.tableName,
          mappedBy: fieldName,
          cascadeAll: false,
          orphanRemoval: false,
          nullable: true,
          onDelete: "NO ACTION",
        })
      }
      continue
    }

    // Aggregation / Composition: whole (source) holds the collection.
    const composition = edge.type === DiagramEdgeTypeRecord.ClassComposition
    const partField = claimRelationName(target, takenFor(target), toCamelCase(backwardBase))
    const partJoinColumn = toSnakeCase(`${toCamelCase(backwardBase)}_id`)
    target.relations.push({
      kind: "many-to-one",
      fieldName: partField,
      targetEntity: source.className,
      targetTable: source.tableName,
      joinColumn: partJoinColumn,
      cascadeAll: false,
      orphanRemoval: false,
      nullable: true,
      onDelete: composition ? "CASCADE" : "SET NULL",
    })
    const wholeField = claimRelationName(
      source,
      takenFor(source),
      pluralize(toCamelCase(targetRole || target.className))
    )
    source.relations.push({
      kind: "one-to-many",
      fieldName: wholeField,
      targetEntity: target.className,
      targetTable: target.tableName,
      mappedBy: partField,
      cascadeAll: composition,
      orphanRemoval: composition,
      nullable: true,
      onDelete: "NO ACTION",
    })
  }

  for (const pending of pendingManyToMany) {
    const source = byNodeId.get(pending.sourceId)
    const target = byNodeId.get(pending.targetId)
    if (!source || !target) {
      continue
    }
    const joinTableName = `${source.tableName}_${target.tableName}`
    const sourceColumn = `${toSnakeCase(source.className)}_id`
    const targetColumn = `${toSnakeCase(target.className)}_id`
    joinTables.push({
      tableName: joinTableName,
      sourceEntity: source.className,
      targetEntity: target.className,
      sourceTable: source.tableName,
      targetTable: target.tableName,
      sourceColumn,
      targetColumn,
    })
    const ownerField = claimRelationName(
      source,
      takenFor(source),
      pluralize(toCamelCase(target.className))
    )
    source.relations.push({
      kind: "many-to-many",
      fieldName: ownerField,
      targetEntity: target.className,
      targetTable: target.tableName,
      joinTable: joinTableName,
      joinColumnName: sourceColumn,
      inverseJoinColumnName: targetColumn,
      cascadeAll: false,
      orphanRemoval: false,
      nullable: true,
      onDelete: "NO ACTION",
    })
    const inverseField = claimRelationName(
      target,
      takenFor(target),
      pluralize(toCamelCase(source.className))
    )
    target.relations.push({
      kind: "many-to-many",
      fieldName: inverseField,
      targetEntity: source.className,
      targetTable: source.tableName,
      mappedBy: ownerField,
      cascadeAll: false,
      orphanRemoval: false,
      nullable: true,
      onDelete: "NO ACTION",
    })
  }

  return { entities, enums, interfaces, joinTables, warnings }
}

function javaPackagePath(packagePath: string): string {
  return packagePath.replace(/\./g, "/")
}

function collectEntityImports(entity: KernelEntity): string[] {
  const imports = new Set<string>([
    "jakarta.persistence.*",
    "lombok.Getter",
    "lombok.Setter",
    "lombok.NoArgsConstructor",
    "lombok.AllArgsConstructor",
  ])
  for (const scalar of entity.scalars) {
    if (scalar.javaType === "BigDecimal") {
      imports.add("java.math.BigDecimal")
    }
    if (scalar.javaType === "LocalDate") {
      imports.add("java.time.LocalDate")
    }
    if (scalar.javaType === "LocalTime") {
      imports.add("java.time.LocalTime")
    }
    if (scalar.javaType === "LocalDateTime") {
      imports.add("java.time.LocalDateTime")
    }
  }
  if (entity.relations.some((r) => r.kind !== "many-to-one")) {
    imports.add("java.util.ArrayList")
    imports.add("java.util.List")
  }
  return [...imports].sort()
}

/** Emits the JPA `@Entity` source for one kernel entity. */
export function emitEntityFile(
  entity: KernelEntity,
  inheritance: SpringBootInheritanceStrategy = "JOINED"
): SpringBootGeneratedFile {
  const lines: string[] = []
  lines.push(`package ${entity.packagePath}.entity;`)
  lines.push("")
  for (const imp of collectEntityImports(entity)) {
    lines.push(`import ${imp};`)
  }
  lines.push("")
  lines.push("@Getter")
  lines.push("@Setter")
  lines.push("@NoArgsConstructor")
  lines.push("@AllArgsConstructor")
  lines.push("@Entity")
  lines.push(`@Table(name = "${entity.tableName}")`)
  if (entity.hasChildren) {
    if (inheritance === "SINGLE_TABLE") {
      lines.push("@Inheritance(strategy = InheritanceType.SINGLE_TABLE)")
      lines.push('@DiscriminatorColumn(name = "dtype")')
    } else {
      lines.push("@Inheritance(strategy = InheritanceType.JOINED)")
    }
  }
  if (entity.parent && inheritance === "SINGLE_TABLE") {
    lines.push(`@DiscriminatorValue("${entity.className}")`)
  }
  const abstractMod = entity.abstract ? "abstract " : ""
  const extendsClause = entity.parent ? ` extends ${entity.parent}` : ""
  const implementsClause =
    entity.interfaces.length > 0 ? ` implements ${entity.interfaces.join(", ")}` : ""
  lines.push(`public ${abstractMod}class ${entity.className}${extendsClause}${implementsClause} {`)
  lines.push("")
  for (const scalar of entity.scalars) {
    if (scalar.id) {
      lines.push("  @Id")
      lines.push("  @GeneratedValue(strategy = GenerationType.IDENTITY)")
      lines.push(`  private ${scalar.javaType} ${scalar.fieldName};`)
      lines.push("")
      continue
    }
    if (scalar.enumerated) {
      lines.push("  @Enumerated(EnumType.STRING)")
    }
    lines.push(
      `  @Column(name = "${scalar.columnName}"${scalar.nullable ? "" : ", nullable = false"})`
    )
    lines.push(`  private ${scalar.javaType} ${scalar.fieldName};`)
    lines.push("")
  }
  for (const relation of entity.relations) {
    if (relation.kind === "many-to-one") {
      lines.push("  @ManyToOne")
      lines.push(
        `  @JoinColumn(name = "${relation.joinColumn}"${relation.nullable ? "" : ", nullable = false"})`
      )
      lines.push(`  private ${relation.targetEntity} ${relation.fieldName};`)
      lines.push("")
    } else if (relation.kind === "one-to-many") {
      const cascade = relation.cascadeAll ? ", cascade = CascadeType.ALL, orphanRemoval = true" : ""
      lines.push(`  @OneToMany(mappedBy = "${relation.mappedBy}"${cascade})`)
      lines.push(
        `  private List<${relation.targetEntity}> ${relation.fieldName} = new ArrayList<>();`
      )
      lines.push("")
    } else if (relation.mappedBy) {
      lines.push(`  @ManyToMany(mappedBy = "${relation.mappedBy}")`)
      lines.push(
        `  private List<${relation.targetEntity}> ${relation.fieldName} = new ArrayList<>();`
      )
      lines.push("")
    } else {
      lines.push("  @ManyToMany")
      lines.push(`  @JoinTable(name = "${relation.joinTable}",`)
      lines.push(`    joinColumns = @JoinColumn(name = "${relation.joinColumnName}"),`)
      lines.push(
        `    inverseJoinColumns = @JoinColumn(name = "${relation.inverseJoinColumnName}"))`
      )
      lines.push(
        `  private List<${relation.targetEntity}> ${relation.fieldName} = new ArrayList<>();`
      )
      lines.push("")
    }
  }

  // Explicit getters and setters to ensure reflection / devtools never fails even if Lombok is bypassed
  for (const scalar of entity.scalars) {
    const cap = scalar.fieldName.charAt(0).toUpperCase() + scalar.fieldName.slice(1)
    lines.push(`  public ${scalar.javaType} get${cap}() {`)
    lines.push(`    return this.${scalar.fieldName};`)
    lines.push("  }")
    lines.push("")
    lines.push(`  public void set${cap}(${scalar.javaType} ${scalar.fieldName}) {`)
    lines.push(`    this.${scalar.fieldName} = ${scalar.fieldName};`)
    lines.push("  }")
    lines.push("")
  }
  for (const relation of entity.relations) {
    const cap = relation.fieldName.charAt(0).toUpperCase() + relation.fieldName.slice(1)
    if (relation.kind === "many-to-one") {
      lines.push(`  public ${relation.targetEntity} get${cap}() {`)
      lines.push(`    return this.${relation.fieldName};`)
      lines.push("  }")
      lines.push("")
      lines.push(`  public void set${cap}(${relation.targetEntity} ${relation.fieldName}) {`)
      lines.push(`    this.${relation.fieldName} = ${relation.fieldName};`)
      lines.push("  }")
      lines.push("")
    } else {
      lines.push(`  public List<${relation.targetEntity}> get${cap}() {`)
      lines.push(`    return this.${relation.fieldName};`)
      lines.push("  }")
      lines.push("")
      lines.push(`  public void set${cap}(List<${relation.targetEntity}> ${relation.fieldName}) {`)
      lines.push(`    this.${relation.fieldName} = ${relation.fieldName};`)
      lines.push("  }")
      lines.push("")
    }
  }

  lines.push("}")
  lines.push("")
  return {
    path: `src/main/java/${javaPackagePath(entity.packagePath)}/entity/${entity.className}.java`,
    content: lines.join("\n"),
  }
}

/** Emits the Spring Data repository (auto CRUD queries, no hand queries). */
export function emitRepositoryFile(entity: KernelEntity): SpringBootGeneratedFile {
  const content = [
    `package ${entity.packagePath}.repository;`,
    "",
    "import org.springframework.data.jpa.repository.JpaRepository;",
    `import ${entity.packagePath}.entity.${entity.className};`,
    "",
    `public interface ${entity.className}Repository extends JpaRepository<${entity.className}, Long> {`,
    "}",
    "",
  ].join("\n")
  return {
    path: `src/main/java/${javaPackagePath(entity.packagePath)}/repository/${entity.className}Repository.java`,
    content,
  }
}

function collectDtoImports(entity: KernelEntity): Set<string> {
  const imports = new Set<string>([
    "lombok.Data",
    "lombok.NoArgsConstructor",
    "lombok.AllArgsConstructor",
    "io.swagger.v3.oas.annotations.media.Schema",
  ])
  for (const scalar of entity.scalars) {
    if (scalar.id) {
      continue
    }
    if (scalar.enumerated) {
      imports.add(`${entity.packagePath}.entity.${scalar.javaType}`)
    }
    if (scalar.javaType === "BigDecimal") {
      imports.add("java.math.BigDecimal")
    }
    if (scalar.javaType === "LocalDate") {
      imports.add("java.time.LocalDate")
    }
    if (scalar.javaType === "LocalTime") {
      imports.add("java.time.LocalTime")
    }
    if (scalar.javaType === "LocalDateTime") {
      imports.add("java.time.LocalDateTime")
    }
  }
  return imports
}

/** Emits the `{Class}Request` DTO with Jakarta Bean Validation and Swagger Schema examples. */
export function emitRequestDtoFile(entity: KernelEntity): SpringBootGeneratedFile {
  const lines: string[] = []
  lines.push(`package ${entity.packagePath}.dto.request;`)
  lines.push("")
  const imports = collectDtoImports(entity)
  if (entity.scalars.some((s) => !s.id && s.javaType === "String")) {
    imports.add("jakarta.validation.constraints.NotBlank")
  }
  if (
    entity.scalars.some(
      (s) =>
        !s.id && (s.javaType === "Integer" || s.javaType === "Long" || s.javaType === "BigDecimal")
    )
  ) {
    imports.add("jakarta.validation.constraints.Positive")
  }
  for (const imp of [...imports].sort()) {
    lines.push(`import ${imp};`)
  }
  lines.push("")
  lines.push("@Data")
  lines.push("@NoArgsConstructor")
  lines.push("@AllArgsConstructor")
  lines.push(`public class ${entity.className}Request {`)
  lines.push("")
  for (const scalar of entity.scalars) {
    if (scalar.id) {
      continue
    }
    for (const annotation of scalar.dtoAnnotations) {
      lines.push(`  ${annotation}`)
    }
    const exampleVal = getExecutableExample(scalar.fieldName, scalar.javaType)
    lines.push(`  @Schema(description = "${scalar.fieldName}", example = "${exampleVal}")`)
    lines.push(`  private ${scalar.javaType} ${scalar.fieldName};`)
    lines.push("")
  }
  for (const relation of entity.relations) {
    if (relation.kind === "many-to-one") {
      lines.push(`  @Schema(description = "ID de ${relation.fieldName}", example = "1")`)
      lines.push(`  private Long ${relation.fieldName}Id;`)
      lines.push("")
    }
  }

  // Explicit getters and setters so reflective method lookups and IDE compilers succeed cleanly
  for (const scalar of entity.scalars) {
    if (scalar.id) {
      continue
    }
    const cap = scalar.fieldName.charAt(0).toUpperCase() + scalar.fieldName.slice(1)
    lines.push(`  public ${scalar.javaType} get${cap}() {`)
    lines.push(`    return this.${scalar.fieldName};`)
    lines.push("  }")
    lines.push("")
    lines.push(`  public void set${cap}(${scalar.javaType} ${scalar.fieldName}) {`)
    lines.push(`    this.${scalar.fieldName} = ${scalar.fieldName};`)
    lines.push("  }")
    lines.push("")
  }
  for (const relation of entity.relations) {
    if (relation.kind === "many-to-one") {
      const cap = relation.fieldName.charAt(0).toUpperCase() + relation.fieldName.slice(1)
      lines.push(`  public Long get${cap}Id() {`)
      lines.push(`    return this.${relation.fieldName}Id;`)
      lines.push("  }")
      lines.push("")
      lines.push(`  public void set${cap}Id(Long ${relation.fieldName}Id) {`)
      lines.push(`    this.${relation.fieldName}Id = ${relation.fieldName}Id;`)
      lines.push("  }")
      lines.push("")
    }
  }

  lines.push("}")
  lines.push("")
  return {
    path: `src/main/java/${javaPackagePath(entity.packagePath)}/dto/request/${entity.className}Request.java`,
    content: lines.join("\n"),
  }
}

/** Emits the `{Class}Response` DTO (scalars plus FK ids, with Swagger Schema examples). */
export function emitResponseDtoFile(entity: KernelEntity): SpringBootGeneratedFile {
  const lines: string[] = []
  lines.push(`package ${entity.packagePath}.dto.response;`)
  lines.push("")
  for (const imp of [...collectDtoImports(entity)].sort()) {
    lines.push(`import ${imp};`)
  }
  lines.push("")
  lines.push("@Data")
  lines.push("@NoArgsConstructor")
  lines.push("@AllArgsConstructor")
  lines.push(`public class ${entity.className}Response {`)
  lines.push("")
  for (const scalar of entity.scalars) {
    const exampleVal = getExecutableExample(scalar.fieldName, scalar.javaType)
    lines.push(`  @Schema(description = "${scalar.fieldName}", example = "${exampleVal}")`)
    lines.push(`  private ${scalar.javaType} ${scalar.fieldName};`)
    lines.push("")
  }
  for (const relation of entity.relations) {
    if (relation.kind === "many-to-one") {
      lines.push(`  @Schema(description = "ID de ${relation.fieldName}", example = "1")`)
      lines.push(`  private Long ${relation.fieldName}Id;`)
      lines.push("")
    }
  }

  // Explicit getters and setters
  for (const scalar of entity.scalars) {
    const cap = scalar.fieldName.charAt(0).toUpperCase() + scalar.fieldName.slice(1)
    lines.push(`  public ${scalar.javaType} get${cap}() {`)
    lines.push(`    return this.${scalar.fieldName};`)
    lines.push("  }")
    lines.push("")
    lines.push(`  public void set${cap}(${scalar.javaType} ${scalar.fieldName}) {`)
    lines.push(`    this.${scalar.fieldName} = ${scalar.fieldName};`)
    lines.push("  }")
    lines.push("")
  }
  for (const relation of entity.relations) {
    if (relation.kind === "many-to-one") {
      const cap = relation.fieldName.charAt(0).toUpperCase() + relation.fieldName.slice(1)
      lines.push(`  public Long get${cap}Id() {`)
      lines.push(`    return this.${relation.fieldName}Id;`)
      lines.push("  }")
      lines.push("")
      lines.push(`  public void set${cap}Id(Long ${relation.fieldName}Id) {`)
      lines.push(`    this.${relation.fieldName}Id = ${relation.fieldName}Id;`)
      lines.push("  }")
      lines.push("")
    }
  }

  lines.push("}")
  lines.push("")
  return {
    path: `src/main/java/${javaPackagePath(entity.packagePath)}/dto/response/${entity.className}Response.java`,
    content: lines.join("\n"),
  }
}

/** Emits the `{Class}Service` CRUD interface. */
export function emitServiceFile(entity: KernelEntity): SpringBootGeneratedFile {
  const content = [
    `package ${entity.packagePath}.service;`,
    "",
    "import java.util.List;",
    `import ${entity.packagePath}.dto.request.${entity.className}Request;`,
    `import ${entity.packagePath}.dto.response.${entity.className}Response;`,
    "",
    `public interface ${entity.className}Service {`,
    "",
    `  ${entity.className}Response create(${entity.className}Request request);`,
    "",
    `  ${entity.className}Response getById(Long id);`,
    "",
    `  List<${entity.className}Response> getAll();`,
    "",
    `  ${entity.className}Response update(Long id, ${entity.className}Request request);`,
    "",
    "  void delete(Long id);",
    "}",
    "",
  ].join("\n")
  return {
    path: `src/main/java/${javaPackagePath(entity.packagePath)}/service/${entity.className}Service.java`,
    content,
  }
}

/** Emits the `{Class}ServiceImpl` with constructor injection. */
export function emitServiceImplFile(entity: KernelEntity): SpringBootGeneratedFile {
  const lines: string[] = []
  lines.push(`package ${entity.packagePath}.service.impl;`)
  lines.push("")
  const imports = new Set<string>([
    "java.util.List",
    "java.util.stream.Collectors",
    "jakarta.persistence.EntityNotFoundException",
    "org.springframework.stereotype.Service",
    `${entity.packagePath}.dto.request.${entity.className}Request`,
    `${entity.packagePath}.dto.response.${entity.className}Response`,
    `${entity.packagePath}.entity.${entity.className}`,
    `${entity.packagePath}.repository.${entity.className}Repository`,
    `${entity.packagePath}.service.${entity.className}Service`,
  ])
  const manyToOne = entity.relations.filter((r) => r.kind === "many-to-one")
  for (const relation of manyToOne) {
    imports.add(`${entity.packagePath}.repository.${relation.targetEntity}Repository`)
  }
  for (const dep of entity.dependencyServices) {
    imports.add(`${entity.packagePath}.service.${dep}Service`)
  }
  for (const imp of [...imports].sort()) {
    lines.push(`import ${imp};`)
  }
  lines.push("")
  lines.push("@Service")
  lines.push(`public class ${entity.className}ServiceImpl implements ${entity.className}Service {`)
  lines.push("")
  lines.push(`  private final ${entity.className}Repository repository;`)
  for (const relation of manyToOne) {
    lines.push(
      `  private final ${relation.targetEntity}Repository ${toCamelCase(relation.targetEntity)}Repository;`
    )
  }
  for (const dep of entity.dependencyServices) {
    lines.push(`  private final ${dep}Service ${toCamelCase(dep)}Service;`)
  }
  lines.push("")
  const ctorParams = [
    `${entity.className}Repository repository`,
    ...manyToOne.map((r) => `${r.targetEntity}Repository ${toCamelCase(r.targetEntity)}Repository`),
    ...entity.dependencyServices.map((dep) => `${dep}Service ${toCamelCase(dep)}Service`),
  ]
  lines.push(`  public ${entity.className}ServiceImpl(${ctorParams.join(", ")}) {`)
  lines.push("    this.repository = repository;")
  for (const relation of manyToOne) {
    const varName = `${toCamelCase(relation.targetEntity)}Repository`
    lines.push(`    this.${varName} = ${varName};`)
  }
  for (const dep of entity.dependencyServices) {
    const varName = `${toCamelCase(dep)}Service`
    lines.push(`    this.${varName} = ${varName};`)
  }
  lines.push("  }")
  lines.push("")
  lines.push("  @Override")
  lines.push(`  public ${entity.className}Response create(${entity.className}Request request) {`)
  lines.push(`    ${entity.className} entity = new ${entity.className}();`)
  lines.push("    applyRequest(entity, request);")
  lines.push("    return toResponse(repository.save(entity));")
  lines.push("  }")
  lines.push("")
  lines.push("  @Override")
  lines.push(`  public ${entity.className}Response getById(Long id) {`)
  lines.push(`    return toResponse(findOrFail(id));`)
  lines.push("  }")
  lines.push("")
  lines.push("  @Override")
  lines.push(`  public List<${entity.className}Response> getAll() {`)
  lines.push(
    "    return repository.findAll().stream().map(this::toResponse).collect(Collectors.toList());"
  )
  lines.push("  }")
  lines.push("")
  lines.push("  @Override")
  lines.push(
    `  public ${entity.className}Response update(Long id, ${entity.className}Request request) {`
  )
  lines.push(`    ${entity.className} entity = findOrFail(id);`)
  lines.push("    applyRequest(entity, request);")
  lines.push("    return toResponse(repository.save(entity));")
  lines.push("  }")
  lines.push("")
  lines.push("  @Override")
  lines.push("  public void delete(Long id) {")
  lines.push("    findOrFail(id);")
  lines.push("    repository.deleteById(id);")
  lines.push("  }")
  lines.push("")
  lines.push(`  private ${entity.className} findOrFail(Long id) {`)
  lines.push(
    `    return repository.findById(id).orElseThrow(() -> new EntityNotFoundException("${entity.className} not found: " + id));`
  )
  lines.push("  }")
  lines.push("")
  lines.push(
    `  private void applyRequest(${entity.className} entity, ${entity.className}Request request) {`
  )
  for (const scalar of entity.scalars) {
    if (scalar.id) {
      continue
    }
    const setter = `set${scalar.fieldName.charAt(0).toUpperCase()}${scalar.fieldName.slice(1)}`
    const getter = `get${scalar.fieldName.charAt(0).toUpperCase()}${scalar.fieldName.slice(1)}`
    lines.push(`    entity.${setter}(request.${getter}());`)
  }
  for (const relation of manyToOne) {
    const setter = `set${relation.fieldName.charAt(0).toUpperCase()}${relation.fieldName.slice(1)}`
    const getter = `get${relation.fieldName.charAt(0).toUpperCase()}${relation.fieldName.slice(1)}`
    const repoVar = `${toCamelCase(relation.targetEntity)}Repository`
    lines.push(`    if (request.${getter}Id() != null) {`)
    lines.push(
      `      entity.${setter}(${repoVar}.findById(request.${getter}Id()).orElseThrow(() -> new EntityNotFoundException("${relation.targetEntity} not found: " + request.${getter}Id())));`
    )
    lines.push("    } else {")
    lines.push(`      entity.${setter}(null);`)
    lines.push("    }")
  }
  lines.push("  }")
  lines.push("")
  lines.push(`  private ${entity.className}Response toResponse(${entity.className} entity) {`)
  lines.push(`    ${entity.className}Response response = new ${entity.className}Response();`)
  for (const scalar of entity.scalars) {
    const setter = `set${scalar.fieldName.charAt(0).toUpperCase()}${scalar.fieldName.slice(1)}`
    const getter = `get${scalar.fieldName.charAt(0).toUpperCase()}${scalar.fieldName.slice(1)}`
    lines.push(`    response.${setter}(entity.${getter}());`)
  }
  for (const relation of manyToOne) {
    const setter = `set${relation.fieldName.charAt(0).toUpperCase()}${relation.fieldName.slice(1)}`
    const getter = `get${relation.fieldName.charAt(0).toUpperCase()}${relation.fieldName.slice(1)}`
    lines.push(
      `    response.${setter}Id(entity.${getter}() != null ? entity.${getter}().getId() : null);`
    )
  }
  lines.push("    return response;")
  lines.push("  }")
  lines.push("}")
  lines.push("")
  return {
    path: `src/main/java/${javaPackagePath(entity.packagePath)}/service/impl/${entity.className}ServiceImpl.java`,
    content: lines.join("\n"),
  }
}

/** Emits the `{Class}Controller` with kebab-case plural routing. */
export function emitControllerFile(entity: KernelEntity): SpringBootGeneratedFile {
  const route = pluralize(toKebabCase(entity.className))
  const content = [
    `package ${entity.packagePath}.controller;`,
    "",
    "import java.util.List;",
    "import jakarta.validation.Valid;",
    "import org.springframework.http.HttpStatus;",
    "import org.springframework.http.ResponseEntity;",
    "import org.springframework.web.bind.annotation.DeleteMapping;",
    "import org.springframework.web.bind.annotation.GetMapping;",
    "import org.springframework.web.bind.annotation.PathVariable;",
    "import org.springframework.web.bind.annotation.PostMapping;",
    "import org.springframework.web.bind.annotation.PutMapping;",
    "import org.springframework.web.bind.annotation.RequestBody;",
    "import org.springframework.web.bind.annotation.RequestMapping;",
    "import org.springframework.web.bind.annotation.RestController;",
    `import ${entity.packagePath}.dto.request.${entity.className}Request;`,
    `import ${entity.packagePath}.dto.response.${entity.className}Response;`,
    `import ${entity.packagePath}.service.${entity.className}Service;`,
    "",
    "@RestController",
    `@RequestMapping("/api/${route}")`,
    `public class ${entity.className}Controller {`,
    "",
    `  private final ${entity.className}Service service;`,
    "",
    `  public ${entity.className}Controller(${entity.className}Service service) {`,
    "    this.service = service;",
    "  }",
    "",
    "  @PostMapping",
    `  public ResponseEntity<${entity.className}Response> create(@Valid @RequestBody ${entity.className}Request request) {`,
    "    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));",
    "  }",
    "",
    '  @GetMapping("/{id}")',
    `  public ResponseEntity<${entity.className}Response> getById(@PathVariable Long id) {`,
    "    return ResponseEntity.ok(service.getById(id));",
    "  }",
    "",
    "  @GetMapping",
    `  public ResponseEntity<List<${entity.className}Response>> getAll() {`,
    "    return ResponseEntity.ok(service.getAll());",
    "  }",
    "",
    '  @PutMapping("/{id}")',
    `  public ResponseEntity<${entity.className}Response> update(@PathVariable Long id, @Valid @RequestBody ${entity.className}Request request) {`,
    "    return ResponseEntity.ok(service.update(id, request));",
    "  }",
    "",
    '  @DeleteMapping("/{id}")',
    "  public ResponseEntity<Void> delete(@PathVariable Long id) {",
    "    service.delete(id);",
    "    return ResponseEntity.noContent().build();",
    "  }",
    "}",
    "",
  ].join("\n")
  return {
    path: `src/main/java/${javaPackagePath(entity.packagePath)}/controller/${entity.className}Controller.java`,
    content,
  }
}

/** Emits a Java `enum` for an enumeration node (never a table). */
export function emitEnumFile(e: KernelEnum): SpringBootGeneratedFile {
  const values = e.values.length > 0 ? e.values : ["UNKNOWN"]
  const content = [
    `package ${e.packagePath}.entity;`,
    "",
    `public enum ${e.name} {`,
    `  ${values.join(",\n  ")}`,
    "}",
    "",
  ].join("\n")
  return {
    path: `src/main/java/${javaPackagePath(e.packagePath)}/entity/${e.name}.java`,
    content,
  }
}

/** Emits a Java interface for an interface node (never an entity). */
export function emitInterfaceFile(iface: KernelInterface): SpringBootGeneratedFile {
  const lines: string[] = []
  lines.push(`package ${iface.packagePath}.entity;`)
  lines.push("")
  lines.push(`public interface ${iface.name} {`)
  for (const method of iface.methods) {
    const params = method.params.map((p) => `${p.type} ${p.name}`).join(", ")
    lines.push(`  ${method.returnType} ${method.name}(${params});`)
  }
  lines.push("}")
  lines.push("")
  return {
    path: `src/main/java/${javaPackagePath(iface.packagePath)}/entity/${iface.name}.java`,
    content: lines.join("\n"),
  }
}

/** Emits `OpenApiConfig.java` to configure Swagger UI and OpenAPI documentation metadata. */
export function emitOpenApiConfigFile(
  packagePath: string,
  apiTitle: string = "UmlStudio API"
): SpringBootGeneratedFile {
  const content = [
    `package ${packagePath}.config;`,
    "",
    "import io.swagger.v3.oas.models.OpenAPI;",
    "import io.swagger.v3.oas.models.info.Info;",
    "import io.swagger.v3.oas.models.info.Contact;",
    "import org.springframework.context.annotation.Bean;",
    "import org.springframework.context.annotation.Configuration;",
    "",
    "@Configuration",
    "public class OpenApiConfig {",
    "",
    "  @Bean",
    "  public OpenAPI customOpenAPI() {",
    "    return new OpenAPI()",
    "      .info(new Info()",
    `        .title("${apiTitle}")`,
    '        .version("1.0.0")',
    '        .description("API REST generada automáticamente por UmlStudio con documentación interactiva Swagger UI.")',
    '        .contact(new Contact().name("UmlStudio").url("https://umlstudio.dev")));',
    "  }",
    "}",
    "",
  ].join("\n")
  return {
    path: `src/main/java/${javaPackagePath(packagePath)}/config/OpenApiConfig.java`,
    content,
  }
}

/**
 * High-level orchestration for CU-06: transforms a UML diagram model into
 * the complete set of layered Spring Boot files (entities, repositories,
 * services, DTOs, controllers, config, SQL).
 */
export async function exportSpringBootFull(
  model: UMLModel,
  options: SpringBootFullExportOptions = {}
): Promise<SpringBootFullExportResult> {
  const inheritance = options.inheritance ?? "JOINED"
  const kernel = buildKernelModel(model, options)
  const files: SpringBootGeneratedFile[] = []
  for (const e of kernel.enums) {
    files.push(emitEnumFile(e))
  }
  for (const iface of kernel.interfaces) {
    files.push(emitInterfaceFile(iface))
  }
  let totalDtos = 0
  for (const entity of kernel.entities) {
    files.push(emitEntityFile(entity, inheritance))
    files.push(emitRepositoryFile(entity))
    files.push(emitServiceFile(entity))
    files.push(emitServiceImplFile(entity))
    files.push(emitRequestDtoFile(entity))
    files.push(emitResponseDtoFile(entity))
    files.push(emitControllerFile(entity))
    totalDtos += 2
  }
  const basePackage = kernel.entities[0]?.packagePath ?? options.packageName ?? "com.example.demo"
  files.push(emitOpenApiConfigFile(basePackage, model.title || "UmlStudio API"))
  return {
    files,
    warnings: kernel.warnings,
    summary: {
      totalEntities: kernel.entities.length,
      totalRepositories: kernel.entities.length,
      totalServices: kernel.entities.length,
      totalDtos,
      totalControllers: kernel.entities.length,
    },
  }
}
