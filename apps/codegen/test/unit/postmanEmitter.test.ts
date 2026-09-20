import { describe, it, expect } from "vitest"
import type { UMLModel } from "@umlstudio/core"
import { generateOpenApiSpec, generatePostmanCollection } from "../../src/openapi/index.js"

const MODEL_POSTMAN: UMLModel = {
  id: "model-postman-test",
  title: "OrderService",
  version: "4.0.0",
  type: "ClassDiagram" as UMLModel["type"],
  assessments: {},
  nodes: [
    {
      id: "node-order",
      type: "class",
      width: 200,
      height: 150,
      measured: { width: 200, height: 150 },
      data: {
        name: "Order",
        attributes: [
          { id: "o1", name: "+ id: Long" },
          { id: "o2", name: "+ total: Double" },
        ],
        methods: [],
      },
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
}

describe("Postman Collection v2.1 Emitter Unit Tests", () => {
  it("converts OpenAPI spec to Postman collection v2.1.0", () => {
    const spec = generateOpenApiSpec(MODEL_POSTMAN, {
      title: "OrderService",
      serverPort: 9000,
    })
    const collection = generatePostmanCollection(spec)

    expect(collection.info.schema).toBe(
      "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    )
    expect(collection.info.name).toContain("OrderService")
    expect(collection.variable).toEqual([
      {
        key: "baseUrl",
        value: "http://localhost:9000",
        type: "string",
      },
    ])

    // Check folder for Order
    const orderFolder = collection.item.find((i) => i.name === "Order")
    expect(orderFolder).toBeDefined()
    expect(orderFolder?.item).toBeDefined()

    // 5 CRUD operations
    const opNames = orderFolder!.item!.map((it) => it.name)
    expect(opNames).toContain("List all Orders")
    expect(opNames).toContain("Create a new Order")
    expect(opNames).toContain("Get Order by ID")
    expect(opNames).toContain("Update Order by ID")
    expect(opNames).toContain("Delete Order by ID")

    // Check POST item request body
    const createReq = orderFolder!.item!.find((it) => it.name === "Create a new Order")
    expect(createReq?.request?.body?.mode).toBe("raw")
    expect(createReq?.request?.body?.raw).toContain("total")
    expect(createReq?.request?.header.some((h) => h.key === "Content-Type")).toBe(true)
  })
})
