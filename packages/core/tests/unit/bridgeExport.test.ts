import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { exportToXmi } from "../../lib/export/xmiExport";
import { importXmiDiagram } from "../../lib/import/xmiImport";

describe("Bridge Diagram export/import verification", () => {
  it("exports Bridge.json to valid EA XMI and updates bridge_diagram.xmi", async () => {
    const bridgeJsonPath = resolve(__dirname, "../../../../apps/webapp/assets/diagramTemplates/Bridge.json");
    const bridgeDiagramXmiPath = resolve(__dirname, "../../../../docs/examples/bridge_diagram.xmi");

    const bridgeModel = JSON.parse(readFileSync(bridgeJsonPath, "utf-8"));
    const result = await exportToXmi(bridgeModel, {
      diagramName: "Bridge Diagram",
      targetDialect: "EnterpriseArchitect",
      xmiVersion: "2.1",
    });

    expect(result.xmiContent).toContain('<xmi:Extension exporter="Enterprise Architect"');
    expect(result.xmiContent).toContain('<packagedElement xmi:type="uml:Package"');
    expect(result.xmiContent).toContain("<diagrams>");
    expect(result.xmiContent).toContain("<connectors>");
    expect(result.xmiContent).toContain("extendedProperties ptInstances=");

    // 1. Unspecified multiplicities and roles should NOT emit dummy values
    expect(result.xmiContent).not.toContain('<lowerValue xmi:type="uml:LiteralInteger"');
    expect(result.xmiContent).not.toContain('<upperValue xmi:type="uml:LiteralUnlimitedNatural"');
    expect(result.xmiContent).not.toContain('<role name=');

    // 2. Return types on operations (EAnone_void)
    expect(result.xmiContent).toContain('<ownedParameter xmi:type="uml:Parameter"');
    expect(result.xmiContent).toContain('name="return" direction="return" type="EAnone_void"');

    // 3. Primitive types package for EA
    expect(result.xmiContent).toContain("<primitivetypes>");
    expect(result.xmiContent).toContain('name="EA_PrimitiveTypes_Package"');
    expect(result.xmiContent).toContain('xmi:id="EAnone_void" name="void"');

    // 4. Formal diagram elements geometry
    expect(result.xmiContent).toContain("<elements>");
    expect(result.xmiContent).toMatch(/<element geometry="Left=\d+;Top=\d+;Right=\d+;Bottom=\d+;"/);

    // Write updated bridge_diagram.xmi
    writeFileSync(bridgeDiagramXmiPath, result.xmiContent, "utf-8");

    // Reimport to verify round-trip
    const reimported = importXmiDiagram(result.xmiContent);
    expect(reimported.nodes.length).toBe(bridgeModel.nodes.length);
    expect(reimported.edges.length).toBe(bridgeModel.edges.length);
    for (const edge of reimported.edges) {
      expect(edge.data?.sourceRole).toBeUndefined();
      expect(edge.data?.targetRole).toBeUndefined();
      expect(edge.data?.sourceMultiplicity).toBeUndefined();
      expect(edge.data?.targetMultiplicity).toBeUndefined();
    }
  });
});
