import { describe, it, expect } from "vitest"
import { exportToSpringBoot, type SpringBootGeneratedFile } from "../../lib/export/springBootExport"
import { exportToXmi } from "../../lib/export/xmiExport"
import { importXmiDiagram } from "../../lib/import/xmiImport"
import { UMLDiagramType } from "../../lib/types/DiagramType"
import type { UMLModel } from "../../lib/typings"

const SAMPLE_MODEL: UMLModel = {
  version: "4.0.0",
  id: "test-model-1",
  title: "ECommerceCore",
  type: UMLDiagramType.ClassDiagram,
  nodes: [
    {
      id: "node-user",
      type: "class",
      width: 150,
      height: 100,
      position: { x: 0, y: 0 },
      measured: { width: 150, height: 100 },
      data: { name: "User" },
    },
    {
      id: "node-order",
      type: "class",
      width: 150,
      height: 100,
      position: { x: 200, y: 0 },
      measured: { width: 150, height: 100 },
      data: { name: "Order" },
    },
  ],
  edges: [],
  assessments: {},
}

describe("exportToSpringBoot skeleton", () => {
  it("generates skeleton Java entity files for classes in the diagram", async () => {
    const result = await exportToSpringBoot(SAMPLE_MODEL, {
      packageName: "com.acme.store",
      includeJpaAnnotations: true,
    })

    expect(result.summary.totalEntities).toBe(2)
    expect(result.files).toHaveLength(2)

    const userFile = result.files.find((f: SpringBootGeneratedFile) => f.path.includes("User.java"))
    expect(userFile).toBeDefined()
    expect(userFile!.content).toContain("package com.acme.store.model;")
    expect(userFile!.content).toContain("@Entity")
    expect(userFile!.content).toContain("public class User")
  })
})

describe("exportToXmi skeleton", () => {
  it("produces valid skeleton XMI containing model identity and title", async () => {
    const result = await exportToXmi(SAMPLE_MODEL, {
      xmiVersion: "2.1",
      targetDialect: "EnterpriseArchitect",
    })

    expect(result.filename).toBe("ecommercecore.xmi")
    expect(result.xmiContent).toContain('<?xml version="1.0"')
    expect(result.xmiContent).toContain('xmi:version="2.1"')
    expect(result.xmiContent).toContain('name="ECommerceCore"')
    expect(result.xmiContent).toContain('xmi:id="test-model-1"')
  })
})

describe("importXmiDiagram skeleton", () => {
  it("converts basic XMI document string into a canonical UMLModel", () => {
    const sampleXmi = `<?xml version="1.0" encoding="UTF-8"?>
<xmi:XMI xmi:version="2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1">
  <uml:Model xmi:type="uml:Model" name="ImportedBank" xmi:id="m1" />
</xmi:XMI>`

    const model = importXmiDiagram(sampleXmi, {
      defaultTitle: "Enterprise Bank",
    })
    expect(model.version).toBe("4.0.0")
    expect(model.type).toBe(UMLDiagramType.ClassDiagram)
    expect(model.title).toBe("Enterprise Bank")
    expect(Array.isArray(model.nodes)).toBe(true)
  })

  it("throws for invalid non-XML input", () => {
    expect(() => importXmiDiagram("not an xml")).toThrow("Invalid XMI payload")
  })
})

describe("mapUmlTypeToJava and SpringBoot export with Date/Time and Swagger", () => {
  it("maps date and time to java.time.LocalDate and java.time.LocalTime for robust JSON serialization", async () => {
    const { mapUmlTypeToJava } = await import("../../lib/export/springBootExport")
    const dateMapping = mapUmlTypeToJava("Date")
    expect(dateMapping.javaType).toBe("LocalDate")
    expect(dateMapping.sqlType).toBe("DATE")
    expect(dateMapping.imports).toContain("java.time.LocalDate")

    const timeMapping = mapUmlTypeToJava("Time")
    expect(timeMapping.javaType).toBe("LocalTime")
    expect(timeMapping.sqlType).toBe("TIME")
    expect(timeMapping.imports).toContain("java.time.LocalTime")

    const localDateMapping = mapUmlTypeToJava("LocalDate")
    expect(localDateMapping.javaType).toBe("LocalDate")
    expect(localDateMapping.sqlType).toBe("DATE")
    expect(localDateMapping.imports).toContain("java.time.LocalDate")
  })

  it("exports entity and DTO with @Schema examples and OpenApiConfig.java", async () => {
    const { exportSpringBootFull } = await import("../../lib/export/springBootExport")
    const modelWithDates: UMLModel = {
      version: "4.0.0",
      id: "model-dates",
      title: "CitasMedicas",
      type: UMLDiagramType.ClassDiagram,
      nodes: [
        {
          id: "node-cita",
          type: "class",
          width: 200,
          height: 150,
          measured: { width: 200, height: 150 },
          position: { x: 0, y: 0 },
          data: {
            name: "Cita",
            attributes: [
              { id: "a1", name: "+ fecha: Date" },
              { id: "a2", name: "+ hora: Time" },
              { id: "a3", name: "+ email: String" },
            ],
          },
        },
      ],
      edges: [],
      assessments: {},
    }

    const result = await exportSpringBootFull(modelWithDates, {
      packageName: "com.example.clinica",
    })

    // 1. Verify OpenApiConfig.java was emitted
    const openApiConfigFile = result.files.find((f: SpringBootGeneratedFile) =>
      f.path.includes("OpenApiConfig.java")
    )
    expect(openApiConfigFile).toBeDefined()
    expect(openApiConfigFile!.content).toContain("public class OpenApiConfig")
    expect(openApiConfigFile!.content).toContain("OpenAPI customOpenAPI")

    // 2. Verify Entity imports java.time.LocalDate and java.time.LocalTime
    const entityFile = result.files.find((f: SpringBootGeneratedFile) =>
      f.path.includes("Cita.java")
    )
    expect(entityFile).toBeDefined()
    expect(entityFile!.content).toContain("import java.time.LocalDate;")
    expect(entityFile!.content).toContain("import java.time.LocalTime;")
    expect(entityFile!.content).toContain("private LocalDate fecha;")
    expect(entityFile!.content).toContain("private LocalTime hora;")

    // 3. Verify Request DTO contains @Schema with executable examples
    const reqDtoFile = result.files.find((f: SpringBootGeneratedFile) =>
      f.path.includes("CitaRequest.java")
    )
    expect(reqDtoFile).toBeDefined()
    expect(reqDtoFile!.content).toContain("import io.swagger.v3.oas.annotations.media.Schema;")
    expect(reqDtoFile!.content).toContain('@Schema(description = "fecha", example = "2026-09-21")')
    expect(reqDtoFile!.content).toContain('@Schema(description = "hora", example = "14:30:00")')
    expect(reqDtoFile!.content).toContain(
      '@Schema(description = "email", example = "usuario@example.com")'
    )
  })

  it("includes springdoc-openapi-starter-webmvc-ui in emitted pom.xml", async () => {
    const { emitPomXml } = await import("../../lib/export/mavenScaffold")
    const pom = emitPomXml({
      groupId: "com.example",
      artifactId: "demo",
      packageName: "com.example.demo",
    })
    expect(pom).toContain("<groupId>org.springdoc</groupId>")
    expect(pom).toContain("<artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>")
    expect(pom).toContain("<version>2.8.5</version>")
  })
})
