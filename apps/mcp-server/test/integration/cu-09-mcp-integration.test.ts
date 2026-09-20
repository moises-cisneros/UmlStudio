import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { spawn, type ChildProcess } from "node:child_process"
import { resolve } from "node:path"
import readline from "node:readline"

interface JsonRpcResponse {
  jsonrpc: string
  id: number | string | null
  result?: Record<string, unknown>
  error?: { code: number; message: string }
}

describe("INT-CU09: Integración Agéntica con Protocolo MCP (FastMCP Python)", () => {
  let serverProcess: ChildProcess
  let rl: readline.Interface
  let msgId = 1
  const pendingRequests = new Map<string | number, (res: JsonRpcResponse) => void>()

  const sendRequest = (
    method: string,
    params?: Record<string, unknown>
  ): Promise<JsonRpcResponse> => {
    const id = msgId++
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params: params ?? {},
    })

    return new Promise((resolvePromise, reject) => {
      pendingRequests.set(id, resolvePromise)
      serverProcess.stdin?.write(payload + "\n", (err) => {
        if (err) reject(err)
      })
    })
  }

  const sendNotification = (method: string, params?: Record<string, unknown>): void => {
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      method,
      params: params ?? {},
    })
    serverProcess.stdin?.write(payload + "\n")
  }

  beforeAll(async () => {
    const serverPath = resolve(__dirname, "../../src/server.py")
    serverProcess = spawn("python", [serverPath, "--transport", "stdio"], {
      stdio: ["pipe", "pipe", "inherit"],
    })

    rl = readline.createInterface({
      input: serverProcess.stdout!,
      crlfDelay: Infinity,
    })

    rl.on("line", (line) => {
      const trimmed = line.trim()
      if (!trimmed) return
      try {
        const parsed = JSON.parse(trimmed) as JsonRpcResponse
        if (parsed.id !== undefined && parsed.id !== null) {
          const handler = pendingRequests.get(parsed.id)
          if (handler) {
            pendingRequests.delete(parsed.id)
            handler(parsed)
          }
        }
      } catch {
        // ignore unparseable output
      }
    })

    // Let the process spin up
    await new Promise((r) => setTimeout(r, 200))
  })

  afterAll(() => {
    rl.close()
    serverProcess.kill()
  })

  it("RF-37: debe completar exitosamente el handshake initialize y ping con protocolo 2024-11-05", async () => {
    const initRes = await sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    })

    expect(initRes.error).toBeUndefined()
    expect(initRes.result?.protocolVersion).toBe("2024-11-05")
    expect(initRes.result?.serverInfo).toEqual({
      name: "umlstudio-mcp-server",
      version: "1.0.0",
    })

    sendNotification("notifications/initialized")

    const pingRes = await sendRequest("ping")
    expect(pingRes.error).toBeUndefined()
  })

  it("RF-38: debe listar todas las herramientas OMG UML 2.5 disponibles", async () => {
    const toolsRes = await sendRequest("tools/list")
    expect(toolsRes.error).toBeUndefined()

    const tools = toolsRes.result?.tools as Array<{ name: string }>
    expect(Array.isArray(tools)).toBe(true)

    const toolNames = tools.map((t) => t.name)
    expect(toolNames).toContain("read_diagram")
    expect(toolNames).toContain("list_elements")
    expect(toolNames).toContain("add_class")
    expect(toolNames).toContain("add_relationship")
    expect(toolNames).toContain("modify_element")
    expect(toolNames).toContain("delete_element")
    expect(toolNames).toContain("apply_model_diff")
    expect(toolNames).toContain("get_metrics")
  })

  it("RF-38: debe invocar read_diagram obteniendo un modelo UML válido", async () => {
    const res = await sendRequest("tools/call", {
      name: "read_diagram",
      arguments: { diagram_id: "current" },
    })

    expect(res.error).toBeUndefined()
    const content = res.result?.content as Array<{ text: string }>
    expect(content).toBeDefined()

    const diagram = JSON.parse(content[0].text)
    expect(diagram.version).toBe("4.0.0")
    expect(diagram.type).toBe("ClassDiagram")
    expect(Array.isArray(diagram.nodes)).toBe(true)
  })

  it("RF-38: debe invocar add_class y add_relationship mutando el diagrama bajo reglas UML 2.5", async () => {
    // 1. Crear clase Order
    const addOrderRes = await sendRequest("tools/call", {
      name: "add_class",
      arguments: {
        name: "Order",
        stereotype: "entity",
        attributes: ["+ id: UUID", "+ total: double"],
        methods: ["+ calculateTotal(): double"],
      },
    })
    expect(addOrderRes.result?.isError).toBe(false)
    const orderData = JSON.parse((addOrderRes.result?.content as Array<{ text: string }>)[0].text)
    expect(orderData.status).toBe("created")
    expect(orderData.name).toBe("Order")

    // 2. Crear clase Customer
    const addCustomerRes = await sendRequest("tools/call", {
      name: "add_class",
      arguments: {
        name: "Customer",
        attributes: ["+ name: String", "+ email: String"],
        methods: ["+ getDiscount(): double"],
      },
    })
    expect(addCustomerRes.result?.isError).toBe(false)

    // 3. Conectar Order y Customer con relación Association
    const addRelRes = await sendRequest("tools/call", {
      name: "add_relationship",
      arguments: {
        source: "Order",
        target: "Customer",
        rel_type: "Association",
        source_mult: "0..*",
        target_mult: "1",
      },
    })
    expect(addRelRes.result?.isError).toBe(false)
    const relData = JSON.parse((addRelRes.result?.content as Array<{ text: string }>)[0].text)
    expect(relData.status).toBe("connected")
    expect(relData.type).toBe("Association")

    // 4. Intentar relación inválida (fuera del metamodelo UML 2.5)
    const invalidRelRes = await sendRequest("tools/call", {
      name: "add_relationship",
      arguments: {
        source: "Order",
        target: "Customer",
        rel_type: "NonExistentBpmnRelation",
      },
    })
    expect(invalidRelRes.result?.isError).toBe(true)
  })

  it("RF-38: debe aplicar mutaciones batch transaccionales vía apply_model_diff", async () => {
    const diff = {
      add: [
        {
          type: "class",
          name: "Invoice",
          stereotype: "entity",
          attributes: ["+ invoiceNumber: String"],
          methods: ["+ generatePdf(): byte[]"],
        },
      ],
      modify: [],
      remove: [],
    }

    const diffRes = await sendRequest("tools/call", {
      name: "apply_model_diff",
      arguments: { diff },
    })

    expect(diffRes.result?.isError).toBe(false)
    const diffData = JSON.parse((diffRes.result?.content as Array<{ text: string }>)[0].text)
    expect(diffData.status).toBe("success")
    expect(diffData.applied.additions).toBe(1)

    // Verificar que Invoice ahora existe en el diagrama
    const readRes = await sendRequest("tools/call", {
      name: "read_diagram",
      arguments: {},
    })
    const diagram = JSON.parse((readRes.result?.content as Array<{ text: string }>)[0].text)
    const invoiceNode = diagram.nodes.find(
      (n: { data: { name: string } }) => n.data.name === "Invoice"
    )
    expect(invoiceNode).toBeDefined()
  })

  it("RF-39: debe listar y leer recursos URI como umlstudio://schema", async () => {
    const listRes = await sendRequest("resources/list")
    expect(listRes.error).toBeUndefined()
    const resources = listRes.result?.resources as Array<{ uri: string }>
    expect(resources.some((r) => r.uri === "umlstudio://schema")).toBe(true)

    const readRes = await sendRequest("resources/read", {
      uri: "umlstudio://schema",
    })
    expect(readRes.error).toBeUndefined()
    const contents = readRes.result?.contents as Array<{ text: string }>
    expect(contents[0].text.length).toBeGreaterThan(0)
  })
})

describe("INT-CU09: Transporte SSE / HTTP de FastMCP Server", () => {
  let sseProcess: ChildProcess
  const testPort = 8993
  const baseUrl = `http://127.0.0.1:${testPort}`

  beforeAll(async () => {
    const serverPath = resolve(__dirname, "../../src/server.py")
    sseProcess = spawn("python", [serverPath, "--transport", "sse", "--port", String(testPort)], {
      stdio: ["ignore", "pipe", "pipe"],
    })

    // Wait for HTTP server to become responsive
    let ready = false
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`${baseUrl}/health`)
        if (res.ok) {
          ready = true
          break
        }
      } catch {
        // Retry
      }
      await new Promise((r) => setTimeout(r, 100))
    }
    expect(ready).toBe(true)
  })

  afterAll(() => {
    sseProcess.kill()
  })

  it("RF-37: debe responder exitosamente al healthcheck HTTP GET /health", async () => {
    const res = await fetch(`${baseUrl}/health`)
    expect(res.status).toBe(200)

    const body = (await res.json()) as { status: string; service: string; version: string }
    expect(body.status).toBe("ok")
    expect(body.service).toBe("umlstudio-mcp-server")
    expect(body.version).toBe("1.0.0")
  })

  it("RF-38: debe procesar llamadas JSON-RPC 2.0 vía HTTP POST", async () => {
    const rpcPayload = {
      jsonrpc: "2.0",
      id: "http-test-1",
      method: "tools/call",
      params: {
        name: "get_metrics",
        arguments: { diagram_id: "current" },
      },
    }

    const res = await fetch(`${baseUrl}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rpcPayload),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as JsonRpcResponse
    expect(body.id).toBe("http-test-1")
    expect(body.error).toBeUndefined()

    const content = body.result?.content as Array<{ text: string }>
    const metrics = JSON.parse(content[0].text)
    expect(metrics.diagramId).toBe("current")
    expect(metrics.classesCount).toBeDefined()
  })
})
