import { describe, it, expect, beforeAll } from "vitest"
import Ajv, { type ValidateFunction } from "ajv"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { UMLModel, UmlStudioNode, UmlStudioEdge } from "../../lib/typings"
import { UMLDiagramType } from "../../lib/types/DiagramType"
import { DiagramEdgeTypeRecord } from "../../lib/modelElementTypes"
import { MockAIAdapter } from "../../lib/ai/adapters/mockAdapter"
import { validateDiff, applyDiff } from "../../lib/ai/diffEngine"

describe("INT-CU03: Case of Use CU-03 Agentic AI Modeling Integration", () => {
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

  const createInitialModel = (): UMLModel => ({
    version: "4.0.0",
    id: "diagram-cu03-initial",
    title: "Initial AI Diagram",
    type: UMLDiagramType.ClassDiagram,
    nodes: [],
    edges: [],
    assessments: {},
    interactive: {
      elements: {},
      relationships: {},
    },
  })

  it("processes natural language prompt for GoF Strategy Pattern and emits a valid ModelDiff", async () => {
    // 1. Arrange: Natural language prompt mandated by INT-CU03
    const prompt = "Crear patrón Strategy con Contexto y 2 estrategias"
    const adapter = new MockAIAdapter()
    const currentModel = createInitialModel()

    // 2. Act: Generate structured ModelDiff via Multi-Adapter AI
    const diff = await adapter.generateDiff(prompt, currentModel)

    // 3. Assert: Structural validation of ModelDiff against schema
    const validation = validateDiff(diff)
    expect(validation.valid).toBe(true)
    expect(validation.errors).toBeUndefined()

    // Verify elements in diff
    expect(diff.add?.elements).toBeDefined()
    expect(diff.add?.elements).toHaveLength(4)

    const elementNames = diff.add?.elements?.map((e) => e.name)
    expect(elementNames).toContain("Context")
    expect(elementNames).toContain("Strategy")
    expect(elementNames).toContain("ConcreteStrategyA")
    expect(elementNames).toContain("ConcreteStrategyB")

    // Verify relationships in diff: 2 realizations + 1 aggregation
    expect(diff.add?.relationships).toBeDefined()
    expect(diff.add?.relationships).toHaveLength(3)

    const realizations = diff.add?.relationships?.filter(
      (r) => r.type === DiagramEdgeTypeRecord.ClassRealization
    )
    expect(realizations).toHaveLength(2)

    const sources = realizations?.map((r) => r.source)
    expect(sources).toContain("ConcreteStrategyA")
    expect(sources).toContain("ConcreteStrategyB")
  })

  it("applies Strategy Pattern ModelDiff to UMLModel, producing 3 classes, 2 realizations and 100% schema compliance", async () => {
    // 1. Arrange: Adapter and base diagram
    const prompt = "Crear patrón Strategy con Contexto y 2 estrategias"
    const adapter = new MockAIAdapter()
    const initialModel = createInitialModel()

    // 2. Act: Generate and apply ModelDiff
    const diff = await adapter.generateDiff(prompt, initialModel)
    const updatedModel = applyDiff(initialModel, diff)

    // 3. Assert: 4 nodes created (3 concrete classes + 1 strategy interface)
    expect(updatedModel.nodes).toHaveLength(4)

    const contextNode = updatedModel.nodes.find((n: UmlStudioNode) => n.data.name === "Context")
    const strategyNode = updatedModel.nodes.find((n: UmlStudioNode) => n.data.name === "Strategy")
    const strategyANode = updatedModel.nodes.find(
      (n: UmlStudioNode) => n.data.name === "ConcreteStrategyA"
    )
    const strategyBNode = updatedModel.nodes.find(
      (n: UmlStudioNode) => n.data.name === "ConcreteStrategyB"
    )

    expect(contextNode).toBeDefined()
    expect(strategyNode).toBeDefined()
    expect(strategyANode).toBeDefined()
    expect(strategyBNode).toBeDefined()

    // Verify Strategy interface stereotype
    expect(strategyNode?.data.stereotype).toBe("<<interface>>")

    // Verify 3 concrete classes (Context, ConcreteStrategyA, ConcreteStrategyB)
    const concreteClasses = updatedModel.nodes.filter(
      (n: UmlStudioNode) => n.data.stereotype !== "<<interface>>"
    )
    expect(concreteClasses).toHaveLength(3)

    // 4. Assert: 2 realization relationships connecting concrete strategies to Strategy
    const realizationEdges = updatedModel.edges.filter(
      (e: UmlStudioEdge) => e.type === DiagramEdgeTypeRecord.ClassRealization
    )
    expect(realizationEdges).toHaveLength(2)

    for (const edge of realizationEdges) {
      expect(edge.target).toBe(strategyNode?.id)
      expect([strategyANode?.id, strategyBNode?.id]).toContain(edge.source)
      // Orthogonal points must be populated
      expect(edge.data.points.length).toBeGreaterThanOrEqual(2)
    }

    // 5. Assert: Aggregation edge connecting Context to Strategy
    const aggregationEdge = updatedModel.edges.find(
      (e: UmlStudioEdge) => e.type === DiagramEdgeTypeRecord.ClassAggregation
    )
    expect(aggregationEdge).toBeDefined()
    expect(aggregationEdge?.source).toBe(contextNode?.id)
    expect(aggregationEdge?.target).toBe(strategyNode?.id)

    // 6. Assert: Metamodel schema validation against packages/core/schema/uml-model-4.schema.json
    const isValid = validateModel(updatedModel)
    expect(isValid, JSON.stringify(validateModel.errors)).toBe(true)
    expect(validateModel.errors).toBeNull()
  })

  it("handles incremental AI modifications and element removals without breaking canvas state or schema", async () => {
    // 1. Arrange: Existing diagram with Strategy pattern
    const adapter = new MockAIAdapter()
    const baseModel = createInitialModel()
    const initialDiff = await adapter.generateDiff(
      "Crear patrón Strategy con Contexto y 2 estrategias",
      baseModel
    )
    const modelWithStrategy = applyDiff(baseModel, initialDiff)

    const contextNode = modelWithStrategy.nodes.find((n) => n.data.name === "Context")
    expect(contextNode).toBeDefined()

    // 2. Act: AI instruction to modify Context and remove ConcreteStrategyB
    const strategyBNode = modelWithStrategy.nodes.find((n) => n.data.name === "ConcreteStrategyB")
    expect(strategyBNode).toBeDefined()

    const modificationDiff = {
      modify: {
        elements: [
          {
            id: contextNode!.id,
            changes: {
              name: "PaymentContext",
            },
          },
        ],
      },
      remove: {
        elementIds: [strategyBNode!.id],
      },
    }

    const nextModel = applyDiff(modelWithStrategy, modificationDiff)

    // 3. Assert: Context renamed to PaymentContext
    const paymentContext = nextModel.nodes.find((n) => n.id === contextNode!.id)
    expect(paymentContext?.data.name).toBe("PaymentContext")

    // 4. Assert: ConcreteStrategyB removed, along with its realization edge
    expect(nextModel.nodes.find((n) => n.id === strategyBNode!.id)).toBeUndefined()
    expect(nextModel.nodes).toHaveLength(3)

    // Remaining realization edges should only be 1 (for ConcreteStrategyA)
    const remainingRealizations = nextModel.edges.filter(
      (e) => e.type === DiagramEdgeTypeRecord.ClassRealization
    )
    expect(remainingRealizations).toHaveLength(1)

    // 5. Assert: Resulting model strictly conforms to JSON schema
    const isValid = validateModel(nextModel)
    expect(isValid, JSON.stringify(validateModel.errors)).toBe(true)
    expect(validateModel.errors).toBeNull()
  })

  it("applies modifications using fuzzy matching: matches 'D' to an existing 'Class D' node and merges attributes", () => {
    const modelWithClassD = createInitialModel()
    modelWithClassD.nodes.push({
      id: "node-EAID_79CE31E8_4942_4a0f_A97C_8C276EB26BDD",
      type: "Class",
      position: { x: 250, y: 200 },
      width: 200,
      height: 120,
      measured: { width: 200, height: 120 },
      data: {
        name: "Class D",
        attributes: [{ id: "attr-1", name: "+ id: Long" }],
        methods: [],
      },
    })

    // ModelDiff targeting "D" instead of "Class D" or full node-EAID... ID
    const diffWithD = {
      modify: {
        elements: [
          {
            id: "D",
            changes: {
              attributes: [{ name: "+ nombre: string" }, { name: "+ apellido: string" }],
            },
          },
        ],
      },
    }

    const updated = applyDiff(modelWithClassD, diffWithD)
    const targetNode = updated.nodes.find(
      (n) => n.id === "node-EAID_79CE31E8_4942_4a0f_A97C_8C276EB26BDD"
    )

    expect(targetNode).toBeDefined()
    expect(targetNode?.data.name).toBe("Class D")
    const attrs = targetNode?.data.attributes as Array<{ name: string }>
    expect(attrs).toHaveLength(3) // "+ id: Long", "+ nombre: string", "+ apellido: string"
    expect(attrs.map((a) => a.name)).toContain("+ nombre: string")
    expect(attrs.map((a) => a.name)).toContain("+ apellido: string")
  })

  it("merges attributes into existing class when model emits add.elements instead of modify", () => {
    const modelWithClassD = createInitialModel()
    modelWithClassD.nodes.push({
      id: "node-EAID_79CE31E8_4942_4a0f_A97C_8C276EB26BDD",
      type: "Class",
      position: { x: 250, y: 200 },
      width: 200,
      height: 120,
      measured: { width: 200, height: 120 },
      data: {
        name: "Class D",
        attributes: [{ id: "attr-1", name: "+ id: Long" }],
        methods: [],
      },
    })

    const diffWithAdd = {
      add: {
        elements: [
          {
            name: "Class D",
            type: "Class",
            attributes: [{ name: "+ nombre: String" }, { name: "+ apellido: String" }],
          },
        ],
      },
    }

    const updated = applyDiff(modelWithClassD, diffWithAdd)
    // Should NOT create duplicate node
    const matches = updated.nodes.filter((n) => n.data.name === "Class D")
    expect(matches).toHaveLength(1)

    const attrs = matches[0]?.data.attributes as Array<{ name: string }>
    expect(attrs).toHaveLength(3)
    expect(attrs.map((a) => a.name)).toContain("+ nombre: String")
    expect(attrs.map((a) => a.name)).toContain("+ apellido: String")
  })

  it("handles association classes by linking intermediate <<association>> node to edge", () => {
    const baseModel = createInitialModel()
    baseModel.nodes.push(
      {
        id: "node-m",
        type: "class",
        position: { x: 100, y: 100 },
        width: 160,
        height: 45,
        measured: { width: 160, height: 45 },
        data: { name: "M", attributes: [], methods: [] },
      },
      {
        id: "node-f",
        type: "class",
        position: { x: 400, y: 100 },
        width: 160,
        height: 45,
        measured: { width: 160, height: 45 },
        data: { name: "F", attributes: [], methods: [] },
      }
    )

    const diff = {
      add: {
        elements: [
          {
            name: "MF_Assoc",
            type: "Class",
            stereotype: "<<association>>",
            attributes: [],
            methods: [],
          },
        ],
        relationships: [
          {
            type: DiagramEdgeTypeRecord.ClassBidirectional,
            source: "M",
            target: "F",
            associationClass: "MF_Assoc",
          },
        ],
      },
    }

    const updated = applyDiff(baseModel, diff)
    expect(updated.nodes).toHaveLength(3)

    const assocNode = updated.nodes.find((n) => n.data.name === "MF_Assoc")
    expect(assocNode).toBeDefined()
    expect(assocNode?.data.isAssociationClass).toBe(true)
    expect(assocNode?.data.stereotype).toBe("<<association>>")
    expect(assocNode?.height).toBe(110) // Standard class hitbox reserving compartments

    const edge = updated.edges.find((e) => e.data.associationClassNodeId === assocNode?.id)
    expect(edge).toBeDefined()
    expect(edge?.data.associationClassNodeId).toBe(assocNode?.id)
  })

  it("auto-creates the intermediate association class node if omitted from elements", () => {
    const baseModel = createInitialModel()
    baseModel.nodes.push(
      {
        id: "node-m",
        type: "class",
        position: { x: 100, y: 100 },
        width: 160,
        height: 45,
        measured: { width: 160, height: 45 },
        data: { name: "M", attributes: [], methods: [] },
      },
      {
        id: "node-f",
        type: "class",
        position: { x: 400, y: 100 },
        width: 160,
        height: 45,
        measured: { width: 160, height: 45 },
        data: { name: "F", attributes: [], methods: [] },
      }
    )

    // LLM forgot to add MF_Assoc to elements, but specified associationClass on relationship
    const diff = {
      add: {
        elements: [],
        relationships: [
          {
            type: DiagramEdgeTypeRecord.ClassBidirectional,
            source: "M",
            target: "F",
            associationClass: "MF_Assoc",
          },
        ],
      },
    }

    const updated = applyDiff(baseModel, diff)
    expect(updated.nodes).toHaveLength(3)

    const autoAssocNode = updated.nodes.find((n) => n.data.name === "MF_Assoc")
    expect(autoAssocNode).toBeDefined()
    expect(autoAssocNode?.data.isAssociationClass).toBe(true)
    expect(autoAssocNode?.data.stereotype).toBe("<<association>>")
    expect(autoAssocNode?.height).toBe(110)

    const edge = updated.edges.find((e) => e.data.associationClassNodeId === autoAssocNode?.id)
    expect(edge).toBeDefined()
  })

  it("clears attributes and methods when changes specify empty arrays", () => {
    const baseModel = createInitialModel()
    baseModel.nodes.push({
      id: "node-f",
      type: "class",
      position: { x: 100, y: 100 },
      width: 160,
      height: 120,
      measured: { width: 160, height: 120 },
      data: {
        name: "F",
        attributes: [
          { id: "a1", name: "+ attr1: String" },
          { id: "a2", name: "+ attr2: Int" },
        ],
        methods: [{ id: "m1", name: "+ method1(): void" }],
      },
    })

    const clearDiff = {
      modify: {
        elements: [
          {
            id: "F",
            changes: {
              attributes: [],
              methods: [],
            },
          },
        ],
      },
    }

    const updated = applyDiff(baseModel, clearDiff)
    const target = updated.nodes.find((n) => n.id === "node-f")
    expect(target?.data.attributes).toEqual([])
    expect(target?.data.methods).toEqual([])
  })

  it("does not throw when edges or nodes contain null points or undefined data", () => {
    const modelWithNullPoints = createInitialModel()
    modelWithNullPoints.nodes.push({
      id: "node-1",
      type: "class",
      position: { x: 0, y: 0 },
      width: 160,
      height: 50,
      data: { name: "Class1" },
    } as UmlStudioNode)

    modelWithNullPoints.edges.push({
      id: "edge-null-points",
      source: "node-1",
      target: "node-2",
      type: "ClassBidirectional",
      data: { points: null as unknown as [] },
    } as unknown as UmlStudioEdge)

    const diff = {
      add: {
        elements: [{ name: "Vendedor", type: "Class", attributes: [], methods: [] }],
      },
    }

    // Should NOT throw "Cannot read properties of null (reading 'map')"
    const updated = applyDiff(modelWithNullPoints, diff)
    expect(updated.nodes).toHaveLength(2)
    expect(updated.edges[0]?.data.points).toEqual([])
  })

  it("removes specific attributes and methods using removeAttributes and removeMethods, adjusting hitbox height", () => {
    const baseModel = createInitialModel()
    baseModel.nodes.push({
      id: "node-ventas",
      type: "class",
      position: { x: 100, y: 100 },
      width: 220,
      height: 120,
      measured: { width: 220, height: 120 },
      data: {
        name: "Ventas",
        attributes: [
          { id: "a1", name: "+ nombre: String" },
          { id: "a2", name: "+ apellido: String" },
        ],
        methods: [
          { id: "m1", name: "+ pagar(): boolean" },
          { id: "m2", name: "+ cancelar(): void" },
        ],
      },
    })

    const removeDiff = {
      modify: {
        elements: [
          {
            id: "Ventas",
            changes: {
              removeAttributes: ["nombre"],
              removeMethods: ["cancelar"],
            },
          },
        ],
      },
    }

    const updated = applyDiff(baseModel, removeDiff)
    const target = updated.nodes.find((n) => n.id === "node-ventas")
    expect(target).toBeDefined()
    expect(target?.data.attributes).toHaveLength(1)
    expect((target?.data.attributes as Array<{ name: string }>)[0].name).toBe("+ apellido: String")
    expect(target?.data.methods).toHaveLength(1)
    expect((target?.data.methods as Array<{ name: string }>)[0].name).toBe("+ pagar(): boolean")
    // Dimensions must be strictly preserved without modifying width or height
    expect(target?.width).toBe(220)
    expect(target?.height).toBe(120)
  })

  it("dynamically normalizes hardcoded MF_Assoc association class name when connecting other classes", () => {
    const baseModel = createInitialModel()
    baseModel.nodes.push(
      {
        id: "node-p",
        type: "class",
        position: { x: 100, y: 100 },
        width: 200,
        height: 80,
        data: { name: "Producto", attributes: [], methods: [] },
      },
      {
        id: "node-v",
        type: "class",
        position: { x: 400, y: 100 },
        width: 200,
        height: 80,
        data: { name: "Ventas", attributes: [], methods: [] },
      }
    )

    const diffWithHardcodedAssoc = {
      add: {
        relationships: [
          {
            type: DiagramEdgeTypeRecord.ClassBidirectional,
            source: "Producto",
            target: "Ventas",
            associationClass: "MF_Assoc",
          },
        ],
      },
    }

    const updated = applyDiff(baseModel, diffWithHardcodedAssoc)
    const assocNode = updated.nodes.find((n) => n.data.isAssociationClass)
    expect(assocNode).toBeDefined()
    expect(assocNode?.data.name).toBe("ProductoVentas_Assoc")
    expect(assocNode?.data.stereotype).toBe("<<association>>")
  })

  it("auto-creates normal source and target classes when association class connects non-existent classes", () => {
    const emptyModel = createInitialModel()
    const diff = {
      add: {
        relationships: [
          {
            type: DiagramEdgeTypeRecord.ClassBidirectional,
            source: "Estudiante",
            target: "Curso",
            associationClass: "Matricula",
          },
        ],
      },
    }

    const updated = applyDiff(emptyModel, diff)
    expect(updated.nodes).toHaveLength(3)

    const estudiante = updated.nodes.find((n) => n.data.name === "Estudiante")
    const curso = updated.nodes.find((n) => n.data.name === "Curso")
    const matricula = updated.nodes.find((n) => n.data.name === "Matricula")

    expect(estudiante).toBeDefined()
    expect(estudiante?.data.isAssociationClass).toBeFalsy()
    expect(estudiante?.data.stereotype).toBeUndefined()

    expect(curso).toBeDefined()
    expect(curso?.data.isAssociationClass).toBeFalsy()
    expect(curso?.data.stereotype).toBeUndefined()

    expect(matricula).toBeDefined()
    expect(matricula?.data.isAssociationClass).toBe(true)
    expect(matricula?.data.stereotype).toBe("<<association>>")
  })

  it("preserves node position in canvas when modifying attributes or methods", () => {
    const baseModel = createInitialModel()
    const initialPosition = { x: 350, y: 420 }
    baseModel.nodes.push({
      id: "node-usuario",
      type: "class",
      position: { ...initialPosition },
      width: 180,
      height: 100,
      measured: { width: 180, height: 100 },
      data: { name: "Usuario", attributes: [], methods: [] },
    })

    const diff = {
      modify: {
        elements: [
          {
            id: "Usuario",
            changes: {
              attributes: [{ name: "+ nombre: String" }],
            },
          },
        ],
      },
    }

    const updated = applyDiff(baseModel, diff)
    const userNode = updated.nodes.find((n) => n.id === "node-usuario")
    expect(userNode).toBeDefined()
    // Position MUST NOT change when modifying attributes
    expect(userNode?.position).toEqual(initialPosition)
    expect(userNode?.data.attributes).toHaveLength(1)
    expect(userNode?.data.attributes[0].name).toBe("+ nombre: String")
  })

  it("preserves position and node name when diff contains null fields or bogus (0,0) position", () => {
    const baseModel = createInitialModel()
    const initialPosition = { x: 500, y: 300 }
    baseModel.nodes.push({
      id: "node-usuario-2",
      type: "class",
      position: { ...initialPosition },
      width: 160,
      height: 100,
      measured: { width: 160, height: 100 },
      data: { name: "Usuario", attributes: [], methods: [] },
    })

    // Simulated payload from FastAPI when response has null fields
    const diffWithNulls = {
      modify: {
        elements: [
          {
            id: "Usuario",
            changes: {
              name: null as unknown as string,
              position: { x: 0, y: 0 },
              attributes: [{ name: "+ nombre: String" }],
            },
          },
        ],
      },
    }

    const updated = applyDiff(baseModel, diffWithNulls)
    const node = updated.nodes.find((n) => n.id === "node-usuario-2")
    expect(node).toBeDefined()
    expect(node?.data.name).toBe("Usuario")
    expect(node?.position).toEqual(initialPosition)
    expect(node?.data.attributes).toHaveLength(1)
  })

  it("removes classes and cascades connected edges using element_ids alias and class name", () => {
    const baseModel = createInitialModel()
    baseModel.nodes.push(
      {
        id: "node-venta",
        type: "class",
        position: { x: 995, y: 255 },
        width: 160,
        height: 100,
        data: { name: "Venta", attributes: [], methods: [] },
      },
      {
        id: "node-producto",
        type: "class",
        position: { x: 690, y: 455 },
        width: 160,
        height: 100,
        data: { name: "Producto", attributes: [], methods: [] },
      }
    )
    baseModel.edges.push({
      id: "edge-vp",
      source: "node-venta",
      target: "node-producto",
      type: "ClassBidirectional",
      data: { points: [] },
    })

    const removeDiff = {
      remove: {
        element_ids: ["Producto"],
      },
    }

    const updated = applyDiff(baseModel, removeDiff)
    expect(updated.nodes.find((n) => n.data.name === "Producto")).toBeUndefined()
    expect(updated.nodes.find((n) => n.data.name === "Venta")).toBeDefined()
    // Edge connected to Producto must cascade delete
    expect(updated.edges.find((e) => e.id === "edge-vp")).toBeUndefined()
  })
})
