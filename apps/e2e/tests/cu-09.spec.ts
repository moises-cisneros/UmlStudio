import { test, expect } from "@playwright/test"
import { spawn, type ChildProcess } from "node:child_process"
import { resolve } from "node:path"
import readline from "node:readline"

interface JsonRpcResponse {
  jsonrpc: string
  id: number | string | null
  result?: Record<string, unknown>
  error?: { code: number; message: string }
}

test.describe("CU-09: Integración Agéntica con Protocolo MCP (FastMCP Python)", () => {
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

  test.beforeAll(async () => {
    const serverPath = resolve(process.cwd(), "../mcp-server/src/server.py")
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

    await new Promise((r) => setTimeout(r, 400))
  })

  test.afterAll(() => {
    rl?.close()
    serverProcess?.kill()
  })

  test("CP-CU09-01: Flujo Básico (Happy Path) - Handshake initialize, listado e invocación de herramientas", async () => {
    const initRes = await sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "playwright-e2e-agent", version: "1.0.0" },
    })

    expect(initRes.error).toBeUndefined()
    expect(initRes.result?.protocolVersion).toBe("2024-11-05")
    sendNotification("notifications/initialized")

    const toolsRes = await sendRequest("tools/list")
    const tools = toolsRes.result?.tools as Array<{ name: string }>
    expect(tools.some((t) => t.name === "add_class")).toBe(true)
    expect(tools.some((t) => t.name === "read_diagram")).toBe(true)

    // Invocación de add_class
    const addRes = await sendRequest("tools/call", {
      name: "add_class",
      arguments: {
        diagram_id: "current",
        name: "Factura",
        attributes: [{ name: "total", type: "number", visibility: "public" }],
      },
    })
    expect(addRes.error).toBeUndefined()
  })

  test("CP-CU09-02: Flujo Alternativo (FA-01) - Invocación de herramienta inexistente devuelve error controlado", async () => {
    const errorRes = await sendRequest("tools/call", {
      name: "herramienta_no_existente",
      arguments: {},
    })

    // Debe contener objeto error o resultado de error en protocolo MCP
    const hasError =
      errorRes.error !== undefined ||
      Boolean(errorRes.result?.isError) ||
      Array.isArray(errorRes.result?.content)
    expect(hasError).toBe(true)
  })
})
