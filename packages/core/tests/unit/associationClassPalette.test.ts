import { describe, it, expect } from "vitest"
import { dropElementConfigs } from "../../lib/constants"
import { UMLDiagramType } from "../../lib/types/DiagramType"
import { ClassStereotype } from "../../lib/types/nodes/enums/ClassStereotype"
import { DEFAULT_LABELS, SPANISH_LABELS } from "../../lib/i18n/labels"

describe("CU-01 Association Class (Clase Intermedia / RF-02b)", () => {
  it("includes AssociationClass in the class diagram drop element palette", () => {
    const classConfigs = dropElementConfigs[UMLDiagramType.ClassDiagram]
    const assocConfig = classConfigs.find((c) => c.isAssociationClass)

    expect(assocConfig).toBeDefined()
    expect(assocConfig?.type).toBe("class")
    expect(assocConfig?.isAssociationClass).toBe(true)
    expect(assocConfig?.defaultData?.stereotype).toBe(ClassStereotype.Association)
    expect(assocConfig?.defaultData?.isAssociationClass).toBe(true)
  })

  it("has complete i18n labels for Association Class guided flow", () => {
    expect(DEFAULT_LABELS.associationClass).toBe("Association Class")
    expect(SPANISH_LABELS.associationClass).toBe("Clase Intermedia")

    expect(DEFAULT_LABELS.selectFromClass).toContain("source")
    expect(SPANISH_LABELS.selectFromClass).toContain("origen")

    expect(DEFAULT_LABELS.selectToClass).toContain("target")
    expect(SPANISH_LABELS.selectToClass).toContain("destino")

    expect(DEFAULT_LABELS.requiresTwoClassesForAssociationClass).toBeDefined()
    expect(SPANISH_LABELS.requiresTwoClassesForAssociationClass).toContain("al menos 2 clases")

    expect(DEFAULT_LABELS.cancelSelection).toBeDefined()
    expect(SPANISH_LABELS.cancelSelection).toBeDefined()
  })

  it("defines ClassStereotype.Association as canonical stereotype", () => {
    expect(ClassStereotype.Association).toBe("association")
  })

  it("configures AssociationClass with standard class hitbox reserving compartments", () => {
    const classConfigs = dropElementConfigs[UMLDiagramType.ClassDiagram]
    const assocConfig = classConfigs.find((c) => c.isAssociationClass)

    expect(assocConfig?.width).toBe(160)
    expect(assocConfig?.height).toBe(110)
  })
})
