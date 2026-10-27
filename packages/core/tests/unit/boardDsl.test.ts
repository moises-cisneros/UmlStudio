import { describe, it, expect } from "vitest"
import { boardToDsl } from "../../lib/ai/boardDsl"
import { UMLDiagramType } from "../../lib/types/DiagramType"
import type { UMLModel, UmlStudioEdge, UmlStudioNode } from "../../lib/typings"

function makeNode(id: string, name: string, attributes: string[] = [], methods: string[] = []) {
  return {
    id,
    type: "class",
    position: { x: 120, y: 340 },
    width: 150,
    height: 100,
    measured: { width: 150, height: 100 },
    data: {
      name,
      attributes: attributes.map((n, i) => ({ id: `${id}-a${i}`, name: n })),
      methods: methods.map((n, i) => ({ id: `${id}-m${i}`, name: n })),
    },
  } as UmlStudioNode
}

function model(nodes: UmlStudioNode[], edges: UmlStudioEdge[]): UMLModel {
  return {
    version: "4.0.0",
    id: "m1",
    title: "Sales",
    type: UMLDiagramType.ClassDiagram,
    nodes,
    edges,
    assessments: {},
  }
}

const association = {
  id: "e1",
  source: "cliente",
  target: "factura",
  type: "ClassBidirectional",
  sourceHandle: "right",
  targetHandle: "left",
  data: { points: [], sourceMultiplicity: "1", targetMultiplicity: "0..*" },
} as unknown as UmlStudioEdge

const sample = () =>
  model(
    [
      makeNode("factura", "Factura", ["numero: String"], ["+calcularTotal(): Decimal"]),
      makeNode("cliente", "Cliente", ["nombre: String"]),
    ],
    [association]
  )

describe("boardToDsl", () => {
  it("serializes classes and relationships without positions or sizes", () => {
    const dsl = boardToDsl(sample(), { maxChars: 10_000, owners: { factura: "Ana" } })
    expect(dsl).toBe(
      [
        "class Factura { numero: String; +calcularTotal(): Decimal } @Ana",
        "class Cliente { nombre: String }",
        'Cliente "1" -- "0..*" Factura : Association',
      ].join("\n")
    )
    expect(dsl).not.toMatch(/120|340|150/)
  })

  it("omits multiplicities that are not set", () => {
    const edge = { ...association, data: { points: [] } } as UmlStudioEdge
    const dsl = boardToDsl(model(sample().nodes, [edge]), { maxChars: 10_000 })
    expect(dsl).toContain("Cliente -- Factura : Association")
  })

  it("does not throw for an edge without data and emits it without multiplicities", () => {
    const { data: _data, ...rest } = association
    const edge = rest as unknown as UmlStudioEdge
    const dsl = boardToDsl(model(sample().nodes, [edge]), { maxChars: 10_000 })
    expect(dsl).toContain("Cliente -- Factura : Association")
  })

  it("keeps selected classes complete and reduces the rest to names when over budget", () => {
    const dsl = boardToDsl(sample(), { maxChars: 60, selectedIds: ["factura"] })
    expect(dsl).toContain("class Factura { numero: String; +calcularTotal(): Decimal }")
    expect(dsl).toContain("class Cliente")
    expect(dsl).not.toContain("nombre: String")
  })

  it("keeps mentioned classes complete, matching names case-insensitively", () => {
    const dsl = boardToDsl(sample(), { maxChars: 60, mentionedNames: ["cliente"] })
    expect(dsl).toContain("class Cliente { nombre: String }")
    expect(dsl).not.toContain("numero: String")
  })

  it("drops relationships that do not touch focused classes once the budget is spent", () => {
    const dsl = boardToDsl(sample(), { maxChars: 10, selectedIds: [] })
    expect(dsl).not.toContain("--")
  })
})
