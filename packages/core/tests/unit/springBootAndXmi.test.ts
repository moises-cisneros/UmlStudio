import { describe, it, expect } from "vitest";
import {
  exportToSpringBoot,
  type SpringBootGeneratedFile,
} from "@/export/springBootExport";
import { exportToXmi } from "@/export/xmiExport";
import { importXmiDiagram } from "@/import/xmiImport";
import { UMLDiagramType } from "@/types/DiagramType";
import type { UMLModel } from "@/typings";

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
};

describe("exportToSpringBoot skeleton", () => {
  it("generates skeleton Java entity files for classes in the diagram", async () => {
    const result = await exportToSpringBoot(SAMPLE_MODEL, {
      packageName: "com.acme.store",
      includeJpaAnnotations: true,
    });

    expect(result.summary.totalEntities).toBe(2);
    expect(result.files).toHaveLength(2);

    const userFile = result.files.find((f: SpringBootGeneratedFile) =>
      f.path.includes("User.java"),
    );
    expect(userFile).toBeDefined();
    expect(userFile!.content).toContain("package com.acme.store.model;");
    expect(userFile!.content).toContain("@Entity");
    expect(userFile!.content).toContain("public class User");
  });
});

describe("exportToXmi skeleton", () => {
  it("produces valid skeleton XMI containing model identity and title", async () => {
    const result = await exportToXmi(SAMPLE_MODEL, {
      xmiVersion: "2.1",
      targetDialect: "EnterpriseArchitect",
    });

    expect(result.filename).toBe("ecommercecore.xmi");
    expect(result.xmiContent).toContain('<?xml version="1.0"');
    expect(result.xmiContent).toContain('xmi:version="2.1"');
    expect(result.xmiContent).toContain('name="ECommerceCore"');
    expect(result.xmiContent).toContain('xmi:id="test-model-1"');
  });
});

describe("importXmiDiagram skeleton", () => {
  it("converts basic XMI document string into a canonical UMLModel", () => {
    const sampleXmi = `<?xml version="1.0" encoding="UTF-8"?>
<xmi:XMI xmi:version="2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1">
  <uml:Model xmi:type="uml:Model" name="ImportedBank" xmi:id="m1" />
</xmi:XMI>`;

    const model = importXmiDiagram(sampleXmi, {
      defaultTitle: "Enterprise Bank",
    });
    expect(model.version).toBe("4.0.0");
    expect(model.type).toBe(UMLDiagramType.ClassDiagram);
    expect(model.title).toBe("Enterprise Bank");
    expect(Array.isArray(model.nodes)).toBe(true);
  });

  it("throws for invalid non-XML input", () => {
    expect(() => importXmiDiagram("not an xml")).toThrow("Invalid XMI payload");
  });
});
