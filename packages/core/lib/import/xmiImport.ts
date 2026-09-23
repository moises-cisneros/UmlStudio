import type { UMLModel, UmlStudioNode, UmlStudioEdge } from "../typings"
import { UMLDiagramType } from "../types/DiagramType"
import {
  DiagramNodeTypeRecord,
  DiagramEdgeTypeRecord,
  type DiagramEdgeType,
} from "../modelElementTypes"

export interface XmiImportOptions {
  /**
   * Expected XMI dialect.
   * @default "EnterpriseArchitect"
   */
  sourceDialect?: "EnterpriseArchitect" | "GenericOMG"
  /**
   * Fallback diagram title if not present in XMI model metadata.
   */
  defaultTitle?: string
}

export interface XmiImportResult {
  /** Converted canonical UMLModel */
  model: UMLModel
  /** Warnings encountered during extraction */
  warnings: string[]
}

function mapXmiVisibilityToSymbol(vis?: string | null): string {
  switch ((vis || "").toLowerCase()) {
    case "private":
      return "-"
    case "protected":
      return "#"
    case "package":
      return "~"
    case "public":
    default:
      return "+"
  }
}

function extractTypeFromElement(el: Element): string {
  // Check child <type ...>
  const typeChild = el.querySelector(":scope > type") || el.getElementsByTagName("type")[0]
  if (typeChild) {
    const nameAttr = typeChild.getAttribute("name")
    if (nameAttr) return nameAttr
    const hrefAttr = typeChild.getAttribute("href")
    if (hrefAttr && hrefAttr.includes("#")) {
      return hrefAttr.split("#")[1]
    }
  }

  // Check type attribute on the element itself
  const directType = el.getAttribute("type")
  if (directType) {
    if (directType === "EAnone_void") return "void"
    if (directType.includes("#")) return directType.split("#")[1]
    return directType
  }

  return ""
}

function parseMultiplicity(endEl: Element): string | undefined {
  const directMult = endEl.getAttribute("multiplicity")
  if (directMult) return directMult

  const lowerEl = endEl.querySelector("lowerValue")
  const upperEl = endEl.querySelector("upperValue")

  if (!lowerEl && !upperEl) return undefined

  const lowerVal = lowerEl?.getAttribute("value") ?? "1"
  const upperVal = upperEl?.getAttribute("value") ?? "1"

  if (lowerVal === "1" && upperVal === "1") return "1"
  if (lowerVal === "0" && upperVal === "1") return "0..1"
  if ((lowerVal === "0" || lowerVal === "") && (upperVal === "*" || upperVal === "-1")) return "*"
  if (lowerVal === "1" && (upperVal === "*" || upperVal === "-1")) return "1..*"
  if (lowerVal === upperVal) return lowerVal
  return `${lowerVal}..${upperVal}`
}

function sanitizeRoleName(rawRole?: string | null): string | undefined {
  if (!rawRole) return undefined
  const trimmed = rawRole.replace(/^\+/, "").trim()
  if (!trimmed || trimmed.toLowerCase() === "source" || trimmed.toLowerCase() === "target") {
    return undefined
  }
  return trimmed
}

function sanitizeMultiplicity(rawMult?: string | null): string | undefined {
  if (!rawMult) return undefined
  const trimmed = rawMult.trim()
  if (!trimmed) return undefined
  return trimmed
}

function resolveEndTypeId(endEl: Element): string | null {
  // 1. Direct attribute type="ID"
  const directType = endEl.getAttribute("type")
  if (directType && !directType.startsWith("http")) return directType
  // 2. Child <type xmi:idref="ID" /> or <type idref="ID" />
  const typeChild = endEl.querySelector("type")
  if (typeChild) {
    const idref = typeChild.getAttribute("xmi:idref") || typeChild.getAttribute("idref")
    if (idref) return idref
    const childType = typeChild.getAttribute("type")
    if (childType && !childType.startsWith("http")) return childType
  }
  return null
}

function lookupNodeId(rawId?: string | null, idMap?: Map<string, string>): string | undefined {
  if (!rawId || !idMap) return undefined
  if (idMap.has(rawId)) return idMap.get(rawId)
  const clean = rawId.replace(/^\{/, "").replace(/\}$/, "")
  if (idMap.has(clean)) return idMap.get(clean)
  if (idMap.has(`{${clean}}`)) return idMap.get(`{${clean}}`)
  const eaid = `EAID_${clean.replace(/-/g, "_")}`
  if (idMap.has(eaid)) return idMap.get(eaid)
  const fromEaid = rawId.startsWith("EAID_") ? rawId.replace(/^EAID_/, "").replace(/_/g, "-") : ""
  if (fromEaid) {
    if (idMap.has(fromEaid)) return idMap.get(fromEaid)
    if (idMap.has(`{${fromEaid}}`)) return idMap.get(`{${fromEaid}}`)
  }
  return undefined
}

function deriveOptimalHandles(
  sourceNode?: UmlStudioNode,
  targetNode?: UmlStudioNode
): {
  sourceHandle: "top" | "bottom" | "left" | "right"
  targetHandle: "top" | "bottom" | "left" | "right"
} {
  if (!sourceNode || !targetNode) {
    return { sourceHandle: "right", targetHandle: "left" }
  }
  const sWidth = sourceNode.width ?? 180
  const sHeight = sourceNode.height ?? 100
  const tWidth = targetNode.width ?? 180
  const tHeight = targetNode.height ?? 100
  const sCenter = {
    x: (sourceNode.position?.x ?? 0) + sWidth / 2,
    y: (sourceNode.position?.y ?? 0) + sHeight / 2,
  }
  const tCenter = {
    x: (targetNode.position?.x ?? 0) + tWidth / 2,
    y: (targetNode.position?.y ?? 0) + tHeight / 2,
  }
  const dx = tCenter.x - sCenter.x
  const dy = tCenter.y - sCenter.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: "right", targetHandle: "left" }
      : { sourceHandle: "left", targetHandle: "right" }
  } else {
    return dy >= 0
      ? { sourceHandle: "bottom", targetHandle: "top" }
      : { sourceHandle: "top", targetHandle: "bottom" }
  }
}

function sanitizeEdgeLabel(rawName?: string | null): string | undefined {
  if (!rawName) return undefined
  const trimmed = rawName.trim()
  if (!trimmed || trimmed.startsWith("assoc_")) return undefined
  return trimmed
}

function parsePtInstancesString(
  ptStr: string,
  map: Map<string, { x: number; y: number; width: number; height: number }>
): void {
  if (!ptStr) return
  const items = ptStr.trim().split(/(?=SX=)/i)
  for (const item of items) {
    if (!item.trim()) continue
    const sxMatch = item.match(/SX=(-?\d+)/i)
    const syMatch = item.match(/SY=(-?\d+)/i)
    const exMatch = item.match(/EX=(-?\d+)/i)
    const eyMatch = item.match(/EY=(-?\d+)/i)
    const guidMatch = item.match(/GUID=\{?([a-zA-Z0-9_-]+)\}?/i)

    if (sxMatch && syMatch && exMatch && eyMatch && guidMatch) {
      const sx = parseInt(sxMatch[1], 10)
      const sy = parseInt(syMatch[1], 10)
      const ex = parseInt(exMatch[1], 10)
      const ey = parseInt(eyMatch[1], 10)
      const guid = guidMatch[1]
      const width = Math.max(100, Math.abs(ex - sx))
      const height = Math.max(60, Math.abs(ey - sy))
      const x = Math.min(sx, ex)
      const y = Math.min(sy, ey)
      const geoObj = { x, y, width, height }

      map.set(guid, geoObj)
      map.set(`{${guid}}`, geoObj)
      const eaidKey = `EAID_${guid.replace(/-/g, "_")}`
      map.set(eaidKey, geoObj)
    }
  }
}

/**
 * Parses Enterprise Architect XMI 2.1 / 2.5 and converts it into a canonical UmlStudio UMLModel.
 * Compliant with OMG UML 2.5 class diagram standard and UML domain guard.
 */
export function importXmiDiagram(xmiString: string, options: XmiImportOptions = {}): UMLModel {
  if (!xmiString || typeof xmiString !== "string" || !xmiString.trim()) {
    throw new Error("Invalid XMI payload: content is empty")
  }

  if (
    !xmiString.includes("<?xml") &&
    !xmiString.includes("<xmi:XMI") &&
    !xmiString.includes("<uml:Model")
  ) {
    throw new Error("Invalid XMI payload: expected XML or XMI document root")
  }

  let sanitizedXmi = xmiString
  if (!sanitizedXmi.includes("xmlns:xmi=")) {
    sanitizedXmi = sanitizedXmi.replace(
      /<xmi:XMI/i,
      '<xmi:XMI xmlns:xmi="http://schema.omg.org/spec/XMI/2.1"'
    )
  }
  if (!sanitizedXmi.includes("xmlns:uml=")) {
    sanitizedXmi = sanitizedXmi.replace(
      /<xmi:XMI/i,
      '<xmi:XMI xmlns:uml="http://schema.omg.org/spec/UML/2.1"'
    )
  }

  const ParserConstructor =
    typeof globalThis.DOMParser !== "undefined"
      ? globalThis.DOMParser
      : (window as unknown as { DOMParser: typeof DOMParser }).DOMParser

  if (!ParserConstructor) {
    throw new Error("DOMParser is not available in the current environment")
  }

  const parser = new ParserConstructor()
  const doc = parser.parseFromString(sanitizedXmi, "application/xml")

  const parserError = doc.querySelector("parsererror")
  if (parserError) {
    throw new Error(`XMI XML Parse Error: ${parserError.textContent}`)
  }

  // Extract diagram title
  const modelEl =
    doc.querySelector("Model, uml\\:Model") || doc.getElementsByTagName("uml:Model")[0]
  const modelName = options.defaultTitle || modelEl?.getAttribute("name") || "Imported XMI Diagram"

  const modelId = `xmi-imported-${Date.now()}`
  const nodes: UmlStudioNode[] = []
  const edges: UmlStudioEdge[] = []
  const warnings: string[] = []

  // Map of XMI IDs to Internal Node IDs
  const idMap = new Map<string, string>()

  // Extract diagram element geometries from Enterprise Architect extension if present
  const geometryMap = new Map<string, { x: number; y: number; width: number; height: number }>()

  // 1. Extract from EA ptInstances in <extendedProperties ptInstances="..."> or <diagram ...>
  const extProps = Array.from(doc.getElementsByTagName("extendedProperties"))
  const diagrams = Array.from(doc.getElementsByTagName("diagram"))
  ;[...extProps, ...diagrams].forEach((el) => {
    const ptStr = el.getAttribute("ptInstances")
    if (ptStr) {
      parsePtInstancesString(ptStr, geometryMap)
    }
  })

  // Fallback: extract directly from xmiString if geometryMap has no ptInstances entries
  const ptMatches = xmiString.matchAll(/ptInstances="([^"]+)"/g)
  for (const match of ptMatches) {
    parsePtInstancesString(match[1], geometryMap)
  }

  // 2. Extract from EA <element subject="..." geometry="Left=... Top=... Right=... Bottom=..."/> or legacy style="...Geometry=..."
  const diagramElements = Array.from(doc.getElementsByTagName("element"))
  diagramElements.forEach((diagEl) => {
    const subject = diagEl.getAttribute("subject")
    if (!subject) return
    const geoAttr = diagEl.getAttribute("geometry") || ""
    const style = diagEl.getAttribute("style") || ""
    const rawGeo = geoAttr || (style.includes("Geometry=") ? style : "")
    if (rawGeo) {
      const match = rawGeo.match(/Left=(-?\d+);Top=(-?\d+);Right=(-?\d+);Bottom=(-?\d+);/i)
      if (match) {
        const left = parseInt(match[1], 10)
        const top = parseInt(match[2], 10)
        const right = parseInt(match[3], 10)
        const bottom = parseInt(match[4], 10)
        const width = Math.max(100, Math.abs(right - left))
        const height = Math.max(60, Math.abs(bottom - top))
        const x = Math.min(left, right)
        const y = Math.min(top, bottom)
        geometryMap.set(subject, { x, y, width, height })
      }
    }
  })

  // Find all packaged elements
  const allPackagedElements = Array.from(doc.getElementsByTagName("packagedElement"))

  // 1. First pass: Collect all Class Diagram structural nodes (Class, Interface, Enumeration, Package)
  allPackagedElements.forEach((el) => {
    const rawType = el.getAttribute("xmi:type") || el.getAttribute("type") || ""
    const type = rawType.replace(/^uml:/i, "")
    const xmiId = el.getAttribute("xmi:id") || el.getAttribute("id")
    const name = el.getAttribute("name") || "Unnamed"

    if (!xmiId) return

    // UML Domain Guard: Filter non-class elements
    const validClassTypes = ["class", "interface", "enumeration", "package", "associationclass"]
    if (!validClassTypes.includes(type.toLowerCase())) {
      if (!["association", "dependency", "generalizationset"].includes(type.toLowerCase())) {
        warnings.push(`Ignored non-class diagram element: '${name}' of type '${rawType}'`)
      }
      return
    }

    const isPackage = type.toLowerCase() === "package"
    // If it's a container package, treat as namespace container and don't create node
    if (isPackage) {
      const childPackaged = el.getElementsByTagName("packagedElement")
      if (childPackaged.length > 0 || name === "EA_PrimitiveTypes_Package") {
        return
      }
    }

    const internalId = xmiId.startsWith("node-") ? xmiId : `node-${xmiId}`
    idMap.set(xmiId, internalId)

    const cleanXmiGuid = xmiId.replace(/^\{/, "").replace(/\}$/, "")
    if (cleanXmiGuid !== xmiId) {
      idMap.set(cleanXmiGuid, internalId)
      idMap.set(`{${cleanXmiGuid}}`, internalId)
    }
    if (xmiId.startsWith("EAID_")) {
      const guidForm = xmiId.replace(/^EAID_/, "").replace(/_/g, "-")
      idMap.set(guidForm, internalId)
      idMap.set(`{${guidForm}}`, internalId)
    }

    const isInterface = type.toLowerCase() === "interface"
    const isEnumeration = type.toLowerCase() === "enumeration"
    const isAssociationClass = type.toLowerCase() === "associationclass"
    const isAbstract = el.getAttribute("isAbstract") === "true"

    let stereotype: string | undefined
    if (isInterface) stereotype = "interface"
    else if (isEnumeration) stereotype = "enumeration"
    else if (isAssociationClass) stereotype = "<<association>>"
    else if (isAbstract) stereotype = "abstract"

    // Extract Attributes
    const attributes: Array<{ id: string; name: string }> = []
    const attrElements = Array.from(
      el.querySelectorAll(":scope > ownedAttribute, :scope > property")
    )
    attrElements.forEach((attrEl, idx) => {
      const attrName = attrEl.getAttribute("name") || `attribute${idx}`
      const visSymbol = mapXmiVisibilityToSymbol(attrEl.getAttribute("visibility"))
      const typeStr = extractTypeFromElement(attrEl)
      const formatted = `${visSymbol} ${attrName}${typeStr ? `: ${typeStr}` : ""}`
      const attrId =
        attrEl.getAttribute("xmi:id") || attrEl.getAttribute("id") || `attr-${internalId}-${idx}`
      attributes.push({ id: attrId, name: formatted })
    })

    // Extract Operations
    const methods: Array<{ id: string; name: string }> = []
    const opElements = Array.from(
      el.querySelectorAll(":scope > ownedOperation, :scope > operation")
    )
    opElements.forEach((opEl, idx) => {
      const opName = opEl.getAttribute("name") || `operation${idx}`
      const visSymbol = mapXmiVisibilityToSymbol(opEl.getAttribute("visibility"))

      // Parameters
      const paramElements = Array.from(
        opEl.querySelectorAll(":scope > ownedParameter, :scope > parameter")
      )
      const inParams: string[] = []
      let returnType = ""

      paramElements.forEach((paramEl) => {
        const direction = paramEl.getAttribute("direction") || "in"
        const pType = extractTypeFromElement(paramEl)
        if (direction === "return") {
          returnType = pType
        } else {
          const pName = paramEl.getAttribute("name") || "param"
          inParams.push(`${pName}${pType ? `: ${pType}` : ""}`)
        }
      })

      const formatted = `${visSymbol} ${opName}(${inParams.join(", ")})${returnType && returnType.toLowerCase() !== "void" ? `: ${returnType}` : ""}`
      const opId =
        opEl.getAttribute("xmi:id") || opEl.getAttribute("id") || `op-${internalId}-${idx}`
      methods.push({ id: opId, name: formatted })
    })

    // Node layout geometry: use EA extension geometry if available, otherwise auto-layout grid
    const eaIdConverted = xmiId.startsWith("EAID_")
      ? xmiId.replace(/^EAID_/, "").replace(/_/g, "-")
      : ""
    const geo =
      (xmiId && geometryMap.get(xmiId)) ||
      (cleanXmiGuid && geometryMap.get(cleanXmiGuid)) ||
      (eaIdConverted && geometryMap.get(eaIdConverted)) ||
      (eaIdConverted && geometryMap.get(`{${eaIdConverted}}`)) ||
      geometryMap.get(internalId)
    let x: number
    let y: number
    let width: number
    let height: number

    if (geo) {
      x = geo.x
      y = geo.y
      width = geo.width
      height = geo.height
    } else {
      const nodeIndex = nodes.length
      const COLS = 3
      const col = nodeIndex % COLS
      const row = Math.floor(nodeIndex / COLS)
      x = 100 + col * 320
      y = 100 + row * 240
      width = 220
      height = 140
    }

    const node: UmlStudioNode = {
      id: internalId,
      type: isPackage ? DiagramNodeTypeRecord.package : DiagramNodeTypeRecord.class,
      position: { x, y },
      width,
      height,
      measured: { width, height },
      data: {
        name,
        ...(stereotype ? { stereotype } : {}),
        ...(isAssociationClass ? { isAssociationClass: true } : {}),
        attributes,
        methods,
      },
    }

    nodes.push(node)
  })

  const nodeMap = new Map<string, UmlStudioNode>(nodes.map((n) => [n.id, n]))

  // 2. Second pass: Extract Inner Class Relationships (Generalizations & Interface Realizations)
  allPackagedElements.forEach((el) => {
    const xmiId = el.getAttribute("xmi:id") || el.getAttribute("id")
    const sourceNodeId = lookupNodeId(xmiId, idMap)
    if (!sourceNodeId) return

    // Generalizations
    const genElements = Array.from(el.querySelectorAll(":scope > generalization, generalization"))
    genElements.forEach((genEl, idx) => {
      const targetXmiId =
        genEl.getAttribute("general") || genEl.getAttribute("href")?.split("#")?.[1]
      const targetNodeId = lookupNodeId(targetXmiId, idMap)
      if (targetNodeId) {
        const sourceNode = nodeMap.get(sourceNodeId)
        const targetNode = nodeMap.get(targetNodeId)
        const { sourceHandle, targetHandle } = deriveOptimalHandles(sourceNode, targetNode)
        const edgeId =
          genEl.getAttribute("xmi:id") || `edge-gen-${sourceNodeId}-${targetNodeId}-${idx}`
        edges.push({
          id: edgeId,
          type: DiagramEdgeTypeRecord.ClassInheritance,
          source: sourceNodeId,
          target: targetNodeId,
          sourceHandle,
          targetHandle,
          data: {
            points: [],
          },
        })
      }
    })

    // Interface Realizations
    const realElements = Array.from(
      el.querySelectorAll(":scope > interfaceRealization, interfaceRealization")
    )
    realElements.forEach((realEl, idx) => {
      const targetXmiId =
        realEl.getAttribute("contract") ||
        realEl.getAttribute("supplier") ||
        realEl.getAttribute("href")?.split("#")?.[1]
      const targetNodeId = lookupNodeId(targetXmiId, idMap)
      if (targetNodeId) {
        const sourceNode = nodeMap.get(sourceNodeId)
        const targetNode = nodeMap.get(targetNodeId)
        const { sourceHandle, targetHandle } = deriveOptimalHandles(sourceNode, targetNode)
        const edgeId =
          realEl.getAttribute("xmi:id") || `edge-real-${sourceNodeId}-${targetNodeId}-${idx}`
        edges.push({
          id: edgeId,
          type: DiagramEdgeTypeRecord.ClassRealization,
          source: sourceNodeId,
          target: targetNodeId,
          sourceHandle,
          targetHandle,
          data: {
            points: [],
          },
        })
      }
    })
  })

  // 3. Third pass: Extract Top-Level Associations & Dependencies from packagedElement
  allPackagedElements.forEach((el) => {
    const rawType = el.getAttribute("xmi:type") || el.getAttribute("type") || ""
    const type = rawType.replace(/^uml:/i, "").toLowerCase()
    const xmiId = el.getAttribute("xmi:id") || el.getAttribute("id")

    if (type === "association" || type === "associationclass") {
      const isAssocClassType = type === "associationclass"
      const assocClassNodeId = isAssocClassType ? lookupNodeId(xmiId, idMap) : undefined
      const ownedEnds = Array.from(el.querySelectorAll(":scope > ownedEnd, ownedEnd"))
      if (ownedEnds.length >= 2) {
        const end1 = ownedEnds[0]
        const end2 = ownedEnds[1]

        const type1 = resolveEndTypeId(end1)
        const type2 = resolveEndTypeId(end2)

        const sourceNodeId = lookupNodeId(type1, idMap)
        const targetNodeId = lookupNodeId(type2, idMap)

        if (sourceNodeId && targetNodeId) {
          const agg1 = end1.getAttribute("aggregation")
          const agg2 = end2.getAttribute("aggregation")

          let edgeType: DiagramEdgeType = DiagramEdgeTypeRecord.ClassBidirectional
          let finalSourceId = sourceNodeId
          let finalTargetId = targetNodeId
          let sourceEnd = end1
          let targetEnd = end2

          if (agg2 === "composite") {
            edgeType = DiagramEdgeTypeRecord.ClassComposition
            finalSourceId = sourceNodeId
            finalTargetId = targetNodeId
            sourceEnd = end1
            targetEnd = end2
          } else if (agg1 === "composite") {
            edgeType = DiagramEdgeTypeRecord.ClassComposition
            finalSourceId = targetNodeId
            finalTargetId = sourceNodeId
            sourceEnd = end2
            targetEnd = end1
          } else if (agg2 === "shared") {
            edgeType = DiagramEdgeTypeRecord.ClassAggregation
            finalSourceId = sourceNodeId
            finalTargetId = targetNodeId
            sourceEnd = end1
            targetEnd = end2
          } else if (agg1 === "shared") {
            edgeType = DiagramEdgeTypeRecord.ClassAggregation
            finalSourceId = targetNodeId
            finalTargetId = sourceNodeId
            sourceEnd = end2
            targetEnd = end1
          }

          const sourceNode = nodeMap.get(finalSourceId)
          const targetNode = nodeMap.get(finalTargetId)
          const { sourceHandle, targetHandle } = deriveOptimalHandles(sourceNode, targetNode)

          const edgeId = isAssocClassType
            ? `edge-assoc-${finalSourceId}-${finalTargetId}`
            : xmiId || `edge-assoc-${finalSourceId}-${finalTargetId}`
          const rawSourceRole = sourceEnd.getAttribute("name")
          const rawTargetRole = targetEnd.getAttribute("name")
          const sourceRole = sanitizeRoleName(rawSourceRole)
          const targetRole = sanitizeRoleName(rawTargetRole)
          const srcMult = sanitizeMultiplicity(parseMultiplicity(sourceEnd))
          const tgtMult = sanitizeMultiplicity(parseMultiplicity(targetEnd))
          const label = sanitizeEdgeLabel(el.getAttribute("name"))

          if (assocClassNodeId) {
            const assocNode = nodeMap.get(assocClassNodeId)
            if (assocNode) {
              assocNode.data = {
                ...assocNode.data,
                isAssociationClass: true,
                associationEdgeId: edgeId,
              }
            }
          }

          edges.push({
            id: edgeId,
            type: edgeType,
            source: finalSourceId,
            target: finalTargetId,
            sourceHandle,
            targetHandle,
            data: {
              points: [],
              ...(srcMult ? { sourceMultiplicity: srcMult } : {}),
              ...(tgtMult ? { targetMultiplicity: tgtMult } : {}),
              ...(sourceRole ? { sourceRole } : {}),
              ...(targetRole ? { targetRole } : {}),
              ...(label ? { label } : {}),
              ...(assocClassNodeId ? { associationClassNodeId: assocClassNodeId } : {}),
            },
          })
        }
      }
    } else if (type === "dependency") {
      const clientXmiId = el.getAttribute("client")
      const supplierXmiId = el.getAttribute("supplier")
      const sourceNodeId = lookupNodeId(clientXmiId, idMap)
      const targetNodeId = lookupNodeId(supplierXmiId, idMap)
      if (sourceNodeId && targetNodeId) {
        const sourceNode = nodeMap.get(sourceNodeId)
        const targetNode = nodeMap.get(targetNodeId)
        const { sourceHandle, targetHandle } = deriveOptimalHandles(sourceNode, targetNode)
        edges.push({
          id: xmiId || `edge-dep-${sourceNodeId}-${targetNodeId}`,
          type: DiagramEdgeTypeRecord.ClassDependency,
          source: sourceNodeId,
          target: targetNodeId,
          sourceHandle,
          targetHandle,
          data: {
            points: [],
          },
        })
      }
    }
  })

  // 4. Fourth pass: Parse Enterprise Architect <connectors><connector ...> extension
  const connectorElements = Array.from(doc.getElementsByTagName("connector"))
  connectorElements.forEach((connEl) => {
    const edgeId = connEl.getAttribute("xmi:idref") || connEl.getAttribute("id")
    const sourceEl = connEl.querySelector("source")
    const targetEl = connEl.querySelector("target")
    const sourceRef = sourceEl?.getAttribute("xmi:idref") || sourceEl?.getAttribute("idref")
    const targetRef = targetEl?.getAttribute("xmi:idref") || targetEl?.getAttribute("idref")

    const sourceNodeId = lookupNodeId(sourceRef, idMap)
    const targetNodeId = lookupNodeId(targetRef, idMap)

    if (!sourceNodeId || !targetNodeId) return

    // Check properties and ea_type
    const propsEl = connEl.querySelector("properties")
    const eaType = propsEl?.getAttribute("ea_type") || "Association"
    const sourceAgg = sourceEl?.querySelector("type")?.getAttribute("aggregation") || "none"
    const targetAgg = targetEl?.querySelector("type")?.getAttribute("aggregation") || "none"

    let edgeType: DiagramEdgeType
    if (eaType === "Generalization") {
      edgeType = DiagramEdgeTypeRecord.ClassInheritance
    } else if (eaType === "Realisation") {
      edgeType = DiagramEdgeTypeRecord.ClassRealization
    } else if (eaType === "Aggregation") {
      if (targetAgg === "composite" || sourceAgg === "composite") {
        edgeType = DiagramEdgeTypeRecord.ClassComposition
      } else {
        edgeType = DiagramEdgeTypeRecord.ClassAggregation
      }
    } else if (eaType === "Dependency") {
      edgeType = DiagramEdgeTypeRecord.ClassDependency
    } else {
      edgeType = DiagramEdgeTypeRecord.ClassBidirectional
    }

    const isAssoc =
      edgeType === DiagramEdgeTypeRecord.ClassBidirectional ||
      edgeType === DiagramEdgeTypeRecord.ClassAggregation ||
      edgeType === DiagramEdgeTypeRecord.ClassComposition

    // Check if an edge already exists matching ID or source/target/type
    const existing = edges.find(
      (e) =>
        (edgeId && e.id === edgeId) ||
        (e.source === sourceNodeId && e.target === targetNodeId && e.type === edgeType)
    )

    const extPropsEl = connEl.querySelector("extendedProperties")
    const rawAssocClassRef = extPropsEl?.getAttribute("associationclass")
    const assocClassNodeId = rawAssocClassRef ? lookupNodeId(rawAssocClassRef, idMap) : undefined

    const labelsEl = connEl.querySelector("labels")
    const rawLabel = connEl.getAttribute("name") || labelsEl?.getAttribute("mt")
    const label = sanitizeEdgeLabel(rawLabel)

    let srcMult: string | undefined
    let tgtMult: string | undefined
    let sourceRole: string | undefined
    let targetRole: string | undefined

    if (isAssoc) {
      const rawSrcMult =
        sourceEl?.querySelector("type")?.getAttribute("multiplicity") ||
        labelsEl?.getAttribute("lb")
      const rawTgtMult =
        targetEl?.querySelector("type")?.getAttribute("multiplicity") ||
        labelsEl?.getAttribute("rb")
      srcMult = sanitizeMultiplicity(rawSrcMult)
      tgtMult = sanitizeMultiplicity(rawTgtMult)

      const rawSourceRole =
        sourceEl?.querySelector("role")?.getAttribute("name") || labelsEl?.getAttribute("lt")
      const rawTargetRole =
        targetEl?.querySelector("role")?.getAttribute("name") || labelsEl?.getAttribute("rt")
      sourceRole = sanitizeRoleName(rawSourceRole)
      targetRole = sanitizeRoleName(rawTargetRole)
    }

    if (existing) {
      // Enrich existing edge if properties are present
      if (label && !existing.data?.label) {
        existing.data = { ...existing.data, label }
      }
      if (assocClassNodeId) {
        if (!existing.data?.associationClassNodeId) {
          existing.data = { ...existing.data, associationClassNodeId: assocClassNodeId }
        }
        const assocNode = nodeMap.get(assocClassNodeId)
        if (assocNode) {
          assocNode.data = {
            ...assocNode.data,
            isAssociationClass: true,
            associationEdgeId: existing.id,
          }
        }
      }
      if (isAssoc) {
        if (srcMult && !existing.data?.sourceMultiplicity) {
          existing.data = { ...existing.data, sourceMultiplicity: srcMult }
        }
        if (tgtMult && !existing.data?.targetMultiplicity) {
          existing.data = { ...existing.data, targetMultiplicity: tgtMult }
        }
        if (sourceRole && !existing.data?.sourceRole) {
          existing.data = { ...existing.data, sourceRole }
        }
        if (targetRole && !existing.data?.targetRole) {
          existing.data = { ...existing.data, targetRole }
        }
      }
      return
    }

    // Otherwise, create new edge from connector
    const sourceNode = nodeMap.get(sourceNodeId)
    const targetNode = nodeMap.get(targetNodeId)
    const { sourceHandle, targetHandle } = deriveOptimalHandles(sourceNode, targetNode)

    edges.push({
      id: edgeId || `edge-conn-${sourceNodeId}-${targetNodeId}`,
      type: edgeType,
      source: sourceNodeId,
      target: targetNodeId,
      sourceHandle,
      targetHandle,
      data: {
        points: [],
        ...(isAssoc && srcMult ? { sourceMultiplicity: srcMult } : {}),
        ...(isAssoc && tgtMult ? { targetMultiplicity: tgtMult } : {}),
        ...(isAssoc && sourceRole ? { sourceRole } : {}),
        ...(isAssoc && targetRole ? { targetRole } : {}),
        ...(label ? { label } : {}),
        ...(assocClassNodeId ? { associationClassNodeId: assocClassNodeId } : {}),
      },
    })
  })

  return {
    version: "4.0.0",
    id: modelId,
    title: modelName,
    type: UMLDiagramType.ClassDiagram,
    nodes,
    edges,
    assessments: {},
  }
}
