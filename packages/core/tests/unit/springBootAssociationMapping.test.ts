import { describe, it, expect } from "vitest"
import {
  buildKernelModel,
  emitEntityFile,
  type KernelModel,
} from "../../lib/export/springBootExport"
import { UMLDiagramType } from "../../lib/types/DiagramType"
import type { UMLModel } from "../../lib/typings"

function assocModel(
  edgeType: string,
  data: Record<string, unknown> = {},
  bidirectional = true
): UMLModel {
  const type = bidirectional ? "ClassBidirectional" : "ClassUnidirectional"
  return {
    version: "4.0.0",
    id: "model-assoc",
    title: "AssocMapping",
    type: UMLDiagramType.ClassDiagram,
    nodes: [
      {
        id: "node-a",
        type: "class",
        width: 150,
        height: 100,
        position: { x: 0, y: 0 },
        measured: { width: 150, height: 100 },
        data: { name: "Autor" },
      },
      {
        id: "node-b",
        type: "class",
        width: 150,
        height: 100,
        position: { x: 300, y: 0 },
        measured: { width: 150, height: 100 },
        data: { name: "Libro" },
      },
    ],
    edges: [
      {
        id: "edge-ab",
        source: "node-a",
        target: "node-b",
        type: (edgeType || type) as "ClassBidirectional",
        sourceHandle: "right",
        targetHandle: "left",
        data: { points: [], ...data },
      },
    ],
    assessments: {},
  } as unknown as UMLModel
}

function kernelOf(model: UMLModel): KernelModel {
  return buildKernelModel(model, { packageName: "com.example.demo" })
}

describe("Spring Boot association mapping: endpoints + multiplicities, roles ignored", () => {
  it("ignores roles for field names and warns about them", () => {
    const kernel = kernelOf(
      assocModel("", {
        sourceRole: "escritor",
        targetRole: "obra",
        sourceMultiplicity: "1",
        targetMultiplicity: "0..*",
      })
    )
    // 1 -> *: the FK lives on Libro; field names come from class names.
    const libro = kernel.entities.find((e) => e.className === "Libro")
    const rel = libro!.relations.find((r) => r.targetEntity === "Autor")
    expect(rel?.kind).toBe("many-to-one")
    expect(rel?.fieldName).toBe("autor")
    expect(rel?.joinColumn).toBe("autor_id")
    expect(kernel.warnings.some((w) => w.includes("Roles on association"))).toBe(true)
    const entityFile = emitEntityFile(libro!)
    expect(entityFile.content).not.toContain("escritor")
    expect(entityFile.content).not.toContain("obra")
  })

  it("keeps the legacy N:1 orientation when no multiplicities are given", () => {
    const kernel = kernelOf(assocModel(""))
    const autor = kernel.entities.find((e) => e.className === "Autor")
    const libro = kernel.entities.find((e) => e.className === "Libro")
    expect(
      autor!.relations.find((r) => r.kind === "many-to-one" && r.targetEntity === "Libro")
    ).toBeDefined()
    expect(
      libro!.relations.find((r) => r.kind === "one-to-many" && r.targetEntity === "Autor")
    ).toBeDefined()
  })

  it("maps 1 -> * with the FK on the target side", () => {
    const kernel = kernelOf(assocModel("", { sourceMultiplicity: "1", targetMultiplicity: "0..*" }))
    const libro = kernel.entities.find((e) => e.className === "Libro")
    const rel = libro!.relations.find((r) => r.targetEntity === "Autor")
    expect(rel?.kind).toBe("many-to-one")
    expect(rel?.fieldName).toBe("autor")
    expect(rel?.joinColumn).toBe("autor_id")
    const autor = kernel.entities.find((e) => e.className === "Autor")
    const back = autor!.relations.find((r) => r.targetEntity === "Libro")
    expect(back?.kind).toBe("one-to-many")
    expect(back?.mappedBy).toBe("autor")
    const entityFile = emitEntityFile(libro!)
    expect(entityFile.content).toContain("@ManyToOne")
    expect(entityFile.content).toContain("private Autor autor;")
  })

  it("maps * -> 1 with the FK on the source side", () => {
    const kernel = kernelOf(assocModel("", { sourceMultiplicity: "0..*", targetMultiplicity: "1" }))
    const autor = kernel.entities.find((e) => e.className === "Autor")
    const rel = autor!.relations.find((r) => r.targetEntity === "Libro")
    expect(rel?.kind).toBe("many-to-one")
    expect(rel?.fieldName).toBe("libro")
    expect(rel?.joinColumn).toBe("libro_id")
    const libro = kernel.entities.find((e) => e.className === "Libro")
    expect(
      libro!.relations.find((r) => r.kind === "one-to-many" && r.targetEntity === "Autor")
    ).toBeDefined()
  })

  it("maps 1 -> 1 to OneToOne with FK owner on the source", () => {
    const kernel = kernelOf(assocModel("", { sourceMultiplicity: "1", targetMultiplicity: "1" }))
    const autor = kernel.entities.find((e) => e.className === "Autor")
    const libro = kernel.entities.find((e) => e.className === "Libro")
    const owner = autor!.relations.find((r) => r.targetEntity === "Libro")
    expect(owner?.kind).toBe("one-to-one")
    expect(owner?.joinColumn).toBe("libro_id")
    const inverse = libro!.relations.find((r) => r.targetEntity === "Autor")
    expect(inverse?.kind).toBe("one-to-one")
    expect(inverse?.mappedBy).toBe(owner!.fieldName)
    const entityFile = emitEntityFile(autor!)
    expect(entityFile.content).toContain("@OneToOne")
    expect(entityFile.content).toContain("@JoinColumn")
    expect(entityFile.content).not.toContain("java.util.List")
  })

  it("maps * -> * to ManyToMany with a join table", () => {
    const kernel = kernelOf(
      assocModel("", { sourceMultiplicity: "0..*", targetMultiplicity: "0..*" })
    )
    expect(kernel.joinTables).toHaveLength(1)
    expect(kernel.joinTables[0].tableName).toBe("autor_libro")
    const autor = kernel.entities.find((e) => e.className === "Autor")
    expect(
      autor!.relations.find((r) => r.kind === "many-to-many" && r.targetEntity === "Libro")
    ).toBeDefined()
  })

  it("emits FK holder plus navigation for unidirectional 1 -> * associations", () => {
    const kernel = kernelOf(
      assocModel("", { sourceMultiplicity: "1", targetMultiplicity: "0..*" }, false)
    )
    const libro = kernel.entities.find((e) => e.className === "Libro")
    const fk = libro!.relations.find((r) => r.targetEntity === "Autor")
    expect(fk?.kind).toBe("many-to-one")
    expect(fk?.joinColumn).toBe("autor_id")
    const autor = kernel.entities.find((e) => e.className === "Autor")
    expect(autor!.relations).toHaveLength(1)
    const nav = autor!.relations[0]
    expect(nav.kind).toBe("one-to-many")
    expect(nav.targetEntity).toBe("Libro")
    expect(nav.joinColumn).toBe("autor_id")
    expect(nav.mappedBy).toBeUndefined()
  })

  it("warns and falls back to legacy orientation on unrecognized multiplicities", () => {
    const kernel = kernelOf(assocModel("", { targetMultiplicity: "muchos" }))
    expect(kernel.warnings.some((w) => w.includes("Unrecognized multiplicity"))).toBe(true)
    const autor = kernel.entities.find((e) => e.className === "Autor")
    expect(
      autor!.relations.find((r) => r.kind === "many-to-one" && r.targetEntity === "Libro")
    ).toBeDefined()
  })
})
