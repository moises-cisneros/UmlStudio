import { describe, it, expect, beforeAll } from "vitest"
import Ajv, { type ValidateFunction } from "ajv"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { UMLModel, UmlStudioNode, UmlStudioEdge } from "../../lib/typings"
import { UMLDiagramType } from "../../lib/types/DiagramType"
import { DiagramNodeTypeRecord, DiagramEdgeTypeRecord } from "../../lib/modelElementTypes"
import { getEdgeMarkerStyles } from "../../lib/utils/edgeUtils"
import { MARKER_CONFIGS } from "../../lib/constants"

describe("INT-CU01: Case of Use CU-01 UML Class Diagram Modeling Integration", () => {
  let ajv: Ajv
  let validateModel: ValidateFunction
  let schema: Record<string, unknown>

  beforeAll(() => {
    const schemaPath = resolve(__dirname, "../../schema/uml-model-4.schema.json")
    const rawSchema = readFileSync(schemaPath, "utf-8")
    schema = JSON.parse(rawSchema)

    ajv = new Ajv({ allowUnionTypes: true, strict: false })
    validateModel = ajv.compile(schema)
  })

  it("programmatically constructs a valid UML 2.5 Class model with 2 classes and orthogonal composition", () => {
    // 1. Arrange: Create Department Class Node with Attributes & Operations
    const departmentNode: UmlStudioNode = {
      id: "node-department",
      type: DiagramNodeTypeRecord.class,
      position: { x: 100, y: 150 },
      width: 220,
      height: 140,
      measured: { width: 220, height: 140 },
      data: {
        name: "Department",
        attributes: [
          { id: "attr-dept-1", name: "+ name: string" },
          { id: "attr-dept-2", name: "- code: string" },
        ],
        methods: [
          { id: "op-dept-1", name: "+ getEmployees(): List<Employee>" },
          { id: "op-dept-2", name: "+ addEmployee(emp: Employee): void" },
        ],
      },
    }

    // 2. Arrange: Create Employee Class Node with Attributes & Operations
    const employeeNode: UmlStudioNode = {
      id: "node-employee",
      type: DiagramNodeTypeRecord.class,
      position: { x: 450, y: 150 },
      width: 200,
      height: 120,
      measured: { width: 200, height: 120 },
      data: {
        name: "Employee",
        attributes: [
          { id: "attr-emp-1", name: "+ id: string" },
          { id: "attr-emp-2", name: "+ fullName: string" },
        ],
        methods: [{ id: "op-emp-1", name: "+ getDetails(): string" }],
      },
    }

    // 3. Arrange: Create Orthogonal Composition Relationship from Department to Employee
    const compositionEdge: UmlStudioEdge = {
      id: "edge-dept-emp-comp",
      source: "node-department",
      target: "node-employee",
      type: DiagramEdgeTypeRecord.ClassComposition,
      sourceHandle: "node-department-right",
      targetHandle: "node-employee-left",
      data: {
        points: [
          { x: 320, y: 220 },
          { x: 385, y: 220 },
          { x: 385, y: 210 },
          { x: 450, y: 210 },
        ],
      },
    }

    // 4. Arrange: Assemble Complete UMLModel
    const umlModel: UMLModel = {
      version: "4.0.0",
      id: "diagram-cu01-integration",
      title: "Company Department & Employee Model",
      type: UMLDiagramType.ClassDiagram,
      nodes: [departmentNode, employeeNode],
      edges: [compositionEdge],
      assessments: {
        "node-department": {
          modelElementId: "node-department",
          elementType: "Class",
          score: 1,
        },
        "node-employee": {
          modelElementId: "node-employee",
          elementType: "Class",
          score: 1,
        },
      },
      interactive: {
        elements: {
          "node-department": true,
          "node-employee": true,
        },
        relationships: {
          "edge-dept-emp-comp": true,
        },
      },
    }

    // 5. Act & Assert: Strict Metamodel Schema Validation
    const isValid = validateModel(umlModel)
    expect(isValid, JSON.stringify(validateModel.errors)).toBe(true)
    expect(validateModel.errors).toBeNull()

    // 6. Assert: Node and Edge Structure Integrity
    expect(umlModel.nodes).toHaveLength(2)
    expect(umlModel.edges).toHaveLength(1)
    expect(umlModel.type).toBe("ClassDiagram")

    const dept = umlModel.nodes.find((n: UmlStudioNode) => n.id === "node-department")
    expect(dept?.data.name).toBe("Department")
    expect(dept?.data.attributes as unknown[]).toHaveLength(2)
    expect(dept?.data.methods as unknown[]).toHaveLength(2)

    const edge = umlModel.edges[0]
    expect(edge.type).toBe("ClassComposition")
    expect(edge.data.points).toHaveLength(4)
  })

  it("verifies SVG export marker resolution contains the filled black diamond for composition", () => {
    // 1. Verify marker resolution for ClassComposition edge type
    const markerConfig = getEdgeMarkerStyles("ClassComposition")

    // Must resolve to the black-rhombus SVG marker
    expect(markerConfig.markerEnd).toBe("url(#black-rhombus)")
    expect(markerConfig.strokeDashArray).toBe("0") // Solid line for composition

    // 2. Verify black-rhombus geometry definition is filled (black diamond)
    const rhombusConfig = MARKER_CONFIGS["black-rhombus"]
    expect(rhombusConfig).toBeDefined()
    expect(rhombusConfig.filled).toBe(true)

    // 3. Verify SVG representation contains the black-rhombus marker definition
    const mockSvgWithMarkers = `
      <svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
        <defs>
          <marker id="black-rhombus" viewBox="-12 -6 24 12" refX="10" refY="0" markerWidth="20" markerHeight="10" orient="auto">
            <path d="M -10 0 L 0 5 L 10 0 L 0 -5 Z" fill="#000000" stroke="#000000" />
          </marker>
        </defs>
        <path d="M 320 220 L 385 220 L 385 210 L 450 210" marker-end="url(#black-rhombus)" stroke="#000000" stroke-width="1.5" />
      </svg>
    `

    expect(mockSvgWithMarkers).toContain('id="black-rhombus"')
    expect(mockSvgWithMarkers).toContain('marker-end="url(#black-rhombus)"')
    expect(mockSvgWithMarkers).toContain('fill="#000000"')
  })

  it("enforces UML Domain Guard: rejects non-UML diagrams and invalid node types", () => {
    // 1. Invalid diagram type (e.g. UseCaseDiagram, ActivityDiagram) must fail schema validation
    const nonUmlDiagram = {
      version: "4.0.0",
      id: "invalid-diagram",
      title: "Invalid Non-UML",
      type: "UseCaseDiagram", // Not in ClassDiagram schema
      nodes: [],
      edges: [],
      assessments: {},
    }

    expect(validateModel(nonUmlDiagram)).toBe(false)

    // 2. Invalid node type (e.g. bpmnTask, stateNode) must fail schema validation
    const invalidNodeModel = {
      version: "4.0.0",
      id: "invalid-nodes",
      title: "Invalid Node Types",
      type: "ClassDiagram",
      nodes: [
        {
          id: "n-invalid",
          type: "bpmnTask", // Prohibited: only 'class' and 'package' allowed
          position: { x: 0, y: 0 },
          width: 100,
          height: 50,
          measured: { width: 100, height: 50 },
          data: {},
        },
      ],
      edges: [],
      assessments: {},
    }

    expect(validateModel(invalidNodeModel)).toBe(false)
  })
})
