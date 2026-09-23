import { describe, it, expect } from "vitest"
import { validateDiff, applyDiff, findTargetEdge } from "../../lib/ai/diffEngine"
import { MockAIAdapter } from "../../lib/ai/adapters/mockAdapter"
import { UMLDiagramType } from "../../lib/types/DiagramType"
import { DiagramEdgeTypeRecord } from "../../lib/modelElementTypes"
import type { UMLModel, UmlStudioNode, UmlStudioEdge } from "../../lib/typings"
import type { ModelDiff } from "../../lib/ai/types"

function makeNode(id: string, name: string, x = 0): UmlStudioNode {
  return {
    id,
    type: "class",
    position: { x, y: 0 },
    width: 150,
    height: 100,
    measured: { width: 150, height: 100 },
    data: { name, attributes: [], methods: [] },
  } as UmlStudioNode
}

function baseModel(): UMLModel {
  return {
    version: "4.0.0",
    id: "model-rel-modify",
    title: "Relationship Modify Fixture",
    type: UMLDiagramType.ClassDiagram,
    nodes: [makeNode("node-a", "A"), makeNode("node-b", "B", 300)],
    edges: [
      {
        id: "edge-ab",
        source: "node-a",
        target: "node-b",
        type: "ClassDependency",
        sourceHandle: "right",
        targetHandle: "left",
        data: { points: [] },
      } as UmlStudioEdge,
    ],
    assessments: {},
    interactive: { elements: {}, relationships: {} },
  }
}

describe("AI relationship modification (roles, multiplicities, type changes)", () => {
  it("validates modify.relationships identified by endpoint class names", () => {
    const diff: ModelDiff = {
      modify: {
        relationships: [
          {
            source: "A",
            target: "B",
            changes: { targetMultiplicity: "1..*" },
          },
        ],
      },
    }
    const validation = validateDiff(diff)
    expect(validation.valid).toBe(true)
    expect(validation.errors).toBeUndefined()
  })

  it("rejects modify.relationships without id or endpoints", () => {
    const diff = {
      modify: {
        relationships: [{ changes: { targetMultiplicity: "1" } }],
      },
    } as unknown as ModelDiff
    const validation = validateDiff(diff)
    expect(validation.valid).toBe(false)
    expect(validation.errors?.join(" ")).toContain("requires an id or both source and target")
  })

  it("normalizes relationship type aliases in modify.relationships", () => {
    const diff: ModelDiff = {
      modify: {
        relationships: [{ source: "A", target: "B", changes: { type: "dependency" as never } }],
      },
    }
    const validation = validateDiff(diff)
    expect(validation.valid).toBe(true)
    expect(diff.modify?.relationships?.[0].changes.type).toBe(DiagramEdgeTypeRecord.ClassDependency)
  })

  it("finds edges by id, endpoints and A -> B patterns", () => {
    const model = baseModel()
    expect(findTargetEdge(model.edges, model.nodes, "edge-ab")?.id).toBe("edge-ab")
    expect(findTargetEdge(model.edges, model.nodes, undefined, "A", "B")?.id).toBe("edge-ab")
    expect(findTargetEdge(model.edges, model.nodes, "A -> B")?.id).toBe("edge-ab")
    expect(findTargetEdge(model.edges, model.nodes, undefined, "A", "Z")).toBeUndefined()
  })

  it("applies multiplicity, role and type changes resolved by class names", () => {
    const model = baseModel()
    const updated = applyDiff(model, {
      modify: {
        relationships: [
          {
            source: "A",
            target: "B",
            changes: {
              type: DiagramEdgeTypeRecord.ClassInheritance,
              targetMultiplicity: "1..*",
              targetRole: "empleado",
            },
          },
        ],
      },
    })

    const edge = updated.edges.find((e) => e.id === "edge-ab")
    expect(edge).toBeDefined()
    expect(edge?.type).toBe("ClassInheritance")
    expect(edge?.data.targetMultiplicity).toBe("1..*")
    expect(edge?.data.targetRole).toBe("empleado")
    // Original model instance stays immutable
    expect(model.edges[0].type).toBe("ClassDependency")
  })

  it("mock adapter resolves Spanish multiplicity prompts into modify.relationships", async () => {
    const adapter = new MockAIAdapter()
    const diff = await adapter.generateDiff(
      "Cambia la multiplicidad a 1..* de la relación entre la clase A y la clase B",
      baseModel()
    )
    expect(diff.modify?.relationships).toHaveLength(1)
    expect(diff.modify?.relationships?.[0].changes.targetMultiplicity).toBe("1..*")
    expect(validateDiff(diff).valid).toBe(true)

    const updated = applyDiff(baseModel(), diff)
    expect(updated.edges[0].data.targetMultiplicity).toBe("1..*")
  })

  it("mock adapter resolves Spanish type-change prompts into modify.relationships", async () => {
    const adapter = new MockAIAdapter()
    const diff = await adapter.generateDiff(
      "Pasa la relación entre A y B de dependencia a herencia",
      baseModel()
    )
    expect(diff.modify?.relationships?.[0].changes.type).toBe(
      DiagramEdgeTypeRecord.ClassInheritance
    )
    const updated = applyDiff(baseModel(), diff)
    expect(updated.edges[0].type).toBe("ClassInheritance")
  })
})
