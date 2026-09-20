import {
  DiagramNodeTypeRecord,
  DiagramEdgeTypeRecord,
} from "../../modelElementTypes";
import type { UMLModel } from "../../typings";
import type { AIAdapter, ModelDiff } from "../types";

/**
 * Deterministic Mock AI Adapter for offline testing and CI execution.
 * Capable of interpreting GoF pattern prompts (Strategy, Observer, Factory)
 * and producing structured, spec-compliant ModelDiff JSON payloads.
 */
export class MockAIAdapter implements AIAdapter {
  readonly providerName = "mock-local";

  async generateDiff(
    prompt: string,
    _currentModel: UMLModel,
  ): Promise<ModelDiff> {
    const normalizedPrompt = prompt.toLowerCase();

    // Strategy Pattern (INT-CU03 requirement)
    if (
      normalizedPrompt.includes("strategy") ||
      normalizedPrompt.includes("estrategia")
    ) {
      return {
        add: {
          elements: [
            {
              name: "Context",
              type: DiagramNodeTypeRecord.class,
              position: { x: 80, y: 140 },
              width: 240,
              height: 140,
              attributes: [{ name: "- strategy: Strategy" }],
              methods: [
                { name: "+ setStrategy(s: Strategy): void" },
                { name: "+ executeStrategy(): void" },
              ],
            },
            {
              name: "Strategy",
              type: DiagramNodeTypeRecord.class,
              stereotype: "<<interface>>",
              position: { x: 440, y: 140 },
              width: 220,
              height: 120,
              methods: [{ name: "+ execute(): void" }],
            },
            {
              name: "ConcreteStrategyA",
              type: DiagramNodeTypeRecord.class,
              position: { x: 380, y: 360 },
              width: 220,
              height: 120,
              methods: [{ name: "+ execute(): void" }],
            },
            {
              name: "ConcreteStrategyB",
              type: DiagramNodeTypeRecord.class,
              position: { x: 660, y: 360 },
              width: 220,
              height: 120,
              methods: [{ name: "+ execute(): void" }],
            },
          ],
          relationships: [
            {
              type: DiagramEdgeTypeRecord.ClassRealization,
              source: "ConcreteStrategyA",
              target: "Strategy",
            },
            {
              type: DiagramEdgeTypeRecord.ClassRealization,
              source: "ConcreteStrategyB",
              target: "Strategy",
            },
            {
              type: DiagramEdgeTypeRecord.ClassAggregation,
              source: "Context",
              target: "Strategy",
            },
          ],
        },
      };
    }

    // Observer Pattern
    if (
      normalizedPrompt.includes("observer") ||
      normalizedPrompt.includes("observador")
    ) {
      return {
        add: {
          elements: [
            {
              name: "Subject",
              type: DiagramNodeTypeRecord.class,
              position: { x: 100, y: 140 },
              attributes: [{ name: "- observers: List<Observer>" }],
              methods: [
                { name: "+ attach(o: Observer): void" },
                { name: "+ detach(o: Observer): void" },
                { name: "+ notify(): void" },
              ],
            },
            {
              name: "Observer",
              type: DiagramNodeTypeRecord.class,
              stereotype: "<<interface>>",
              position: { x: 450, y: 140 },
              methods: [{ name: "+ update(): void" }],
            },
            {
              name: "ConcreteObserver",
              type: DiagramNodeTypeRecord.class,
              position: { x: 450, y: 360 },
              methods: [{ name: "+ update(): void" }],
            },
          ],
          relationships: [
            {
              type: DiagramEdgeTypeRecord.ClassRealization,
              source: "ConcreteObserver",
              target: "Observer",
            },
            {
              type: DiagramEdgeTypeRecord.ClassAggregation,
              source: "Subject",
              target: "Observer",
            },
          ],
        },
      };
    }

    // Default fallback: empty diff
    return {
      add: {
        elements: [],
        relationships: [],
      },
    };
  }
}
