import { DiagramNodeTypeRecord, DiagramEdgeTypeRecord } from "../../modelElementTypes"
import type { UMLModel } from "../../typings"
import type { AIAdapter, DiffRelationshipModify, ModelDiff } from "../types"
import { findTargetNode } from "../diffEngine"

const MOCK_REL_TYPE_KEYWORDS: Array<{
  type: (typeof DiagramEdgeTypeRecord)[keyof typeof DiagramEdgeTypeRecord]
  keywords: string[]
}> = [
  {
    type: DiagramEdgeTypeRecord.ClassInheritance,
    keywords: ["herencia", "hereda", "generaliz", "extends"],
  },
  { type: DiagramEdgeTypeRecord.ClassRealization, keywords: ["realiz", "implementa", "interfaz"] },
  { type: DiagramEdgeTypeRecord.ClassAggregation, keywords: ["agregaci"] },
  { type: DiagramEdgeTypeRecord.ClassComposition, keywords: ["composici"] },
  {
    type: DiagramEdgeTypeRecord.ClassDependency,
    keywords: ["dependencia", "depende", "usa", "utiliza"],
  },
  { type: DiagramEdgeTypeRecord.ClassUnidirectional, keywords: ["unidireccional"] },
  {
    type: DiagramEdgeTypeRecord.ClassBidirectional,
    keywords: ["asociaci", "bidireccional", "relaci"],
  },
]

function extractTwoClasses(prompt: string, model: UMLModel): [string, string] | null {
  const candidates = (model.nodes ?? [])
    .map((n) => (typeof n.data?.name === "string" ? n.data.name : ""))
    .filter((name) => name && prompt.toLowerCase().includes(name.toLowerCase()))
  const unique = [...new Set(candidates)]
  if (unique.length < 2) return null
  const lower = prompt.toLowerCase()
  const firstIndex = (name: string) => lower.indexOf(name.toLowerCase())
  const sorted = [...unique].sort((a, b) => firstIndex(a) - firstIndex(b))
  return [sorted[0], sorted[1]]
}

function extractMultiplicity(prompt: string): string | null {
  const match = prompt.match(/(\d+\s*\.\.\s*\*|\d+\s*\.\.\s*\d+|\*|(?<![\d.])\d+(?![\d.]))/)
  if (!match) return null
  return match[1].replace(/\s+/g, "")
}

function nodeDisplayName(
  node: { data?: { name?: unknown } } | undefined,
  fallback: string
): string {
  const name = node?.data?.name
  return typeof name === "string" && name.trim() ? name : fallback
}

/**
 * Deterministic Mock AI Adapter for offline testing and CI execution.
 * Capable of interpreting GoF pattern prompts (Strategy, Observer, Factory)
 * and producing structured, spec-compliant ModelDiff JSON payloads.
 */
export class MockAIAdapter implements AIAdapter {
  readonly providerName = "mock-local"

  async generateDiff(prompt: string, currentModel: UMLModel): Promise<ModelDiff> {
    const normalizedPrompt = prompt.toLowerCase()

    const wantsRelationEdit =
      normalizedPrompt.includes("multiplicidad") ||
      normalizedPrompt.includes("rol") ||
      normalizedPrompt.includes("relaci")
    if (wantsRelationEdit) {
      const pair = extractTwoClasses(prompt, currentModel)
      if (pair) {
        const [source, target] = pair
        const changes: DiffRelationshipModify["changes"] = {}
        const mult = extractMultiplicity(prompt)
        if (normalizedPrompt.includes("multiplicidad") && mult) {
          changes.targetMultiplicity = mult
        }
        const quotedRole = prompt.match(/rol\s+["“]([^"”]+)["”]/iu)
        const bareRole = quotedRole ? null : prompt.match(/rol\s+([\p{L}\d_]+)/iu)
        const roleName = (quotedRole?.[1] ?? bareRole?.[1] ?? "").trim()
        if (roleName) {
          changes.targetRole = roleName
        }
        for (const entry of MOCK_REL_TYPE_KEYWORDS) {
          if (
            entry.keywords.some((k) => normalizedPrompt.includes(k)) &&
            /(cambia|convierte|pasa|modifica|ahora|tipo)/.test(normalizedPrompt)
          ) {
            changes.type = entry.type
            break
          }
        }
        if (Object.keys(changes).length > 0) {
          const sourceNode = findTargetNode(currentModel.nodes ?? [], source)
          const targetNode = findTargetNode(currentModel.nodes ?? [], target)
          return {
            modify: {
              relationships: [
                {
                  source: nodeDisplayName(sourceNode, source),
                  target: nodeDisplayName(targetNode, target),
                  changes,
                },
              ],
            },
          }
        }
      }
    }

    // Strategy Pattern (INT-CU03 requirement)
    if (normalizedPrompt.includes("strategy") || normalizedPrompt.includes("estrategia")) {
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
      }
    }

    // Observer Pattern
    if (normalizedPrompt.includes("observer") || normalizedPrompt.includes("observador")) {
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
      }
    }

    // Default fallback: empty diff
    return {
      add: {
        elements: [],
        relationships: [],
      },
    }
  }
}
