import { describe, it, expect } from "vitest"
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { exportToXmi } from "../../lib/export/xmiExport"
import { importXmiDiagram } from "../../lib/import/xmiImport"
import type { UMLModel } from "../../lib/typings"

/**
 * Minimal Bridge-pattern model — replaces the deleted diagramTemplates/Bridge.json.
 * Uses canonical type values from DiagramNodeTypeRecord / DiagramEdgeTypeRecord.
 */
const bridgeModel: UMLModel = {
  version: "4.0.0",
  id: "bridge-inline",
  title: "Bridge Diagram",
  type: "ClassDiagram",
  nodes: [
    {
      id: "abstraction",
      type: "class",
      position: { x: 100, y: 80 },
      width: 180,
      height: 80,
      measured: { width: 180, height: 80 },
      data: {
        name: "Abstraction",
        attributes: [],
        methods: [{ name: "operation", returnType: "void", visibility: "public", parameters: [] }],
      },
    },
    {
      id: "refinedAbstraction",
      type: "class",
      position: { x: 100, y: 240 },
      width: 180,
      height: 80,
      measured: { width: 180, height: 80 },
      data: {
        name: "RefinedAbstraction",
        attributes: [],
        methods: [{ name: "operation", returnType: "void", visibility: "public", parameters: [] }],
      },
    },
    {
      id: "implementor",
      type: "class",
      position: { x: 420, y: 80 },
      width: 180,
      height: 80,
      measured: { width: 180, height: 80 },
      data: {
        name: "Implementor",
        attributes: [],
        methods: [
          { name: "operationImpl", returnType: "void", visibility: "public", parameters: [] },
        ],
        stereotype: "interface",
      },
    },
    {
      id: "concreteImplA",
      type: "class",
      position: { x: 350, y: 240 },
      width: 180,
      height: 80,
      measured: { width: 180, height: 80 },
      data: {
        name: "ConcreteImplementorA",
        attributes: [],
        methods: [
          { name: "operationImpl", returnType: "void", visibility: "public", parameters: [] },
        ],
      },
    },
    {
      id: "concreteImplB",
      type: "class",
      position: { x: 560, y: 240 },
      width: 180,
      height: 80,
      measured: { width: 180, height: 80 },
      data: {
        name: "ConcreteImplementorB",
        attributes: [],
        methods: [
          { name: "operationImpl", returnType: "void", visibility: "public", parameters: [] },
        ],
      },
    },
  ],
  edges: [
    {
      id: "e-abstraction-impl",
      type: "ClassUnidirectional",
      source: "abstraction",
      target: "implementor",
      sourceHandle: "right",
      targetHandle: "left",
      data: { points: [] },
    },
    {
      id: "e-refined-abstraction",
      type: "ClassInheritance",
      source: "refinedAbstraction",
      target: "abstraction",
      sourceHandle: "top",
      targetHandle: "bottom",
      data: { points: [] },
    },
    {
      id: "e-concA-impl",
      type: "ClassRealization",
      source: "concreteImplA",
      target: "implementor",
      sourceHandle: "top",
      targetHandle: "bottom",
      data: { points: [] },
    },
    {
      id: "e-concB-impl",
      type: "ClassRealization",
      source: "concreteImplB",
      target: "implementor",
      sourceHandle: "top",
      targetHandle: "bottom",
      data: { points: [] },
    },
  ],
  assessments: {},
  interactive: { elements: {}, relationships: {} },
}

describe("Bridge Diagram export/import verification", () => {
  it("exports Bridge model to valid EA XMI and updates bridge_diagram.xmi", async () => {
    const bridgeDiagramXmiPath = resolve(__dirname, "../../../../docs/examples/bridge_diagram.xmi")

    const result = await exportToXmi(bridgeModel, {
      diagramName: "Bridge Diagram",
      targetDialect: "EnterpriseArchitect",
      xmiVersion: "2.1",
    })

    expect(result.xmiContent).toContain('<xmi:Extension exporter="Enterprise Architect"')
    expect(result.xmiContent).toContain('<packagedElement xmi:type="uml:Package"')
    expect(result.xmiContent).toContain("<diagrams>")
    expect(result.xmiContent).toContain("<connectors>")
    expect(result.xmiContent).toContain("extendedProperties ptInstances=")

    // 1. Unspecified multiplicities and roles should NOT emit dummy values
    expect(result.xmiContent).not.toContain('<lowerValue xmi:type="uml:LiteralInteger"')
    expect(result.xmiContent).not.toContain('<upperValue xmi:type="uml:LiteralUnlimitedNatural"')
    expect(result.xmiContent).not.toContain('<role name=')

    // 2. Return types on operations (EAnone_void)
    expect(result.xmiContent).toContain('<ownedParameter xmi:type="uml:Parameter"')
    expect(result.xmiContent).toContain('name="return" direction="return" type="EAnone_void"')

    // 3. Primitive types package for EA
    expect(result.xmiContent).toContain("<primitivetypes>")
    expect(result.xmiContent).toContain('name="EA_PrimitiveTypes_Package"')
    expect(result.xmiContent).toContain('xmi:id="EAnone_void" name="void"')

    // 4. Formal diagram elements geometry
    expect(result.xmiContent).toContain("<elements>")
    expect(result.xmiContent).toMatch(/<element geometry="Left=\d+;Top=\d+;Right=\d+;Bottom=\d+;"/)

    // Write updated bridge_diagram.xmi
    writeFileSync(bridgeDiagramXmiPath, result.xmiContent, "utf-8")

    // Reimport to verify round-trip
    const reimported = importXmiDiagram(result.xmiContent)
    expect(reimported.nodes.length).toBe(bridgeModel.nodes.length)
    expect(reimported.edges.length).toBe(bridgeModel.edges.length)
    for (const edge of reimported.edges) {
      expect(edge.data?.sourceRole).toBeUndefined()
      expect(edge.data?.targetRole).toBeUndefined()
      expect(edge.data?.sourceMultiplicity).toBeUndefined()
      expect(edge.data?.targetMultiplicity).toBeUndefined()
    }
  })
})
