import { describe, it, expect, beforeAll } from "vitest";
import Ajv, { type ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { UMLModel, UmlStudioNode, UmlStudioEdge } from "../../lib/typings";
import { UMLDiagramType } from "../../lib/types/DiagramType";
import { DiagramEdgeTypeRecord } from "../../lib/modelElementTypes";
import { MockAIAdapter } from "../../lib/ai/adapters/mockAdapter";
import { validateDiff, applyDiff } from "../../lib/ai/diffEngine";

describe("INT-CU03: Case of Use CU-03 Agentic AI Modeling Integration", () => {
  let ajv: Ajv;
  let validateModel: ValidateFunction;
  let schema: Record<string, unknown>;

  beforeAll(() => {
    const schemaPath = resolve(
      __dirname,
      "../../schema/uml-model-4.schema.json",
    );
    const rawSchema = readFileSync(schemaPath, "utf-8");
    schema = JSON.parse(rawSchema);

    ajv = new Ajv({ allowUnionTypes: true, strict: false });
    validateModel = ajv.compile(schema);
  });

  const createInitialModel = (): UMLModel => ({
    version: "4.0.0",
    id: "diagram-cu03-initial",
    title: "Initial AI Diagram",
    type: UMLDiagramType.ClassDiagram,
    nodes: [],
    edges: [],
    assessments: {},
    interactive: {
      elements: {},
      relationships: {},
    },
  });

  it("processes natural language prompt for GoF Strategy Pattern and emits a valid ModelDiff", async () => {
    // 1. Arrange: Natural language prompt mandated by INT-CU03
    const prompt = "Crear patrón Strategy con Contexto y 2 estrategias";
    const adapter = new MockAIAdapter();
    const currentModel = createInitialModel();

    // 2. Act: Generate structured ModelDiff via Multi-Adapter AI
    const diff = await adapter.generateDiff(prompt, currentModel);

    // 3. Assert: Structural validation of ModelDiff against schema
    const validation = validateDiff(diff);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toBeUndefined();

    // Verify elements in diff
    expect(diff.add?.elements).toBeDefined();
    expect(diff.add?.elements).toHaveLength(4);

    const elementNames = diff.add?.elements?.map((e) => e.name);
    expect(elementNames).toContain("Context");
    expect(elementNames).toContain("Strategy");
    expect(elementNames).toContain("ConcreteStrategyA");
    expect(elementNames).toContain("ConcreteStrategyB");

    // Verify relationships in diff: 2 realizations + 1 aggregation
    expect(diff.add?.relationships).toBeDefined();
    expect(diff.add?.relationships).toHaveLength(3);

    const realizations = diff.add?.relationships?.filter(
      (r) => r.type === DiagramEdgeTypeRecord.ClassRealization,
    );
    expect(realizations).toHaveLength(2);

    const sources = realizations?.map((r) => r.source);
    expect(sources).toContain("ConcreteStrategyA");
    expect(sources).toContain("ConcreteStrategyB");
  });

  it("applies Strategy Pattern ModelDiff to UMLModel, producing 3 classes, 2 realizations and 100% schema compliance", async () => {
    // 1. Arrange: Adapter and base diagram
    const prompt = "Crear patrón Strategy con Contexto y 2 estrategias";
    const adapter = new MockAIAdapter();
    const initialModel = createInitialModel();

    // 2. Act: Generate and apply ModelDiff
    const diff = await adapter.generateDiff(prompt, initialModel);
    const updatedModel = applyDiff(initialModel, diff);

    // 3. Assert: 4 nodes created (3 concrete classes + 1 strategy interface)
    expect(updatedModel.nodes).toHaveLength(4);

    const contextNode = updatedModel.nodes.find(
      (n: UmlStudioNode) => n.data.name === "Context",
    );
    const strategyNode = updatedModel.nodes.find(
      (n: UmlStudioNode) => n.data.name === "Strategy",
    );
    const strategyANode = updatedModel.nodes.find(
      (n: UmlStudioNode) => n.data.name === "ConcreteStrategyA",
    );
    const strategyBNode = updatedModel.nodes.find(
      (n: UmlStudioNode) => n.data.name === "ConcreteStrategyB",
    );

    expect(contextNode).toBeDefined();
    expect(strategyNode).toBeDefined();
    expect(strategyANode).toBeDefined();
    expect(strategyBNode).toBeDefined();

    // Verify Strategy interface stereotype
    expect(strategyNode?.data.stereotype).toBe("<<interface>>");

    // Verify 3 concrete classes (Context, ConcreteStrategyA, ConcreteStrategyB)
    const concreteClasses = updatedModel.nodes.filter(
      (n: UmlStudioNode) => n.data.stereotype !== "<<interface>>",
    );
    expect(concreteClasses).toHaveLength(3);

    // 4. Assert: 2 realization relationships connecting concrete strategies to Strategy
    const realizationEdges = updatedModel.edges.filter(
      (e: UmlStudioEdge) => e.type === DiagramEdgeTypeRecord.ClassRealization,
    );
    expect(realizationEdges).toHaveLength(2);

    for (const edge of realizationEdges) {
      expect(edge.target).toBe(strategyNode?.id);
      expect([strategyANode?.id, strategyBNode?.id]).toContain(edge.source);
      // Orthogonal points must be populated
      expect(edge.data.points.length).toBeGreaterThanOrEqual(2);
    }

    // 5. Assert: Aggregation edge connecting Context to Strategy
    const aggregationEdge = updatedModel.edges.find(
      (e: UmlStudioEdge) => e.type === DiagramEdgeTypeRecord.ClassAggregation,
    );
    expect(aggregationEdge).toBeDefined();
    expect(aggregationEdge?.source).toBe(contextNode?.id);
    expect(aggregationEdge?.target).toBe(strategyNode?.id);

    // 6. Assert: Metamodel schema validation against packages/core/schema/uml-model-4.schema.json
    const isValid = validateModel(updatedModel);
    expect(isValid, JSON.stringify(validateModel.errors)).toBe(true);
    expect(validateModel.errors).toBeNull();
  });

  it("handles incremental AI modifications and element removals without breaking canvas state or schema", async () => {
    // 1. Arrange: Existing diagram with Strategy pattern
    const adapter = new MockAIAdapter();
    const baseModel = createInitialModel();
    const initialDiff = await adapter.generateDiff(
      "Crear patrón Strategy con Contexto y 2 estrategias",
      baseModel,
    );
    const modelWithStrategy = applyDiff(baseModel, initialDiff);

    const contextNode = modelWithStrategy.nodes.find(
      (n) => n.data.name === "Context",
    );
    expect(contextNode).toBeDefined();

    // 2. Act: AI instruction to modify Context and remove ConcreteStrategyB
    const strategyBNode = modelWithStrategy.nodes.find(
      (n) => n.data.name === "ConcreteStrategyB",
    );
    expect(strategyBNode).toBeDefined();

    const modificationDiff = {
      modify: {
        elements: [
          {
            id: contextNode!.id,
            changes: {
              name: "PaymentContext",
            },
          },
        ],
      },
      remove: {
        elementIds: [strategyBNode!.id],
      },
    };

    const nextModel = applyDiff(modelWithStrategy, modificationDiff);

    // 3. Assert: Context renamed to PaymentContext
    const paymentContext = nextModel.nodes.find(
      (n) => n.id === contextNode!.id,
    );
    expect(paymentContext?.data.name).toBe("PaymentContext");

    // 4. Assert: ConcreteStrategyB removed, along with its realization edge
    expect(
      nextModel.nodes.find((n) => n.id === strategyBNode!.id),
    ).toBeUndefined();
    expect(nextModel.nodes).toHaveLength(3);

    // Remaining realization edges should only be 1 (for ConcreteStrategyA)
    const remainingRealizations = nextModel.edges.filter(
      (e) => e.type === DiagramEdgeTypeRecord.ClassRealization,
    );
    expect(remainingRealizations).toHaveLength(1);

    // 5. Assert: Resulting model strictly conforms to JSON schema
    const isValid = validateModel(nextModel);
    expect(isValid, JSON.stringify(validateModel.errors)).toBe(true);
    expect(validateModel.errors).toBeNull();
  });
});
