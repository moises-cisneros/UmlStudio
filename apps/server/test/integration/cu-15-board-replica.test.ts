// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"
import WebSocket from "ws"
import { createServer } from "node:net"
import * as Y from "yjs"
import { createHeadlessSync } from "@umlstudio/core/internals"
import { startRelayServer } from "../../src/ws.js"

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

function connectPeer(port: number, diagramId: string, ydoc?: Y.Doc): Peer {
  const { ydoc: doc, sync } = createHeadlessSync(ydoc)
  const ws = new WebSocket(`ws://127.0.0.1:${port}?diagramId=${diagramId}`)

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

describe("INT-CU15: server-side board replica", () => {
  let relay: ReturnType<typeof startRelayServer> | undefined
  const peers: Peer[] = []

  afterEach(async () => {
    await Promise.all(peers.map((p) => p.close()))
    peers.length = 0
    await relay?.close()
    relay = undefined
  })

  it("reflects the nodes and edges edited by two clients", async () => {
    const port = await getFreePort()
    relay = startRelayServer({ port, host: "127.0.0.1" })
    const alice = connectPeer(port, "room-replica")
    const bob = connectPeer(port, "room-replica")
    peers.push(alice, bob)
    await Promise.all([alice.ready, bob.ready])

    alice.ydoc.transact(() => {
      alice.ydoc.getMap("nodes").set("a", classNode("a", "Course"))
    }, "store")
    bob.ydoc.transact(() => {
      bob.ydoc.getMap("nodes").set("b", classNode("b", "Student"))
      bob.ydoc
        .getMap("edges")
        .set("e1", { id: "e1", type: "ClassBidirectional", source: "a", target: "b" })
    }, "store")

    const replica = relay.getBoardReplica("room-replica")!
    await waitFor(
      () => replica.getModel().nodes.length === 2 && replica.getModel().edges.length === 1,
      "replica did not receive both clients' edits"
    )

    const model = replica.getModel()
    expect(model.id).toBe("room-replica")
    expect(model.nodes.map((n) => n.id).sort()).toEqual(["a", "b"])
    expect(model.edges[0]).toMatchObject({ id: "e1", source: "a", target: "b" })
  })

  it("increases the revision monotonically on every change", async () => {
    const port = await getFreePort()
    relay = startRelayServer({ port, host: "127.0.0.1" })
    const alice = connectPeer(port, "room-revision")
    peers.push(alice)
    await alice.ready

    const replica = relay.getBoardReplica("room-revision")!
    const seen = [replica.getRevision()]
    for (const id of ["n1", "n2"]) {
      alice.ydoc.transact(() => alice.ydoc.getMap("nodes").set(id, classNode(id, id)), "store")
      await waitFor(() => replica.getModel().nodes.some((n) => n.id === id), `no ${id}`)
      seen.push(replica.getRevision())
    }

    expect(seen[1]).toBeGreaterThan(seen[0])
    expect(seen[2]).toBeGreaterThan(seen[1])
  })

  it("destroys the replica when the room becomes empty", async () => {
    const port = await getFreePort()
    relay = startRelayServer({ port, host: "127.0.0.1" })
    const alice = connectPeer(port, "room-empty")
    await alice.ready
    expect(relay.getBoardReplica("room-empty")).toBeDefined()

    await alice.close()
    await waitFor(() => relay!.getBoardReplica("room-empty") === undefined, "replica not destroyed")
  })

  it("rebuilds the replica from the first client that reconnects after a restart", async () => {
    const port = await getFreePort()
    relay = startRelayServer({ port, host: "127.0.0.1" })
    const alice = connectPeer(port, "room-restart")
    peers.push(alice)
    await alice.ready
    alice.ydoc.transact(
      () => alice.ydoc.getMap("nodes").set("a", classNode("a", "Course")),
      "store"
    )
    await waitFor(
      () => relay!.getBoardReplica("room-restart")?.getModel().nodes.length === 1,
      "replica did not see the first node"
    )

    // Server restart: every connection and replica is lost, the client keeps its Y.Doc.
    const survivingDoc = alice.ydoc
    await relay.close()
    await alice.close()
    peers.length = 0

    relay = startRelayServer({ port, host: "127.0.0.1" })
    expect(relay.getBoardReplica("room-restart")).toBeUndefined()
    const reconnected = connectPeer(port, "room-restart", survivingDoc)
    peers.push(reconnected)
    await reconnected.ready

    await waitFor(
      () => relay!.getBoardReplica("room-restart")?.getModel().nodes.length === 1,
      "replica was not rebuilt from the reconnecting client"
    )
    expect(relay.getBoardReplica("room-restart")!.getModel().nodes[0]).toMatchObject({ id: "a" })
  })
})
