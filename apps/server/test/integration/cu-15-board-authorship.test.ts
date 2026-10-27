// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"
import WebSocket from "ws"
import { createServer } from "node:net"
import * as Y from "yjs"
import { createHeadlessSync } from "@umlstudio/core/internals"
import { startRelayServer } from "../../src/ws.js"
import { getRedis } from "../../src/__tests__/setup.js"
import { k } from "../../src/redis.js"
import { createAuthorshipRepository } from "../../src/services/room-ai/authorship-repository.js"

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on("error", reject)
    srv.listen(0, () => {
      const port = (srv.address() as { port: number }).port
      srv.close(() => resolve(port))
    })
  })
}

interface Peer {
  ws: WebSocket
  ydoc: Y.Doc
  ready: Promise<void>
  close: () => Promise<void>
}

function connectPeer(port: number, diagramId: string, token?: string): Peer {
  const { ydoc: doc, sync } = createHeadlessSync()
  const ws = new WebSocket(
    `ws://127.0.0.1:${port}?diagramId=${diagramId}${token ? `&mode=shared&token=${token}` : ""}`
  )

  sync.setSendBroadcastMessage((data) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ diagramData: data }))
  })
  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString("utf-8")) as { diagramData?: string }
    if (typeof parsed.diagramData === "string") sync.handleReceivedData(parsed.diagramData)
  })

  const ready = new Promise<void>((resolve, reject) => {
    ws.once("open", () => {
      sync.broadcastFullState()
      resolve()
    })
    ws.once("error", reject)
  })

  return {
    ws,
    ydoc: doc,
    ready,
    close: () =>
      new Promise<void>((resolve) => {
        if (ws.readyState === WebSocket.CLOSED) return resolve()
        ws.once("close", () => resolve())
        ws.close()
      }),
  }
}

async function waitFor(condition: () => boolean, message: string, timeoutMs = 4000): Promise<void> {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor: ${message}`)
    await new Promise((r) => setTimeout(r, 10))
  }
}

const classNode = (id: string, name: string) => ({
  id,
  type: "class",
  position: { x: 0, y: 0 },
  data: { name, attributes: [], methods: [] },
})

const TTL = 3600
const verifyToken = async (token: string) => {
  if (token.startsWith("token-")) return token.slice("token-".length)
  throw new Error("invalid token")
}

describe("INT-CU15: board authorship", () => {
  let relay: ReturnType<typeof startRelayServer> | undefined
  const peers: Peer[] = []

  afterEach(async () => {
    await Promise.all(peers.map((p) => p.close()))
    peers.length = 0
    await relay?.close()
    relay = undefined
  })

  async function boot() {
    const redis = await getRedis()
    const authorship = createAuthorshipRepository(redis, TTL)
    const port = await getFreePort()
    relay = startRelayServer({ port, host: "127.0.0.1", verifyToken, authorship })
    return { redis, authorship, port }
  }

  it("attributes a class created by Juan to Juan's user id", async () => {
    const { authorship, port } = await boot()
    const juan = connectPeer(port, "room-authorship", "token-juan")
    peers.push(juan)
    await juan.ready

    juan.ydoc.transact(() => juan.ydoc.getMap("nodes").set("a", classNode("a", "Course")), "store")

    await waitForAuthor(authorship, "room-authorship", "a", "juan")
  })

  it("attributes each element to the user that changed it last, across users", async () => {
    const { authorship, port } = await boot()
    const juan = connectPeer(port, "room-two", "token-juan")
    const ana = connectPeer(port, "room-two", "token-ana")
    peers.push(juan, ana)
    await Promise.all([juan.ready, ana.ready])

    juan.ydoc.transact(() => juan.ydoc.getMap("nodes").set("a", classNode("a", "Course")), "store")
    await waitForAuthor(authorship, "room-two", "a", "juan")
    ana.ydoc.transact(() => {
      ana.ydoc.getMap("nodes").set("b", classNode("b", "Student"))
      ana.ydoc
        .getMap("edges")
        .set("e1", { id: "e1", type: "Association", source: "a", target: "b" })
    }, "store")
    await waitForAuthor(authorship, "room-two", "e1", "ana")

    expect(await authorship.getAll("room-two")).toEqual({ a: "juan", b: "ana", e1: "ana" })
  })

  it("does not attribute updates without an authenticated user", async () => {
    const { authorship, port } = await boot()
    const anonymous = connectPeer(port, "room-anon")
    const juan = connectPeer(port, "room-anon", "token-juan")
    peers.push(anonymous, juan)
    await Promise.all([anonymous.ready, juan.ready])

    anonymous.ydoc.transact(
      () => anonymous.ydoc.getMap("nodes").set("x", classNode("x", "Ghost")),
      "store"
    )
    juan.ydoc.transact(() => juan.ydoc.getMap("nodes").set("a", classNode("a", "Course")), "store")
    await waitForAuthor(authorship, "room-anon", "a", "juan")

    const replica = relay!.getBoardReplica("room-anon")!
    await waitFor(() => replica.getModel().nodes.length === 2, "replica missed the anonymous node")
    expect(await authorship.getAll("room-anon")).toEqual({ a: "juan" })
  })

  it("does not credit a client-claimed identity from awareness", async () => {
    const { authorship, port } = await boot()
    const anonymous = connectPeer(port, "room-spoof")
    peers.push(anonymous)
    await anonymous.ready
    anonymous.ws.send(
      JSON.stringify({ diagramData: Buffer.from(Uint8Array.of(3)).toString("base64") })
    )

    anonymous.ydoc.transact(
      () => anonymous.ydoc.getMap("nodes").set("x", classNode("x", "Ghost")),
      "store"
    )
    const replica = relay!.getBoardReplica("room-spoof")!
    await waitFor(() => replica.getModel().nodes.length === 1, "replica missed the node")
    expect(await authorship.getAll("room-spoof")).toEqual({})
  })

  it("stores the hash under the diagram TTL", async () => {
    const { redis, authorship, port } = await boot()
    const juan = connectPeer(port, "room-ttl", "token-juan")
    peers.push(juan)
    await juan.ready
    juan.ydoc.transact(() => juan.ydoc.getMap("nodes").set("a", classNode("a", "Course")), "store")
    await waitForAuthor(authorship, "room-ttl", "a", "juan")

    const ttl = await redis.ttl(k.aiAuthorship("room-ttl"))
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(TTL)
  })
})

async function waitForAuthor(
  authorship: ReturnType<typeof createAuthorshipRepository>,
  diagramId: string,
  elementId: string,
  userId: string
): Promise<void> {
  const start = Date.now()
  while ((await authorship.getAll(diagramId))[elementId] !== userId) {
    if (Date.now() - start > 4000) throw new Error(`waitForAuthor: ${elementId} not ${userId}`)
    await new Promise((r) => setTimeout(r, 20))
  }
}
