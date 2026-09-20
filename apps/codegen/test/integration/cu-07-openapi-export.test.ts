import { describe, it, expect } from "vitest"
import type { UMLModel } from "@umlstudio/core"
import { buildCodegenApp } from "../../src/server.js"
import { validateOpenApiSpec } from "../../src/openapi/index.js"

const MODEL_VENTAS_CU07: UMLModel = {
  id: "model-cu07-ventas",
  title: "VentasApp",
  version: "4.0.0",
  type: "ClassDiagram" as UMLModel["type"],
  assessments: {},
  nodes: [
    {
      id: "node-cliente",
      type: "class",
      width: 200,
      height: 150,
      measured: { width: 200, height: 150 },
      data: {
        name: "Cliente",
        attributes: [
          { id: "c-1", name: "+ id: Long" },
          { id: "c-2", name: "+ nombre: String" },
          { id: "c-3", name: "+ email: String" },
        ],
        methods: [{ id: "c-m1", name: "+ registrar(): void" }],
      },
      position: { x: 100, y: 100 },
    },
    {
      id: "node-pedido",
      type: "class",
      width: 200,
      height: 150,
      measured: { width: 200, height: 150 },
      data: {
        name: "Pedido",
        attributes: [
          { id: "p-1", name: "+ id: Long" },
          { id: "p-2", name: "+ codigo: String" },
          { id: "p-3", name: "+ total: Double" },
        ],
        methods: [{ id: "p-m1", name: "+ calcularTotal(): Double" }],
      },
      position: { x: 400, y: 100 },
    },
    {
      id: "node-item",
      type: "class",
      width: 200,
      height: 150,
      measured: { width: 200, height: 150 },
      data: {
        name: "Item",
        attributes: [
          { id: "i-1", name: "+ id: Long" },
          { id: "i-2", name: "+ cantidad: Integer" },
          { id: "i-3", name: "+ precioUnitario: Double" },
        ],
        methods: [],
      },
      position: { x: 700, y: 100 },
    },
  ],
  edges: [
    {
      id: "edge-cliente-pedido",
      type: "ClassComposition",
      source: "node-cliente",
      target: "node-pedido",
      sourceHandle: "right",
      targetHandle: "left",
      data: {
        sourceMultiplicity: "1",
        targetMultiplicity: "0..*",
        label: "pedidos",
        points: [],
      },
    },
    {
      id: "edge-pedido-item",
      type: "ClassComposition",
      source: "node-pedido",
      target: "node-item",
      sourceHandle: "right",
      targetHandle: "left",
      data: {
        sourceMultiplicity: "1",
        targetMultiplicity: "0..*",
        label: "items",
        points: [],
      },
    },
  ],
}

describe("INT-CU07: OpenAPI 3.0 Contract Generation and Swagger Documentation", () => {
  const app = buildCodegenApp()

  it("POST /api/openapi/json returns valid OpenAPI 3.0 spec with 100% CRUD paths", async () => {
    const res = await app.request("/api/openapi/json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL_VENTAS_CU07,
        options: {
          serverPort: 9000,
        },
      }),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toContain("application/json")

    const spec = await res.json()

    // 1. OpenAPI 3.0 structure
    expect(spec.openapi).toBe("3.0.3")
    expect(spec.info.title).toBe("VentasApp")
    expect(spec.servers[0]?.url).toBe("http://localhost:9000")

    // 2. Structural validation
    const validation = validateOpenApiSpec(spec)
    expect(validation.valid).toBe(true)
    expect(validation.errors).toHaveLength(0)

    // 3. 100% CRUD paths for all 3 entities
    const entities = ["clientes", "pedidos", "items"]
    for (const route of entities) {
      const collectionPath = `/api/${route}`
      const itemPath = `/api/${route}/{id}`

      expect(spec.paths[collectionPath]).toBeDefined()
      expect(spec.paths[collectionPath].get).toBeDefined()
      expect(spec.paths[collectionPath].post).toBeDefined()

      expect(spec.paths[itemPath]).toBeDefined()
      expect(spec.paths[itemPath].get).toBeDefined()
      expect(spec.paths[itemPath].put).toBeDefined()
      expect(spec.paths[itemPath].delete).toBeDefined()

      // Check parameter on item operations
      const getParams = spec.paths[itemPath].get.parameters
      expect(getParams).toHaveLength(1)
      expect(getParams[0].name).toBe("id")
      expect(getParams[0].in).toBe("path")
      expect(getParams[0].required).toBe(true)
      expect(getParams[0].schema.type).toBe("integer")
    }

    // 4. Components schemas (Request, Response, ApiError)
    const schemas = spec.components.schemas
    expect(schemas).toBeDefined()
    expect(schemas.ClienteRequest).toBeDefined()
    expect(schemas.ClienteResponse).toBeDefined()
    expect(schemas.PedidoRequest).toBeDefined()
    expect(schemas.PedidoResponse).toBeDefined()
    expect(schemas.ItemRequest).toBeDefined()
    expect(schemas.ItemResponse).toBeDefined()
    expect(schemas.ApiError).toBeDefined()
  })

  it("POST /api/openapi/yaml returns formatted YAML document", async () => {
    const res = await app.request("/api/openapi/yaml", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL_VENTAS_CU07,
        options: {
          serverPort: 9000,
        },
      }),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toContain("text/yaml")

    const yaml = await res.text()
    expect(yaml).toContain('openapi: "3.0.3"')
    expect(yaml).toContain("title: VentasApp")
    expect(yaml).toContain('"/api/clientes":')
    expect(yaml).toContain('"/api/pedidos":')
    expect(yaml).toContain('"/api/items":')
  })

  it("POST /api/openapi/postman returns valid Postman v2.1 collection (RF-31)", async () => {
    const res = await app.request("/api/openapi/postman", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL_VENTAS_CU07,
        options: {
          serverPort: 9000,
        },
      }),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toContain("application/json")

    const collection = await res.json()
    expect(collection.info.schema).toBe(
      "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    )
    expect(collection.item).toHaveLength(3) // Cliente, Pedido, Item folders

    const folderNames = collection.item.map((f: { name: string }) => f.name)
    expect(folderNames).toContain("Cliente")
    expect(folderNames).toContain("Pedido")
    expect(folderNames).toContain("Item")
  })
})
