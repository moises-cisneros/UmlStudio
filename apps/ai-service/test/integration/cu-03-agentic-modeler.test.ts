import { describe, it, expect, beforeAll } from "vitest";
import Ajv, { type ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  UMLModel,
  UmlStudioNode,
  UmlStudioEdge,
} from "../../../../packages/core/lib/typings";
import { UMLDiagramType } from "../../../../packages/core/lib/types/DiagramType";
import { DiagramEdgeTypeRecord } from "../../../../packages/core/lib/modelElementTypes";
import { MockAIAdapter } from "../../../../packages/core/lib/ai/adapters/mockAdapter";
import {
  validateDiff,
  applyDiff,
} from "../../../../packages/core/lib/ai/diffEngine";

/**
 * INT-CU03: Case of Use CU-03 Agentic AI Modeling Integration
 * Canonical path: apps/ai-service/test/integration/cu-03-agentic-modeler.test.ts
 */
describe("INT-CU03: Case of Use CU-03 Agentic AI Modeling Integration (Canonical Mirror)", () => {
  let ajv: Ajv;
  let validateModel: ValidateFunction;

  beforeAll(() => {
    const schemaPath = resolve(
      __dirname,
      "../../../../packages/core/schema/uml-model-4.schema.json",
    );
    const rawSchema = readFileSync(schemaPath, "utf-8");
    const schema = JSON.parse(rawSchema);

    ajv = new Ajv({ allowUnionTypes: true, strict: false });
    validateModel = ajv.compile(schema);
  });

  it("interprets natural language prompt and produces 3 classes and 2 realizations meeting schema", async () => {
    const prompt = "Crear patrón Strategy con Contexto y 2 estrategias";
    const adapter = new MockAIAdapter();
    const initialModel: UMLModel = {
      version: "4.0.0",
      id: "diagram-canonical-cu03",
      title: "Canonical Strategy Diagram",
      type: UMLDiagramType.ClassDiagram,
      nodes: [],
      edges: [],
      assessments: {},
      interactive: {
        elements: {},
        relationships: {},
      },
    };

    const diff = await adapter.generateDiff(prompt, initialModel);
    expect(validateDiff(diff).valid).toBe(true);

    const model = applyDiff(initialModel, diff);

    // 3 concrete classes (Context, ConcreteStrategyA, ConcreteStrategyB)
    const concreteClasses = model.nodes.filter(
      (n: UmlStudioNode) => n.data.stereotype !== "<<interface>>",
    );
    expect(concreteClasses).toHaveLength(3);

    // 2 realization relationships
    const realizations = model.edges.filter(
      (e: UmlStudioEdge) => e.type === DiagramEdgeTypeRecord.ClassRealization,
    );
    expect(realizations).toHaveLength(2);

    // 100% schema compliance
    const isValid = validateModel(model);
    expect(isValid, JSON.stringify(validateModel.errors)).toBe(true);
    expect(validateModel.errors).toBeNull();
  });
});
