import { describe, it, expect } from "vitest"
import { DEFAULT_LABELS, SPANISH_LABELS, type ResolvedUmlStudioLabels } from "../../lib/i18n/labels"
import { getDefaultEdgeType } from "../../lib/utils/edgeUtils"
import { UMLDiagramType } from "../../lib/types/DiagramType"

describe("CU-01 Modeling Updates: Association, i18n & Defaults", () => {
  it("defaults new connections to ClassBidirectional (Association)", () => {
    expect(getDefaultEdgeType(UMLDiagramType.ClassDiagram)).toBe("ClassBidirectional")
    expect(getDefaultEdgeType()).toBe("ClassBidirectional")
  })

  it("labels ClassBidirectional canonically as Association in English and Asociación in Spanish", () => {
    expect(DEFAULT_LABELS.association).toBe("Association")
    expect(DEFAULT_LABELS.biAssociation).toBe("Association")
    expect(SPANISH_LABELS.association).toBe("Asociación")
    expect(SPANISH_LABELS.biAssociation).toBe("Asociación")
  })

  it("contains the copyElement label for node contextual menu", () => {
    expect(DEFAULT_LABELS.copyElement).toBe("Copy node")
    expect(SPANISH_LABELS.copyElement).toBe("Copiar nodo")
  })

  it("ensures SPANISH_LABELS provides 100% complete translations matching ResolvedUmlStudioLabels", () => {
    const defaultKeys = Object.keys(DEFAULT_LABELS) as (keyof ResolvedUmlStudioLabels)[]
    for (const key of defaultKeys) {
      expect(SPANISH_LABELS[key], `Missing Spanish translation for key: ${key}`).toBeDefined()
      if (typeof DEFAULT_LABELS[key] === "string") {
        expect(typeof SPANISH_LABELS[key]).toBe("string")
        expect((SPANISH_LABELS[key] as string).length).toBeGreaterThan(0)
      } else if (typeof DEFAULT_LABELS[key] === "function") {
        expect(typeof SPANISH_LABELS[key]).toBe("function")
      }
    }
  })

  it("properly translates node types and stereotypes in Spanish", () => {
    expect(SPANISH_LABELS.class).toBe("Clase")
    expect(SPANISH_LABELS.abstractClass).toBe("Clase Abstracta")
    expect(SPANISH_LABELS.interface).toBe("Interfaz")
    expect(SPANISH_LABELS.enumeration).toBe("Enumeración")
    expect(SPANISH_LABELS.nodeTypeLabel("class")).toBe("Clase")
    expect(SPANISH_LABELS.nodeTypeLabel("interface")).toBe("Interfaz")
  })
})
