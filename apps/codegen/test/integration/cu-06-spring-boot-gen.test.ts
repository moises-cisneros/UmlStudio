import { describe, it, expect } from "vitest"
import JSZip from "jszip"
import type { UMLModel } from "@umlstudio/core"
import { buildCodegenApp } from "../../src/server.js"

const MODEL_3_ENTITIES: UMLModel = {
  id: "model-cu06-test",
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

describe("INT-CU06: Spring Boot Code Generation & Initializr Pipeline", () => {
  const app = buildCodegenApp()

  it("POST /api/preview returns summary of 3 entities, 5 layers and file paths", async () => {
    const res = await app.request("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL_3_ENTITIES,
        options: {
          groupId: "com.tienda",
          artifactId: "ventas-service",
          serverPort: 9000,
        },
      }),
    })

    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.summary).toEqual({
      totalEntities: 3,
      totalRepositories: 3,
      totalServices: 3,
      totalDtos: 6, // 3 Request + 3 Response
      totalControllers: 3,
    })

    expect(data.files).toContain("src/main/resources/application.yml")
    expect(data.files).toContain("src/main/resources/schema.sql")
    expect(data.files).toContain("src/main/resources/data.sql")
    expect(data.files).toContain("src/main/java/com/tienda/ventasservice/entity/Cliente.java")
    expect(data.files).toContain("src/main/java/com/tienda/ventasservice/entity/Pedido.java")
    expect(data.files).toContain("src/main/java/com/tienda/ventasservice/entity/Item.java")
  })

  it("POST /api/generate produces a complete compilable Spring Boot ZIP with 5 layers and port 9000", async () => {
    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL_3_ENTITIES,
        options: {
          groupId: "com.tienda",
          artifactId: "ventas-service",
          packageName: "com.tienda.ventas",
          serverPort: 9000,
          dbName: "ventas_db",
          useFallbackOnly: true, // Offline deterministic path for CI / tests
        },
      }),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/zip")
    expect(res.headers.get("Content-Disposition")).toContain("ventas-service.zip")
    expect(res.headers.get("X-Generator-Mode")).toBe("fallback")

    const zipBytes = new Uint8Array(await res.arrayBuffer())
    const zip = await JSZip.loadAsync(zipBytes)

    // 1. Maven scaffolding
    expect(zip.file("pom.xml")).toBeDefined()
    expect(zip.file("mvnw")).toBeDefined()
    expect(zip.file("mvnw.cmd")).toBeDefined()
    expect(zip.file("src/main/java/com/tienda/ventas/Application.java")).toBeDefined()

    // 2. Application configuration & port 9000 (RF-27)
    const ymlContent = await zip.file("src/main/resources/application.yml")?.async("string")
    expect(ymlContent).toBeDefined()
    expect(ymlContent).toContain("port: 9000")
    expect(ymlContent).toContain("jdbc:postgresql://localhost:5433/ventas_db")
    expect(ymlContent).toContain("dialect: org.hibernate.dialect.PostgreSQLDialect")

    // 3. PostgreSQL SQL scripts (DDL / DML)
    const schemaSql = await zip.file("src/main/resources/schema.sql")?.async("string")
    expect(schemaSql).toBeDefined()
    expect(schemaSql).toContain("CREATE TABLE IF NOT EXISTS cliente")
    expect(schemaSql).toContain("CREATE TABLE IF NOT EXISTS pedido")
    expect(schemaSql).toContain("CREATE TABLE IF NOT EXISTS item")

    // 4. Layer 1: Entities (RF-28)
    const clienteEntity = await zip
      .file("src/main/java/com/tienda/ventas/entity/Cliente.java")
      ?.async("string")
    expect(clienteEntity).toBeDefined()
    expect(clienteEntity).toContain("@Entity")
    expect(clienteEntity).toContain('@Table(name = "cliente")')
    expect(clienteEntity).toContain("@Id")
    expect(clienteEntity).toContain("private String nombre;")
    expect(clienteEntity).toContain("private String email;")
    expect(clienteEntity).toContain("List<Pedido> pedidos")

    const pedidoEntity = await zip
      .file("src/main/java/com/tienda/ventas/entity/Pedido.java")
      ?.async("string")
    expect(pedidoEntity).toBeDefined()
    expect(pedidoEntity).toContain("@Entity")
    expect(pedidoEntity).toContain("private BigDecimal total;")
    expect(pedidoEntity).toContain("List<Item> items")

    // 5. Layer 2: Repositories (RF-24)
    const clienteRepo = await zip
      .file("src/main/java/com/tienda/ventas/repository/ClienteRepository.java")
      ?.async("string")
    expect(clienteRepo).toBeDefined()
    expect(clienteRepo).toContain(
      "public interface ClienteRepository extends JpaRepository<Cliente, Long>"
    )

    // 6. Layer 3: Services & Impls (RF-25)
    const clienteService = await zip
      .file("src/main/java/com/tienda/ventas/service/ClienteService.java")
      ?.async("string")
    expect(clienteService).toBeDefined()
    expect(clienteService).toContain("public interface ClienteService")

    const clienteServiceImpl = await zip
      .file("src/main/java/com/tienda/ventas/service/impl/ClienteServiceImpl.java")
      ?.async("string")
    expect(clienteServiceImpl).toBeDefined()
    expect(clienteServiceImpl).toContain("@Service")
    expect(clienteServiceImpl).toContain("implements ClienteService")

    // 7. Layer 4: DTOs (RF-23)
    const clienteRequest = await zip
      .file("src/main/java/com/tienda/ventas/dto/request/ClienteRequest.java")
      ?.async("string")
    expect(clienteRequest).toBeDefined()
    expect(clienteRequest).toContain("public class ClienteRequest")

    const clienteResponse = await zip
      .file("src/main/java/com/tienda/ventas/dto/response/ClienteResponse.java")
      ?.async("string")
    expect(clienteResponse).toBeDefined()
    expect(clienteResponse).toContain("public class ClienteResponse")

    // 8. Layer 5: Controllers (RF-26)
    const clienteController = await zip
      .file("src/main/java/com/tienda/ventas/controller/ClienteController.java")
      ?.async("string")
    expect(clienteController).toBeDefined()
    expect(clienteController).toContain("@RestController")
    expect(clienteController).toContain('@RequestMapping("/api/clientes")')
    expect(clienteController).toContain("@GetMapping")
    expect(clienteController).toContain("@PostMapping")
    expect(clienteController).toContain("@PutMapping")
    expect(clienteController).toContain("@DeleteMapping")
  })

  it("returns 422 if model contains no class nodes", async () => {
    const emptyModel: UMLModel = {
      id: "empty",
      title: "Vacio",
      version: "4.0.0",
      type: "ClassDiagram" as UMLModel["type"],
      assessments: {},
      nodes: [],
      edges: [],
    }

    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: emptyModel }),
    })

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toContain("no class nodes")
  })
})
