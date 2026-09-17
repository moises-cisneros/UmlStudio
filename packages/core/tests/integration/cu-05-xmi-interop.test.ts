import { describe, it, expect, beforeAll } from "vitest";
import Ajv, { type ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importXmiDiagram } from "../../lib/import/xmiImport";
import { exportToXmi } from "../../lib/export/xmiExport";
import { UMLDiagramType } from "../../lib/types/DiagramType";
import { DiagramNodeTypeRecord, DiagramEdgeTypeRecord } from "../../lib/modelElementTypes";
import type { UMLModel } from "../../lib/typings";

describe("INT-CU05: Case of Use CU-05 XMI Import/Export Interoperability", () => {
  let ajv: Ajv;
  let validateModel: ValidateFunction;
  let schema: Record<string, unknown>;
  let eaSampleXmi: string;

  beforeAll(() => {
    const schemaPath = resolve(__dirname, "../../schema/uml-model-4.schema.json");
    schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
    ajv = new Ajv({ allowUnionTypes: true, strict: false });
    validateModel = ajv.compile(schema);

    const fixturePath = resolve(__dirname, "../fixtures/ea-sample.xmi");
    eaSampleXmi = readFileSync(fixturePath, "utf-8");
  });

  it("Step 1: imports Enterprise Architect 16 XMI into a schema-valid UMLModel", () => {
    const model = importXmiDiagram(eaSampleXmi, {
      sourceDialect: "EnterpriseArchitect",
      defaultTitle: "CorporateSystem",
    });

    // Verify basic model metadata
    expect(model.version).toBe("4.0.0");
    expect(model.type).toBe(UMLDiagramType.ClassDiagram);
    expect(model.title).toBe("CorporateSystem");

    // 100% Ajv schema validation check
    const isValid = validateModel(model);
    expect(isValid).toBe(true);
    expect(validateModel.errors).toBeNull();

    // Verify extracted nodes: Department, Employee, IPayable (Activity PayrollProcess must be ignored)
    expect(model.nodes.length).toBe(3);
    const nodeNames = model.nodes.map((n) => n.data.name);
    expect(nodeNames).toContain("Department");
    expect(nodeNames).toContain("Employee");
    expect(nodeNames).toContain("IPayable");
    expect(nodeNames).not.toContain("PayrollProcess");

    // Verify IPayable interface stereotype
    const payableNode = model.nodes.find((n) => n.data.name === "IPayable");
    expect(payableNode).toBeDefined();
    expect(payableNode?.data.stereotype).toBe("interface");

    // Verify Department attributes and visibilities
    const deptNode = model.nodes.find((n) => n.data.name === "Department");
    expect(deptNode).toBeDefined();
    expect(deptNode?.type).toBe(DiagramNodeTypeRecord.class);
    const deptAttrs =
      (deptNode?.data?.attributes as Array<{ id: string; name: string }> | undefined)?.map(
        (a) => a.name,
      ) ?? [];
    expect(deptAttrs).toContain("+ name: String");
    expect(deptAttrs).toContain("- code: String");

    // Verify Employee attributes with all 4 visibilities
    const empNode = model.nodes.find((n) => n.data.name === "Employee");
    expect(empNode).toBeDefined();
    const empAttrs =
      (empNode?.data?.attributes as Array<{ id: string; name: string }> | undefined)?.map(
        (a) => a.name,
      ) ?? [];
    expect(empAttrs).toContain("+ id: String");
    expect(empAttrs).toContain("# salary: Real");
    expect(empAttrs).toContain("~ internalNotes: String");

    // Verify relationships: Realization and Composition
    expect(model.edges.length).toBe(2);

    const realizationEdge = model.edges.find(
      (e) => e.type === DiagramEdgeTypeRecord.ClassRealization,
    );
    expect(realizationEdge).toBeDefined();
    expect(realizationEdge?.source).toBe(empNode?.id);
    expect(realizationEdge?.target).toBe(payableNode?.id);

    const compositionEdge = model.edges.find(
      (e) => e.type === DiagramEdgeTypeRecord.ClassComposition,
    );
    expect(compositionEdge).toBeDefined();
    expect(compositionEdge?.source).toBe(deptNode?.id);
    expect(compositionEdge?.target).toBe(empNode?.id);
    expect(compositionEdge?.data?.sourceMultiplicity).toBe("1");
    expect(compositionEdge?.data?.targetMultiplicity).toBe("1..*");

    // Verify automatic layout coordinates are assigned and not all (0, 0)
    const positions = model.nodes.map((n) => n.position);
    const uniqueXs = new Set(positions.map((p) => p.x));
    expect(uniqueXs.size).toBeGreaterThanOrEqual(2);
  });

  it("Step 2: exports UMLModel to Enterprise Architect compliant XMI 2.1 preserving taxonomy", async () => {
    const importedModel = importXmiDiagram(eaSampleXmi, {
      sourceDialect: "EnterpriseArchitect",
    });

    const exportResult = await exportToXmi(importedModel, {
      targetDialect: "EnterpriseArchitect",
      xmiVersion: "2.1",
      diagramName: "CorporateSystem",
    });

    expect(exportResult.filename).toBe("corporatesystem.xmi");
    const { xmiContent } = exportResult;

    // Verify XML headers and namespaces
    expect(xmiContent).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xmiContent).toContain('xmlns:uml="http://schema.omg.org/spec/UML/2.1"');
    expect(xmiContent).toContain('xmlns:xmi="http://schema.omg.org/spec/XMI/2.1"');

    // Verify elements are exported
    expect(xmiContent).toContain('<packagedElement xmi:type="uml:Class"');
    expect(xmiContent).toContain('name="Department"');
    expect(xmiContent).toContain('name="Employee"');
    expect(xmiContent).toContain('<packagedElement xmi:type="uml:Interface"');
    expect(xmiContent).toContain('name="IPayable"');

    // Verify attributes and visibilities
    expect(xmiContent).toContain('name="name" visibility="public"');
    expect(xmiContent).toContain('name="code" visibility="private"');
    expect(xmiContent).toContain('name="salary" visibility="protected"');
    expect(xmiContent).toContain('name="internalNotes" visibility="package"');

    // Verify relationships
    expect(xmiContent).toContain('<interfaceRealization xmi:type="uml:InterfaceRealization"');
    expect(xmiContent).toContain('aggregation="composite"');

    // Verify Enterprise Architect visual diagram extension and package hierarchy
    expect(xmiContent).toContain('<packagedElement xmi:type="uml:Package"');
    expect(xmiContent).toContain('<xmi:Extension exporter="Enterprise Architect" exporterVersion="6.5">');
    expect(xmiContent).toContain("<diagrams>");
    expect(xmiContent).toContain('<properties name="CorporateSystem" type="Logical"/>');
    expect(xmiContent).toContain("<elements>");
    expect(xmiContent).toContain("<connectors>");
    expect(xmiContent).toMatch(/<extendedProperties ptInstances="[^"]*SX=\d+;SY=\d+;EX=\d+;EY=\d+;SND=\d+;GUID=\{[^}]+\};/);
  });

  it("Step 3: executes full round-trip (Import -> Export -> Re-import) with 100% schema compliance and visual position retention", async () => {
    // 1. Initial Import
    const initialModel = importXmiDiagram(eaSampleXmi);

    // 2. Export (generates EA visual extension with geometry)
    const { xmiContent } = await exportToXmi(initialModel);

    // 3. Re-import (parses EA visual extension with geometry)
    const reimportedModel: UMLModel = importXmiDiagram(xmiContent);

    // Assert schema validity of reimported model
    const isValid = validateModel(reimportedModel);
    expect(isValid).toBe(true);
    expect(validateModel.errors).toBeNull();

    // Assert structural parity
    expect(reimportedModel.nodes.length).toBe(initialModel.nodes.length);
    expect(reimportedModel.edges.length).toBe(initialModel.edges.length);

    const initialNames = initialModel.nodes.map((n) => n.data.name).sort();
    const reimportedNames = reimportedModel.nodes.map((n) => n.data.name).sort();
    expect(reimportedNames).toEqual(initialNames);

    // Assert geometric layout retention across round-trip via EA extension
    initialModel.nodes.forEach((initialNode) => {
      const match = reimportedModel.nodes.find((n) => n.data.name === initialNode.data.name);
      expect(match).toBeDefined();
      expect(match?.position.x).toBe(initialNode.position.x);
      expect(match?.position.y).toBe(initialNode.position.y);
    });
  });

  it("Step 4: exports empty name in connectors and associations when unlabelled and no assoc_ in labels", async () => {
    const bridgeJsonPath = resolve(__dirname, "../../../../apps/webapp/assets/diagramTemplates/Bridge.json");
    const bridgeModel: UMLModel = JSON.parse(readFileSync(bridgeJsonPath, "utf-8"));

    const exportResult = await exportToXmi(bridgeModel, {
      targetDialect: "EnterpriseArchitect",
      xmiVersion: "2.1",
      diagramName: "Bridge Diagram",
    });

    const { xmiContent } = exportResult;

    // Connector name must be empty string if not explicitly labeled, NOT assoc_...
    expect(xmiContent).not.toMatch(/<connector[^>]*name="assoc_[^"]+"/);
    expect(xmiContent).not.toMatch(/<packagedElement[^>]*xmi:type="uml:Association"[^>]*name="assoc_[^"]+"/);
    expect(xmiContent).not.toMatch(/<labels[^>]*mt="assoc_[^"]+"/);

    // Specifically check that connector name is empty string for unlabeled relationships
    expect(xmiContent).toContain('<connector xmi:idref="');
    expect(xmiContent).toContain('name=""');
  });

  it("Step 5: assigns valid 4-way handles without node-id prefix on import", () => {
    const model = importXmiDiagram(eaSampleXmi);
    const validHandles = new Set(["top", "bottom", "left", "right"]);

    expect(model.edges.length).toBeGreaterThan(0);
    model.edges.forEach((edge) => {
      expect(validHandles.has(edge.sourceHandle as string)).toBe(true);
      expect(validHandles.has(edge.targetHandle as string)).toBe(true);
      expect(edge.sourceHandle).not.toContain("node-");
      expect(edge.targetHandle).not.toContain("node-");
    });
  });

  it("Step 6: imports native Enterprise Architect associations from Example.xmi with type xmi:idref and connectors", () => {
    const exampleXmiPath = resolve(__dirname, "../../../../docs/examples/Example.xmi");
    const exampleXmi = readFileSync(exampleXmiPath, "utf-8");

    const model = importXmiDiagram(exampleXmi);

    // Schema valid
    const isValid = validateModel(model);
    expect(isValid).toBe(true);

    // Verify nodes
    expect(model.nodes.length).toBe(3);
    const names = model.nodes.map((n) => n.data.name);
    expect(names).toContain("Class A");
    expect(names).toContain("Class B");
    expect(names).toContain("Class C");

    // Verify associations were successfully parsed from Example.xmi
    expect(model.edges.length).toBe(2);
    const edgeNames = model.edges.map((e) => e.data?.label);
    expect(edgeNames).toContain("Association A");
    expect(edgeNames).toContain("Association B");

    // All handles must be valid 4-way handles
    const validHandles = new Set(["top", "bottom", "left", "right"]);
    model.edges.forEach((edge) => {
      expect(validHandles.has(edge.sourceHandle as string)).toBe(true);
      expect(validHandles.has(edge.targetHandle as string)).toBe(true);
    });
  });

  it("Step 7: imports bridge_diagram.xmi with all relationships and no assoc_ technical label pollution", () => {
    const bridgeXmiPath = resolve(__dirname, "../../../../docs/examples/bridge_diagram.xmi");
    const bridgeXmi = readFileSync(bridgeXmiPath, "utf-8");

    const model = importXmiDiagram(bridgeXmi);
    expect(model.nodes.length).toBe(7);
    expect(model.edges.length).toBe(6);

    // Technical assoc_ names must be stripped/ignored
    model.edges.forEach((edge) => {
      if (edge.data?.label) {
        expect(edge.data.label).not.toMatch(/^assoc_/);
      }
    });

    // Handles must be valid 4-way handles
    const validHandles = new Set(["top", "bottom", "left", "right"]);
    model.edges.forEach((edge) => {
      expect(validHandles.has(edge.sourceHandle as string)).toBe(true);
      expect(validHandles.has(edge.targetHandle as string)).toBe(true);
    });
  });

  it("Step 8: ensures non-associations never export/import roles or multiplicities, and associations without them remain empty", async () => {
    const testModel: UMLModel = {
      version: "4.0.0",
      id: "model-test-clean-edges",
      title: "CleanEdgesModel",
      type: UMLDiagramType.ClassDiagram,
      nodes: [
        {
          id: "node-parent",
          type: DiagramNodeTypeRecord.class,
          position: { x: 100, y: 100 },
          width: 200,
          height: 80,
          measured: { width: 200, height: 80 },
          data: { name: "ParentClass", attributes: [], methods: [] },
        },
        {
          id: "node-child",
          type: DiagramNodeTypeRecord.class,
          position: { x: 100, y: 300 },
          width: 200,
          height: 80,
          measured: { width: 200, height: 80 },
          data: { name: "ChildClass", attributes: [], methods: [] },
        },
        {
          id: "node-interface",
          type: DiagramNodeTypeRecord.class,
          position: { x: 400, y: 100 },
          width: 200,
          height: 80,
          measured: { width: 200, height: 80 },
          data: { name: "IMyContract", stereotype: "interface", attributes: [], methods: [] },
        },
        {
          id: "node-other",
          type: DiagramNodeTypeRecord.class,
          position: { x: 400, y: 300 },
          width: 200,
          height: 80,
          measured: { width: 200, height: 80 },
          data: { name: "OtherClass", attributes: [], methods: [] },
        },
      ],
      edges: [
        // 1. Generalization
        {
          id: "edge-gen-1",
          type: DiagramEdgeTypeRecord.ClassInheritance,
          source: "node-child",
          target: "node-parent",
          sourceHandle: "top",
          targetHandle: "bottom",
          data: { points: [] },
        },
        // 2. Realization
        {
          id: "edge-real-1",
          type: DiagramEdgeTypeRecord.ClassRealization,
          source: "node-other",
          target: "node-interface",
          sourceHandle: "top",
          targetHandle: "bottom",
          data: { points: [] },
        },
        // 3. Clean Association without roles/multiplicities
        {
          id: "edge-clean-assoc",
          type: DiagramEdgeTypeRecord.ClassBidirectional,
          source: "node-child",
          target: "node-other",
          sourceHandle: "right",
          targetHandle: "left",
          data: { points: [] },
        },
        // 4. Configured Association with roles and multiplicities
        {
          id: "edge-configured-assoc",
          type: DiagramEdgeTypeRecord.ClassBidirectional,
          source: "node-parent",
          target: "node-other",
          sourceHandle: "bottom",
          targetHandle: "top",
          data: {
            points: [],
            sourceRole: "owner",
            targetRole: "asset",
            sourceMultiplicity: "1",
            targetMultiplicity: "0..*",
            label: "manages",
          },
        },
      ],
      assessments: {},
    };

    const exportResult = await exportToXmi(testModel, {
      diagramName: "CleanEdgesModel",
      targetDialect: "EnterpriseArchitect",
      xmiVersion: "2.1",
    });

    const xmi = exportResult.xmiContent;

    // 1. Generalization and Realization in connectors must NOT have roles or multiplicities
    const genConnectorMatch = xmi.match(/<connector xmi:idref="edge-gen-1"[\s\S]*?<\/connector>/);
    expect(genConnectorMatch).toBeDefined();
    expect(genConnectorMatch![0]).not.toContain("<role");
    expect(genConnectorMatch![0]).not.toContain("multiplicity=");
    expect(genConnectorMatch![0]).not.toContain("<labels");

    const realConnectorMatch = xmi.match(/<connector xmi:idref="edge-real-1"[\s\S]*?<\/connector>/);
    expect(realConnectorMatch).toBeDefined();
    expect(realConnectorMatch![0]).not.toContain("<role");
    expect(realConnectorMatch![0]).not.toContain("multiplicity=");
    expect(realConnectorMatch![0]).not.toContain("<labels");

    // 2. Clean association must NOT have roles, multiplicities, or labels
    const cleanAssocMatch = xmi.match(/<connector xmi:idref="edge-clean-assoc"[\s\S]*?<\/connector>/);
    expect(cleanAssocMatch).toBeDefined();
    expect(cleanAssocMatch![0]).not.toContain("<role");
    expect(cleanAssocMatch![0]).not.toContain("multiplicity=");
    expect(cleanAssocMatch![0]).not.toContain("<labels");

    // 3. Configured association MUST have roles and multiplicities
    const confAssocMatch = xmi.match(/<connector xmi:idref="edge-configured-assoc"[\s\S]*?<\/connector>/);
    expect(confAssocMatch).toBeDefined();
    expect(confAssocMatch![0]).toContain('<role name="owner"');
    expect(confAssocMatch![0]).toContain('<role name="asset"');
    expect(confAssocMatch![0]).toContain('multiplicity="1"');
    expect(confAssocMatch![0]).toContain('multiplicity="0..*"');
    expect(confAssocMatch![0]).toContain('<labels lb="1" lt="+owner" mt="manages" rb="0..*" rt="+asset"/>');

    // 4. Re-import and check edge data
    const reimported = importXmiDiagram(xmi);
    expect(reimported.edges.length).toBe(4);

    const reimportedGen = reimported.edges.find((e) => e.id === "edge-gen-1");
    expect(reimportedGen?.data?.sourceRole).toBeUndefined();
    expect(reimportedGen?.data?.targetRole).toBeUndefined();
    expect(reimportedGen?.data?.sourceMultiplicity).toBeUndefined();
    expect(reimportedGen?.data?.targetMultiplicity).toBeUndefined();

    const reimportedReal = reimported.edges.find((e) => e.id === "edge-real-1");
    expect(reimportedReal?.data?.sourceRole).toBeUndefined();
    expect(reimportedReal?.data?.targetRole).toBeUndefined();
    expect(reimportedReal?.data?.sourceMultiplicity).toBeUndefined();
    expect(reimportedReal?.data?.targetMultiplicity).toBeUndefined();

    const reimportedCleanAssoc = reimported.edges.find((e) => e.id === "edge-clean-assoc");
    expect(reimportedCleanAssoc?.data?.sourceRole).toBeUndefined();
    expect(reimportedCleanAssoc?.data?.targetRole).toBeUndefined();
    expect(reimportedCleanAssoc?.data?.sourceMultiplicity).toBeUndefined();
    expect(reimportedCleanAssoc?.data?.targetMultiplicity).toBeUndefined();

    const reimportedConfAssoc = reimported.edges.find((e) => e.id === "edge-configured-assoc");
    expect(reimportedConfAssoc?.data?.sourceRole).toBe("owner");
    expect(reimportedConfAssoc?.data?.targetRole).toBe("asset");
    expect(reimportedConfAssoc?.data?.sourceMultiplicity).toBe("1");
    expect(reimportedConfAssoc?.data?.targetMultiplicity).toBe("*");
    expect(reimportedConfAssoc?.data?.label).toBe("manages");
  });
});


