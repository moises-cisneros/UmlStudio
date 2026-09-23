import { describe, it, expect } from "vitest"
import * as Y from "yjs"
import { createDiagramStore } from "../../lib/store/diagramStore"
import { applyDiff } from "../../lib/ai/diffEngine"
import { normalizeModel } from "../../lib/utils/versionConverter"
import { exportToXmi } from "../../lib/export/xmiExport"
import { getSVG } from "../../lib/utils/exportUtils"
import { UMLDiagramType } from "../../lib/types/DiagramType"
import type { UMLModel, UmlStudioNode, UmlStudioEdge } from "../../lib/typings"

function makeNode(
  partial: Partial<UmlStudioNode> & { id: string; data: UmlStudioNode["data"] }
): UmlStudioNode {
  return {
    type: "class",
    position: { x: 0, y: 0 },
    width: 150,
    height: 100,
    measured: { width: 150, height: 100 },
    ...partial,
  } as UmlStudioNode
}

function makeEdge(
  partial: Partial<UmlStudioEdge> & {
    id: string
    source: string
    target: string
    data: UmlStudioEdge["data"]
  }
): UmlStudioEdge {
  return {
    type: "ClassBidirectional",
    sourceHandle: null,
    targetHandle: null,
    ...partial,
  } as UmlStudioEdge
}

describe("Association Class Cascade Deletion and Export", () => {
  describe("Diagram Store Cascade Deletion", () => {
    it("cascades deletion of the main association edge when intermediate node is removed", () => {
      const ydoc = new Y.Doc()
      const store = createDiagramStore(ydoc)

      const nodeSource = makeNode({ id: "node-source", data: { name: "Pato" } })
      const nodeTarget = makeNode({
        id: "node-target",
        position: { x: 300, y: 0 },
        data: { name: "Hoja" },
      })
      const nodeAssoc = makeNode({
        id: "node-assoc",
        position: { x: 150, y: 150 },
        data: {
          name: "Pato_Hoja_Assoc",
          isAssociationClass: true,
          associationEdgeId: "edge-main",
        },
      })
      const edgeMain = makeEdge({
        id: "edge-main",
        source: "node-source",
        target: "node-target",
        data: {
          associationClassNodeId: "node-assoc",
          points: [],
        },
      })

      store.getState().setNodesAndEdges([nodeSource, nodeTarget, nodeAssoc], [edgeMain])

      expect(store.getState().nodes).toHaveLength(3)
      expect(store.getState().edges).toHaveLength(1)

      // Simulate React Flow onNodesChange removing the intermediate class node
      store.getState().onNodesChange([{ type: "remove", id: "node-assoc" }])

      // Main edge should be cascaded and deleted!
      expect(store.getState().nodes.find((n) => n.id === "node-assoc")).toBeUndefined()
      expect(store.getState().edges.find((e) => e.id === "edge-main")).toBeUndefined()
      expect(store.getState().edges).toHaveLength(0)
    })

    it("cascades deletion of the intermediate class node when the main edge is removed", () => {
      const ydoc = new Y.Doc()
      const store = createDiagramStore(ydoc)

      const nodeSource = makeNode({ id: "node-source", data: { name: "Pato" } })
      const nodeTarget = makeNode({
        id: "node-target",
        position: { x: 300, y: 0 },
        data: { name: "Hoja" },
      })
      const nodeAssoc = makeNode({
        id: "node-assoc",
        position: { x: 150, y: 150 },
        data: {
          name: "Pato_Hoja_Assoc",
          isAssociationClass: true,
          associationEdgeId: "edge-main",
        },
      })
      const edgeMain = makeEdge({
        id: "edge-main",
        source: "node-source",
        target: "node-target",
        data: {
          associationClassNodeId: "node-assoc",
          points: [],
        },
      })

      store.getState().setNodesAndEdges([nodeSource, nodeTarget, nodeAssoc], [edgeMain])

      // Simulate React Flow onEdgesChange removing the edge
      store.getState().onEdgesChange([{ type: "remove", id: "edge-main" }])

      // Intermediate node should be cascaded and deleted!
      expect(store.getState().edges).toHaveLength(0)
      expect(store.getState().nodes.find((n) => n.id === "node-assoc")).toBeUndefined()
      expect(store.getState().nodes).toHaveLength(2)
    })
  })

  describe("AI Diff Engine Cascade Deletion", () => {
    it("deletes association edge when intermediate class element is removed in diff", () => {
      const initialModel: UMLModel = {
        version: "4.0.0",
        id: "model-test-1",
        title: "TestModel",
        type: UMLDiagramType.ClassDiagram,
        nodes: [
          makeNode({ id: "n1", position: { x: 0, y: 0 }, data: { name: "Pato" } }),
          makeNode({ id: "n2", position: { x: 200, y: 0 }, data: { name: "Hoja" } }),
          makeNode({
            id: "n-assoc",
            position: { x: 100, y: 100 },
            data: { name: "Pato_Hoja_Assoc", isAssociationClass: true, associationEdgeId: "e1" },
          }),
        ],
        edges: [
          makeEdge({
            id: "e1",
            source: "n1",
            target: "n2",
            data: { associationClassNodeId: "n-assoc", points: [] },
          }),
        ],
        assessments: {},
      }

      const updated = applyDiff(initialModel, {
        remove: {
          elementIds: ["Pato_Hoja_Assoc"],
        },
      })

      expect(updated.nodes.find((n) => n.id === "n-assoc")).toBeUndefined()
      expect(updated.edges.find((e) => e.id === "e1")).toBeUndefined()
      expect(updated.edges).toHaveLength(0)
    })

    it("deletes intermediate class node when association relationship is removed in diff", () => {
      const initialModel: UMLModel = {
        version: "4.0.0",
        id: "model-test-2",
        title: "TestModel",
        type: UMLDiagramType.ClassDiagram,
        nodes: [
          makeNode({ id: "n1", position: { x: 0, y: 0 }, data: { name: "Pato" } }),
          makeNode({ id: "n2", position: { x: 200, y: 0 }, data: { name: "Hoja" } }),
          makeNode({
            id: "n-assoc",
            position: { x: 100, y: 100 },
            data: { name: "Pato_Hoja_Assoc", isAssociationClass: true, associationEdgeId: "e1" },
          }),
        ],
        edges: [
          makeEdge({
            id: "e1",
            source: "n1",
            target: "n2",
            data: { associationClassNodeId: "n-assoc", points: [] },
          }),
        ],
        assessments: {},
      }

      const updated = applyDiff(initialModel, {
        remove: {
          relationshipIds: ["e1"],
        },
      })

      expect(updated.edges).toHaveLength(0)
      expect(updated.nodes.find((n) => n.id === "n-assoc")).toBeUndefined()
      expect(updated.nodes).toHaveLength(2)
    })
  })

  describe("Model Normalization", () => {
    it("normalizes association classes bidirectionally with points array", () => {
      const rawModel: UMLModel = {
        version: "4.0.0",
        id: "model-test-3",
        title: "TestModel",
        type: UMLDiagramType.ClassDiagram,
        nodes: [
          makeNode({ id: "n1", position: { x: 0, y: 0 }, data: { name: "A" } }),
          makeNode({ id: "n2", position: { x: 200, y: 0 }, data: { name: "B" } }),
          makeNode({
            id: "n-assoc",
            position: { x: 100, y: 100 },
            data: { name: "AssocAB" },
          }),
        ],
        edges: [
          makeEdge({
            id: "e-assoc",
            source: "n1",
            target: "n2",
            data: { associationClassNodeId: "n-assoc", points: [] },
          }),
        ],
        assessments: {},
      }

      const normalized = normalizeModel(rawModel)
      const assocNode = normalized.nodes.find((n) => n.id === "n-assoc")
      const assocEdge = normalized.edges.find((e) => e.id === "e-assoc")

      expect(assocNode?.data?.isAssociationClass).toBe(true)
      expect(assocNode?.data?.associationEdgeId).toBe("e-assoc")
      expect(assocEdge?.data?.associationClassNodeId).toBe("n-assoc")
      expect(Array.isArray(assocEdge?.data?.points)).toBe(true)
    })
  })

  describe("XMI Export with AssociationClass", () => {
    it("serializes uml:AssociationClass with role names and multiplicities on ownedEnd", async () => {
      const model: UMLModel = {
        version: "4.0.0",
        id: "model-test-4",
        title: "TestModel",
        type: UMLDiagramType.ClassDiagram,
        nodes: [
          makeNode({
            id: "node-student",
            position: { x: 0, y: 0 },
            data: { name: "Estudiante" },
          }),
          makeNode({
            id: "node-course",
            position: { x: 300, y: 0 },
            data: { name: "Curso" },
          }),
          makeNode({
            id: "assoc-node-1",
            position: { x: 150, y: 150 },
            data: {
              name: "Inscripcion",
              isAssociationClass: true,
              associationEdgeId: "edge-1",
              attributes: [],
              methods: [],
            },
          }),
        ],
        edges: [
          makeEdge({
            id: "edge-1",
            source: "node-student",
            target: "node-course",
            data: {
              associationClassNodeId: "assoc-node-1",
              roleA: "estudiante",
              roleB: "curso",
              multiplicityA: "1..*",
              multiplicityB: "1",
              points: [],
            },
          }),
        ],
        assessments: {},
      }

      const result = await exportToXmi(model, {
        xmiVersion: "2.1",
        targetDialect: "EnterpriseArchitect",
      })

      expect(result.xmiContent).toContain('xmi:type="uml:AssociationClass"')
      expect(result.xmiContent).toContain('name="Inscripcion"')
      expect(result.xmiContent).toContain('name="estudiante"')
      expect(result.xmiContent).toContain('name="curso"')
      expect(result.xmiContent).toContain('lowerValue xmi:type="uml:LiteralInteger"')
      expect(result.xmiContent).toContain('upperValue xmi:type="uml:LiteralUnlimitedNatural"')
      expect(result.xmiContent).toContain('value="-1"')
    })
  })

  describe("SVG / PNG Export of Association Connector", () => {
    it("extracts dashed association class connector lines in getSVG", () => {
      const container = document.createElement("div")
      const vp = document.createElement("div")
      vp.className = "react-flow__viewport"
      container.appendChild(vp)

      const edgeContainer = document.createElement("div")
      edgeContainer.className = "react-flow__edge"
      vp.appendChild(edgeContainer)

      // Mock an edge SVG
      const edgeSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
      const edgePath = document.createElementNS("http://www.w3.org/2000/svg", "path")
      edgePath.setAttribute("class", "react-flow__edge-path")
      edgePath.setAttribute("d", "M 0 0 L 100 100")
      edgeSvg.appendChild(edgePath)
      edgeContainer.appendChild(edgeSvg)

      // Mock an association connector line
      const connectorSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line")
      line.setAttribute("data-testid", "association-class-connector")
      line.setAttribute("x1", "50")
      line.setAttribute("y1", "50")
      line.setAttribute("x2", "50")
      line.setAttribute("y2", "150")
      connectorSvg.appendChild(line)
      edgeContainer.appendChild(connectorSvg)

      const clip = { x: 0, y: 0, width: 200, height: 200 }
      const svg = getSVG(container, clip)

      expect(svg).toBeDefined()
      expect(svg).toContain('data-testid="association-class-connector"')
      expect(svg).toContain('stroke-dasharray="6 4"')
    })
  })
})
