import type { UMLModel, UmlStudioNode, UmlStudioEdge, Assessment } from "../typings"
import {
  DiagramNodeTypeRecord,
  DiagramEdgeTypeRecord,
  type DiagramNodeType,
  type DiagramEdgeType,
} from "../modelElementTypes"
import { generateUUID, LAYOUT, DROPS } from "../constants"
import { calculateMinHeight } from "../utils/layoutUtils"
import type {
  ModelDiff,
  ModelDiffValidationResult,
  DiffElementAdd,
  DiffRelationshipAdd,
} from "./types"

const VALID_NODE_TYPES = new Set([
  ...Object.values(DiagramNodeTypeRecord),
  "Class",
  "Package",
  "class",
  "package",
  "Interface",
  "interface",
  "Enum",
  "enum",
])

const EDGE_TYPE_MAP: Record<string, DiagramEdgeType> = {
  classinheritance: "ClassInheritance",
  inheritance: "ClassInheritance",
  generalization: "ClassInheritance",
  extends: "ClassInheritance",
  classrealization: "ClassRealization",
  realization: "ClassRealization",
  implements: "ClassRealization",
  classaggregation: "ClassAggregation",
  aggregation: "ClassAggregation",
  classcomposition: "ClassComposition",
  composition: "ClassComposition",
  classdependency: "ClassDependency",
  dependency: "ClassDependency",
  classbidirectional: "ClassBidirectional",
  bidirectional: "ClassBidirectional",
  association: "ClassBidirectional",
  classunidirectional: "ClassUnidirectional",
  unidirectional: "ClassUnidirectional",
}

/**
 * Validates a ModelDiff payload against the required schema structure and normalizes types.
 */
export function validateDiff(diff: unknown): ModelDiffValidationResult {
  const errors: string[] = []

  if (!diff || typeof diff !== "object") {
    return { valid: false, errors: ["ModelDiff must be a non-null object"] }
  }

  const d = diff as ModelDiff

  if (d.add) {
    if (d.add.elements) {
      if (!Array.isArray(d.add.elements)) {
        errors.push("add.elements must be an array")
      } else {
        d.add.elements.forEach((el, index) => {
          if (!el.name || typeof el.name !== "string") {
            errors.push(`add.elements[${index}].name is required and must be a string`)
          }
          const rawType = el.type as string | undefined
          if (!rawType || !VALID_NODE_TYPES.has(rawType)) {
            errors.push(
              `add.elements[${index}].type '${rawType}' is invalid. Allowed: ${Array.from(
                VALID_NODE_TYPES
              ).join(", ")}`
            )
          } else {
            // Normalize type to lowercase "class" or "package" for schema conformance
            const lower = rawType.toLowerCase()
            if (lower === "package") {
              el.type = DiagramNodeTypeRecord.package
            } else {
              el.type = DiagramNodeTypeRecord.class
              if (lower === "interface" && !el.stereotype) {
                el.stereotype = "<<interface>>"
              } else if (lower === "enum" && !el.stereotype) {
                el.stereotype = "<<enumeration>>"
              }
            }
          }
        })
      }
    }

    if (d.add.relationships) {
      if (!Array.isArray(d.add.relationships)) {
        errors.push("add.relationships must be an array")
      } else {
        d.add.relationships.forEach((rel, index) => {
          if (!rel.source || typeof rel.source !== "string") {
            errors.push(`add.relationships[${index}].source is required`)
          }
          if (!rel.target || typeof rel.target !== "string") {
            errors.push(`add.relationships[${index}].target is required`)
          }
          const rawType = rel.type as string | undefined
          const mappedType = rawType ? (EDGE_TYPE_MAP[rawType.toLowerCase()] ?? rawType) : undefined
          if (
            !mappedType ||
            !Object.values(DiagramEdgeTypeRecord).includes(mappedType as DiagramEdgeType)
          ) {
            errors.push(
              `add.relationships[${index}].type '${rawType}' is invalid. Allowed: ${Array.from(
                Object.values(DiagramEdgeTypeRecord)
              ).join(", ")}`
            )
          } else {
            rel.type = mappedType as DiagramEdgeType
          }
        })
      }
    }
  }

  if (d.modify?.elements) {
    if (!Array.isArray(d.modify.elements)) {
      errors.push("modify.elements must be an array")
    } else {
      d.modify.elements.forEach((mod, index) => {
        if (!mod.id || typeof mod.id !== "string") {
          errors.push(`modify.elements[${index}].id is required`)
        }
        if (!mod.changes || typeof mod.changes !== "object") {
          errors.push(`modify.elements[${index}].changes must be an object`)
        } else {
          const ch = mod.changes as Record<string, unknown>
          // Normalize snake_case aliases
          if (ch.remove_attributes && !ch.removeAttributes) {
            ch.removeAttributes = ch.remove_attributes
          }
          if (ch.remove_methods && !ch.removeMethods) {
            ch.removeMethods = ch.remove_methods
          }
          // Sanitize nulls
          if (
            ch.name === null ||
            (ch.name !== undefined && (typeof ch.name !== "string" || !ch.name.trim()))
          ) {
            delete ch.name
          }
          if (
            ch.stereotype === null ||
            (ch.stereotype !== undefined && typeof ch.stereotype !== "string")
          ) {
            delete ch.stereotype
          }
          if (ch.position !== undefined) {
            if (
              !ch.position ||
              typeof ch.position !== "object" ||
              typeof (ch.position as { x?: unknown }).x !== "number" ||
              typeof (ch.position as { y?: unknown }).y !== "number" ||
              !Number.isFinite((ch.position as { x: number }).x) ||
              !Number.isFinite((ch.position as { y: number }).y)
            ) {
              delete ch.position
            }
          }
          if (ch.attributes === null) delete ch.attributes
          if (ch.methods === null) delete ch.methods
        }
      })
    }
  }

  if (d.remove) {
    const rawRem = d.remove as Record<string, unknown>
    if (rawRem.element_ids && !d.remove.elementIds) {
      d.remove.elementIds = rawRem.element_ids as string[]
    }
    if (rawRem.relationship_ids && !d.remove.relationshipIds) {
      d.remove.relationshipIds = rawRem.relationship_ids as string[]
    }
    if (d.remove.elementIds && !Array.isArray(d.remove.elementIds)) {
      errors.push("remove.elementIds must be an array")
    }
    if (d.remove.relationshipIds && !Array.isArray(d.remove.relationshipIds)) {
      errors.push("remove.relationshipIds must be an array")
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  }
}

/**
 * Normalizes an element name or identifier for fuzzy/canonical matching across LLM outputs.
 * Strips 'Class ', 'Clase ', 'Interface ', underscores, dashes, and extra whitespace.
 */
export function normalizeIdentifier(val: string): string {
  if (!val || typeof val !== "string") return ""
  return val
    .trim()
    .toLowerCase()
    .replace(/^(class|clase|interface|interfaz|enum|enumeration|package|paquete)\s+/i, "")
    .replace(/[\s_-]+/g, "")
}

/**
 * Extracts bare member name from a UML attribute or method string.
 * e.g. "+ nombre: String" -> "nombre", "- id" -> "id", "getName(): void" -> "getname"
 */
export function extractBareMemberName(raw: string): string {
  if (!raw || typeof raw !== "string") return ""
  return raw
    .trim()
    .replace(/^[+\-#~]\s*/, "")
    .split(/[:(]/)[0]
    .trim()
    .toLowerCase()
}

/**
 * Robust node finder that resolves target nodes by exact ID, exact name,
 * case-insensitive name, normalized name (ignoring Class/Clase prefixes),
 * or partial ID.
 */
export function findTargetNode(nodes: UmlStudioNode[], query: string): UmlStudioNode | undefined {
  if (!query || typeof query !== "string") return undefined
  const trimmed = query.trim()
  const lowerQuery = trimmed.toLowerCase()

  // Guard against generic words matching real nodes
  if (
    [
      "node",
      "class",
      "clase",
      "element",
      "elemento",
      "id",
      "item",
      "null",
      "undefined",
      "todos",
      "todas",
      "all",
    ].includes(lowerQuery)
  ) {
    return undefined
  }

  // 1. Exact ID match
  const byId = nodes.find((n) => n.id === trimmed)
  if (byId) return byId

  // 2. Exact name match
  const byName = nodes.find((n) => n.data.name === trimmed)
  if (byName) return byName

  // 3. Case-insensitive name match
  const byLowerName = nodes.find(
    (n) => typeof n.data.name === "string" && n.data.name.toLowerCase() === lowerQuery
  )
  if (byLowerName) return byLowerName

  // 4. Normalized identifier match (strips "Class ", "Clase ", spaces, underscores)
  const normQuery = normalizeIdentifier(trimmed)
  if (normQuery) {
    const byNorm = nodes.find(
      (n) => typeof n.data.name === "string" && normalizeIdentifier(n.data.name) === normQuery
    )
    if (byNorm) return byNorm
  }

  // 5. Word boundary / suffix match (e.g. node name is "Class D" and query is "D")
  if (normQuery.length >= 2) {
    const byWord = nodes.find((n) => {
      if (typeof n.data.name !== "string") return false
      const parts = n.data.name.split(/[\s_-]+/)
      return parts.some(
        (p) => p.toLowerCase() === lowerQuery || normalizeIdentifier(p) === normQuery
      )
    })
    if (byWord) return byWord
  }

  // 6. Partial ID match only for UUID-like lengths (at least 8 characters)
  if (trimmed.length >= 8) {
    const byIdSub = nodes.find((n) => n.id.toLowerCase().includes(lowerQuery))
    if (byIdSub) return byIdSub
  }

  return undefined
}

/**
 * Applies a ModelDiff onto a UMLModel, returning a validated, consistent new model instance.
 */
export function applyDiff(currentModel: UMLModel, diff: ModelDiff): UMLModel {
  const validation = validateDiff(diff)
  if (!validation.valid) {
    throw new Error(`Cannot apply invalid ModelDiff: ${validation.errors?.join("; ")}`)
  }

  // Deep clone nodes, edges, assessments, interactive to maintain immutability
  const nodes: UmlStudioNode[] = (currentModel.nodes ?? []).map((n) => ({
    ...n,
    position: { ...(n.position ?? { x: 0, y: 0 }) },
    measured: { ...(n.measured ?? { width: 200, height: 50 }) },
    data: {
      ...(n.data ?? {}),
      attributes: Array.isArray(n.data?.attributes) ? [...n.data.attributes] : [],
      methods: Array.isArray(n.data?.methods) ? [...n.data.methods] : [],
    },
  }))
  const edges: UmlStudioEdge[] = (currentModel.edges ?? []).map((e) => ({
    ...e,
    data: {
      ...(e.data ?? {}),
      points: Array.isArray(e.data?.points) ? e.data.points.map((p) => ({ ...p })) : [],
    },
  }))
  const assessments: Record<string, Assessment> = {
    ...currentModel.assessments,
  }
  const interactiveElements: Record<string, boolean> = {
    ...(currentModel.interactive?.elements ?? {}),
  }
  const interactiveRelationships: Record<string, boolean> = {
    ...(currentModel.interactive?.relationships ?? {}),
  }

  // Helper to resolve node ID from either ID or Name
  const resolveNodeId = (idOrName: string): string => {
    const found = findTargetNode(nodes, idOrName)
    return found ? found.id : idOrName
  }

  // 1. Process Removals
  if (diff.remove) {
    const rawElementIds =
      diff.remove.elementIds ?? (diff.remove as Record<string, unknown>).element_ids ?? []
    const removedElementIds = new Set<string>()
    for (const rawId of Array.isArray(rawElementIds) ? rawElementIds : [rawElementIds]) {
      if (!rawId || typeof rawId !== "string") continue
      const matched = findTargetNode(nodes, rawId)
      if (matched) {
        removedElementIds.add(matched.id)
      } else {
        removedElementIds.add(rawId.trim())
      }
    }
    const rawRelIds =
      diff.remove.relationshipIds ?? (diff.remove as Record<string, unknown>).relationship_ids ?? []
    const removedRelIds = new Set<string>(
      (Array.isArray(rawRelIds) ? rawRelIds : [rawRelIds]).filter(Boolean).map(String)
    )

    // Filter nodes
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (removedElementIds.has(nodes[i].id)) {
        delete assessments[nodes[i].id]
        delete interactiveElements[nodes[i].id]
        nodes.splice(i, 1)
      }
    }

    // Filter edges (explicit removal by ID or by connected endpoints, or cascade when node was deleted)
    for (let i = edges.length - 1; i >= 0; i--) {
      const edge = edges[i]
      const sourceNode = nodes.find((n) => n.id === edge.source)
      const targetNode = nodes.find((n) => n.id === edge.target)
      const sName =
        typeof (sourceNode?.data as { name?: unknown })?.name === "string"
          ? (sourceNode!.data as { name: string }).name.toLowerCase()
          : ""
      const tName =
        typeof (targetNode?.data as { name?: unknown })?.name === "string"
          ? (targetNode!.data as { name: string }).name.toLowerCase()
          : ""

      let isMatch =
        removedRelIds.has(edge.id) ||
        removedElementIds.has(edge.source) ||
        removedElementIds.has(edge.target)

      if (!isMatch && (diff.remove.relationshipIds?.length ?? 0) > 0) {
        for (const rawRel of diff.remove.relationshipIds!) {
          const lowerRel = rawRel.toLowerCase()
          if (sName && tName && lowerRel.includes(sName) && lowerRel.includes(tName)) {
            isMatch = true
            break
          }
        }
      }

      if (isMatch) {
        delete interactiveRelationships[edge.id]
        edges.splice(i, 1)
      }
    }
  }

  // Common layout grid variables for auto-positioning new nodes
  const startX = 100
  const startY = 120
  const spacingX = 280
  const spacingY = 220

  // 2. Process Additions
  if (diff.add?.elements) {
    let newElementsCount = 0

    diff.add.elements.forEach((el: DiffElementAdd) => {
      // Check if node already exists in the model (e.g. LLM used add.elements to append fields)
      const existing = findTargetNode(nodes, el.name)
      if (existing) {
        // Merge attributes avoiding duplicates by bare name
        if (el.attributes && el.attributes.length > 0) {
          const existingAttrs = Array.isArray(existing.data.attributes)
            ? (existing.data.attributes as Array<{ id: string; name: string }>)
            : []
          // Split any bundled comma-separated attributes
          const rawAttrsList: string[] = []
          for (const attr of el.attributes) {
            const aName = typeof attr === "string" ? attr : (attr.name ?? "")
            if (aName.includes(",") && (aName.includes(":") || aName.includes(" "))) {
              rawAttrsList.push(
                ...aName
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            } else if (aName.trim()) {
              rawAttrsList.push(aName.trim())
            }
          }
          const newAttrs = rawAttrsList.map((name) => ({
            id: `attr-${generateUUID()}`,
            name:
              name.startsWith("+") ||
              name.startsWith("-") ||
              name.startsWith("#") ||
              name.startsWith("~")
                ? name
                : `+ ${name}`,
          }))
          const newAttrBareMap = new Map<string, { id: string; name: string }>()
          newAttrs.forEach((a) => {
            const bare = extractBareMemberName(a.name)
            if (bare) newAttrBareMap.set(bare, a)
          })

          const updatedAttrs = existingAttrs.map((existingAttr) => {
            const bare = extractBareMemberName(existingAttr.name)
            if (bare && newAttrBareMap.has(bare)) {
              const replacement = newAttrBareMap.get(bare)!
              newAttrBareMap.delete(bare)
              return { ...existingAttr, name: replacement.name }
            }
            return existingAttr
          })
          // Append truly new attributes that didn't match any existing member
          existing.data.attributes = [...updatedAttrs, ...Array.from(newAttrBareMap.values())]
        }

        // Merge methods avoiding duplicates by bare name
        if (el.methods && el.methods.length > 0) {
          const existingMethods = Array.isArray(existing.data.methods)
            ? (existing.data.methods as Array<{ id: string; name: string }>)
            : []
          const rawMethodsList: string[] = []
          for (const meth of el.methods) {
            const mName = typeof meth === "string" ? meth : (meth.name ?? "")
            if (mName.includes(",") && mName.includes("(")) {
              rawMethodsList.push(
                ...mName
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            } else if (mName.trim()) {
              rawMethodsList.push(mName.trim())
            }
          }
          const newMethods = rawMethodsList.map((name) => ({
            id: `op-${generateUUID()}`,
            name:
              name.startsWith("+") ||
              name.startsWith("-") ||
              name.startsWith("#") ||
              name.startsWith("~")
                ? name
                : `+ ${name}`,
          }))
          const newMethodBareMap = new Map<string, { id: string; name: string }>()
          newMethods.forEach((m) => {
            const bare = extractBareMemberName(m.name)
            if (bare) newMethodBareMap.set(bare, m)
          })

          const updatedMethods = existingMethods.map((existingMeth) => {
            const bare = extractBareMemberName(existingMeth.name)
            if (bare && newMethodBareMap.has(bare)) {
              const replacement = newMethodBareMap.get(bare)!
              newMethodBareMap.delete(bare)
              return { ...existingMeth, name: replacement.name }
            }
            return existingMeth
          })
          existing.data.methods = [...updatedMethods, ...Array.from(newMethodBareMap.values())]
        }

        if (el.stereotype && !existing.data.stereotype) {
          existing.data.stereotype = el.stereotype
        }

        return
      }

      // If genuinely new node:
      const nodeId = el.id ?? `node-${generateUUID()}`

      const col = (nodes.length + newElementsCount) % 3
      const row = Math.floor((nodes.length + newElementsCount) / 3)
      newElementsCount++

      const posX = el.position?.x ?? startX + col * spacingX
      const posY = el.position?.y ?? startY + row * spacingY

      const formattedAttributes = (el.attributes ?? []).map((attr) => ({
        id: attr.id ?? `attr-${generateUUID()}`,
        name: attr.name,
      }))

      const formattedMethods = (el.methods ?? []).map((method) => ({
        id: method.id ?? `op-${generateUUID()}`,
        name: method.name,
      }))

      const showStereotype = !!el.stereotype
      const headerHeight = showStereotype
        ? LAYOUT.DEFAULT_HEADER_HEIGHT_WITH_STEREOTYPE
        : LAYOUT.DEFAULT_HEADER_HEIGHT
      const isAssociationClass =
        el.stereotype === "<<association>>" ||
        el.stereotype === "association" ||
        Boolean((el as unknown as { isAssociationClass?: boolean }).isAssociationClass)
      const isEnumeration = el.stereotype === "<<enumeration>>" || el.stereotype === "enumeration"
      const reserveCompartments = !isEnumeration

      const calculatedHeight = calculateMinHeight(
        headerHeight,
        formattedAttributes.length,
        formattedMethods.length,
        LAYOUT.DEFAULT_ATTRIBUTE_HEIGHT,
        LAYOUT.DEFAULT_METHOD_HEIGHT,
        reserveCompartments
      )

      const clampedWidth = DROPS.DEFAULT_ELEMENT_WIDTH
      const clampedHeight = Math.max(100, calculatedHeight)

      const normalizedNodeType: DiagramNodeType =
        el.type?.toLowerCase() === "package" ? "package" : "class"

      const newNode: UmlStudioNode = {
        id: nodeId,
        type: normalizedNodeType,
        position: { x: posX, y: posY },
        width: clampedWidth,
        height: clampedHeight,
        measured: { width: clampedWidth, height: clampedHeight },
        data: {
          name: el.name,
          ...(el.stereotype ? { stereotype: el.stereotype } : {}),
          ...(isAssociationClass ? { isAssociationClass: true } : {}),
          attributes: formattedAttributes,
          methods: formattedMethods,
        },
      }

      nodes.push(newNode)
      assessments[nodeId] = {
        modelElementId: nodeId,
        elementType: el.stereotype === "<<interface>>" ? "Interface" : "Class",
        score: 1,
      }
      interactiveElements[nodeId] = true
    })
  }

  if (diff.add?.relationships) {
    diff.add.relationships.forEach((rel: DiffRelationshipAdd) => {
      let sourceId = resolveNodeId(rel.source)
      let targetId = resolveNodeId(rel.target)

      let sourceNode = nodes.find((n) => n.id === sourceId)
      let targetNode = nodes.find((n) => n.id === targetId)

      // Auto-create normal classes if they do not exist in model for this relationship
      if (!sourceNode && rel.source) {
        const newSourceId = `node-${generateUUID()}`
        const col = nodes.length % 3
        const row = Math.floor(nodes.length / 3)
        const posX = startX + col * spacingX
        const posY = startY + row * spacingY
        sourceNode = {
          id: newSourceId,
          type: "class",
          position: { x: posX, y: posY },
          width: DROPS.DEFAULT_ELEMENT_WIDTH,
          height: 100,
          measured: { width: DROPS.DEFAULT_ELEMENT_WIDTH, height: 100 },
          data: {
            name: rel.source,
            attributes: [],
            methods: [],
          },
        }
        nodes.push(sourceNode)
        sourceId = newSourceId
        assessments[newSourceId] = {
          modelElementId: newSourceId,
          elementType: "Class",
          score: 1,
        }
        interactiveElements[newSourceId] = true
      }

      if (!targetNode && rel.target) {
        const newTargetId = `node-${generateUUID()}`
        const col = nodes.length % 3
        const row = Math.floor(nodes.length / 3)
        const posX = startX + col * spacingX
        const posY = startY + row * spacingY
        targetNode = {
          id: newTargetId,
          type: "class",
          position: { x: posX, y: posY },
          width: DROPS.DEFAULT_ELEMENT_WIDTH,
          height: 100,
          measured: { width: DROPS.DEFAULT_ELEMENT_WIDTH, height: 100 },
          data: {
            name: rel.target,
            attributes: [],
            methods: [],
          },
        }
        nodes.push(targetNode)
        targetId = newTargetId
        assessments[newTargetId] = {
          modelElementId: newTargetId,
          elementType: "Class",
          score: 1,
        }
        interactiveElements[newTargetId] = true
      }

      const edgeId = rel.id ?? `edge-${generateUUID()}`

      // Calculate default orthogonal points between source and target
      const sx = sourceNode ? sourceNode.position.x + sourceNode.width : 200
      const sy = sourceNode ? sourceNode.position.y + Math.floor(sourceNode.height / 2) : 150
      const tx = targetNode ? targetNode.position.x : 400
      const ty = targetNode ? targetNode.position.y + Math.floor(targetNode.height / 2) : 150
      const midX = Math.round((sx + tx) / 2)

      if (rel.associationClass === "MF_Assoc") {
        const sName = sourceNode?.data?.name || rel.source
        const tName = targetNode?.data?.name || rel.target
        if (sName !== "M" && tName !== "F" && sName !== "F" && tName !== "M") {
          rel.associationClass = `${sName}${tName}_Assoc`
        }
      }

      const assocClassId = rel.associationClass ? resolveNodeId(rel.associationClass) : undefined

      let assocNode: UmlStudioNode | undefined = assocClassId
        ? nodes.find((n) => n.id === assocClassId)
        : undefined
      if (!assocNode && rel.associationClass && sourceNode && targetNode) {
        const newNodeId = `node-${generateUUID()}`
        const defaultX = Math.round((sourceNode.position.x + targetNode.position.x) / 2)
        const defaultY = Math.round((sourceNode.position.y + targetNode.position.y) / 2) + 130
        const newAssocNode: UmlStudioNode = {
          id: newNodeId,
          type: "class",
          position: { x: defaultX, y: defaultY },
          width: DROPS.DEFAULT_ELEMENT_WIDTH,
          height: 110,
          measured: { width: DROPS.DEFAULT_ELEMENT_WIDTH, height: 110 },
          data: {
            name: rel.associationClass,
            stereotype: "<<association>>",
            isAssociationClass: true,
            attributes: [],
            methods: [],
          },
        }
        nodes.push(newAssocNode)
        assocNode = newAssocNode
        assessments[newNodeId] = {
          modelElementId: newNodeId,
          elementType: "Class",
          score: 1,
        }
        interactiveElements[newNodeId] = true
      } else if (assocNode && sourceNode && targetNode) {
        assocNode.data.isAssociationClass = true
        if (!assocNode.data.stereotype) {
          assocNode.data.stereotype = "<<association>>"
        }
        const defaultX = Math.round((sourceNode.position.x + targetNode.position.x) / 2)
        const defaultY = Math.round((sourceNode.position.y + targetNode.position.y) / 2) + 130
        assocNode.position = { x: defaultX, y: defaultY }
      }

      const newEdge: UmlStudioEdge = {
        id: edgeId,
        source: sourceId,
        target: targetId,
        type: rel.type,
        sourceHandle: rel.sourceHandle ?? "right",
        targetHandle: rel.targetHandle ?? "left",
        data: {
          points: [
            { x: sx, y: sy },
            { x: midX, y: sy },
            { x: midX, y: ty },
            { x: tx, y: ty },
          ],
          ...(assocNode ? { associationClassNodeId: assocNode.id } : {}),
        },
      }

      edges.push(newEdge)
      interactiveRelationships[edgeId] = true
    })
  }

  // 3. Process Modifications
  if (diff.modify?.elements) {
    diff.modify.elements.forEach((mod) => {
      const targetNode = findTargetNode(nodes, mod.id)
      if (targetNode) {
        if (typeof mod.changes.name === "string" && mod.changes.name.trim().length > 0) {
          targetNode.data.name = mod.changes.name.trim()
        }
        if (
          typeof mod.changes.stereotype === "string" &&
          mod.changes.stereotype.trim().length > 0
        ) {
          targetNode.data.stereotype = mod.changes.stereotype.trim()
        }
        // Remove specific attributes if requested
        const removeAttrs = Array.isArray(mod.changes.removeAttributes)
          ? mod.changes.removeAttributes
          : Array.isArray((mod.changes as Record<string, unknown>).remove_attributes)
            ? ((mod.changes as Record<string, unknown>).remove_attributes as string[])
            : []
        if (removeAttrs.length > 0) {
          const toRemoveSet = new Set(removeAttrs.map(extractBareMemberName))
          const existingAttrs = Array.isArray(targetNode.data.attributes)
            ? (targetNode.data.attributes as Array<{ id: string; name: string }>)
            : []
          targetNode.data.attributes = existingAttrs.filter((a) => {
            const bare = extractBareMemberName(a.name)
            return !toRemoveSet.has(bare) && !removeAttrs.includes(a.name)
          })
        }

        // Remove specific methods if requested
        const removeMethods = Array.isArray(mod.changes.removeMethods)
          ? mod.changes.removeMethods
          : Array.isArray((mod.changes as Record<string, unknown>).remove_methods)
            ? ((mod.changes as Record<string, unknown>).remove_methods as string[])
            : []
        if (removeMethods.length > 0) {
          const toRemoveSet = new Set(removeMethods.map(extractBareMemberName))
          const existingMethods = Array.isArray(targetNode.data.methods)
            ? (targetNode.data.methods as Array<{ id: string; name: string }>)
            : []
          targetNode.data.methods = existingMethods.filter((m) => {
            const bare = extractBareMemberName(m.name)
            return !toRemoveSet.has(bare) && !removeMethods.includes(m.name)
          })
        }

        if (mod.changes.attributes !== undefined && mod.changes.attributes !== null) {
          if (Array.isArray(mod.changes.attributes)) {
            if (mod.changes.attributes.length === 0) {
              // Explicit clear / deletion of attributes
              targetNode.data.attributes = []
            } else {
              const existingAttrs = Array.isArray(targetNode.data.attributes)
                ? (targetNode.data.attributes as Array<{ id: string; name: string }>)
                : []

              // Split bundled attributes and extract valid names
              const rawAttrsList: string[] = []
              for (const a of mod.changes.attributes) {
                const nameStr =
                  typeof a === "object" && a !== null && "name" in a
                    ? String((a as { name: unknown }).name ?? "")
                    : typeof a === "string"
                      ? a
                      : String(a ?? "")
                if (nameStr.includes(",") && (nameStr.includes(":") || nameStr.includes(" "))) {
                  rawAttrsList.push(
                    ...nameStr
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                } else if (nameStr.trim()) {
                  rawAttrsList.push(nameStr.trim())
                }
              }

              const newAttrs = rawAttrsList.map((str) => ({
                id: `attr-${generateUUID()}`,
                name:
                  str.startsWith("+") ||
                  str.startsWith("-") ||
                  str.startsWith("#") ||
                  str.startsWith("~")
                    ? str
                    : `+ ${str}`,
              }))

              // Map new attributes by their bare member name for updating matching members
              const newAttrBareMap = new Map<string, { id: string; name: string }>()
              newAttrs.forEach((a) => {
                const bare = extractBareMemberName(a.name)
                if (bare) newAttrBareMap.set(bare, a)
              })

              // Replace existing members that match by bare name in place
              const updatedAttrs = existingAttrs.map((existingAttr) => {
                const bare = extractBareMemberName(existingAttr.name)
                if (bare && newAttrBareMap.has(bare)) {
                  const replacement = newAttrBareMap.get(bare)!
                  newAttrBareMap.delete(bare)
                  return { ...existingAttr, name: replacement.name }
                }
                return existingAttr
              })

              // Append truly new members that did not exist yet
              targetNode.data.attributes = [...updatedAttrs, ...Array.from(newAttrBareMap.values())]
            }
          }
        }
        if (mod.changes.methods !== undefined && mod.changes.methods !== null) {
          if (Array.isArray(mod.changes.methods)) {
            if (mod.changes.methods.length === 0) {
              // Explicit clear / deletion of methods
              targetNode.data.methods = []
            } else {
              const existingMethods = Array.isArray(targetNode.data.methods)
                ? (targetNode.data.methods as Array<{ id: string; name: string }>)
                : []

              const rawMethodsList: string[] = []
              for (const m of mod.changes.methods) {
                const nameStr =
                  typeof m === "object" && m !== null && "name" in m
                    ? String((m as { name: unknown }).name ?? "")
                    : typeof m === "string"
                      ? m
                      : String(m ?? "")
                if (nameStr.includes(",") && nameStr.includes("(")) {
                  rawMethodsList.push(
                    ...nameStr
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                } else if (nameStr.trim()) {
                  rawMethodsList.push(nameStr.trim())
                }
              }

              const newMethods = rawMethodsList.map((str) => ({
                id: `op-${generateUUID()}`,
                name:
                  str.startsWith("+") ||
                  str.startsWith("-") ||
                  str.startsWith("#") ||
                  str.startsWith("~")
                    ? str
                    : `+ ${str}`,
              }))

              const newMethodBareMap = new Map<string, { id: string; name: string }>()
              newMethods.forEach((m) => {
                const bare = extractBareMemberName(m.name)
                if (bare) newMethodBareMap.set(bare, m)
              })

              const updatedMethods = existingMethods.map((existingMeth) => {
                const bare = extractBareMemberName(existingMeth.name)
                if (bare && newMethodBareMap.has(bare)) {
                  const replacement = newMethodBareMap.get(bare)!
                  newMethodBareMap.delete(bare)
                  return { ...existingMeth, name: replacement.name }
                }
                return existingMeth
              })

              targetNode.data.methods = [
                ...updatedMethods,
                ...Array.from(newMethodBareMap.values()),
              ]
            }
          }
        }
        if (
          mod.changes.position &&
          typeof mod.changes.position === "object" &&
          typeof mod.changes.position.x === "number" &&
          typeof mod.changes.position.y === "number" &&
          Number.isFinite(mod.changes.position.x) &&
          Number.isFinite(mod.changes.position.y) &&
          (mod.changes.position.x !== 0 || mod.changes.position.y !== 0)
        ) {
          targetNode.position = { x: mod.changes.position.x, y: mod.changes.position.y }
        }

        // Recalculate node height dynamically to fit updated attributes and methods
        const attrCount = Array.isArray(targetNode.data.attributes)
          ? targetNode.data.attributes.length
          : 0
        const methCount = Array.isArray(targetNode.data.methods)
          ? targetNode.data.methods.length
          : 0
        const hasStereo = !!targetNode.data.stereotype
        const hHeight = hasStereo
          ? LAYOUT.DEFAULT_HEADER_HEIGHT_WITH_STEREOTYPE
          : LAYOUT.DEFAULT_HEADER_HEIGHT
        const isEnum =
          targetNode.data.stereotype === "<<enumeration>>" ||
          targetNode.data.stereotype === "enumeration"
        const reserveComp = !isEnum
        const newCalcHeight = calculateMinHeight(
          hHeight,
          attrCount,
          methCount,
          LAYOUT.DEFAULT_ATTRIBUTE_HEIGHT,
          LAYOUT.DEFAULT_METHOD_HEIGHT,
          reserveComp
        )
        const finalClampedHeight = Math.max(100, newCalcHeight)
        if (targetNode.height === undefined || finalClampedHeight > targetNode.height) {
          targetNode.height = finalClampedHeight
          if (targetNode.measured) {
            targetNode.measured.height = finalClampedHeight
          }
        }
      }
    })
  }

  return {
    ...currentModel,
    nodes,
    edges,
    assessments,
    interactive: {
      elements: interactiveElements,
      relationships: interactiveRelationships,
    },
  }
}
