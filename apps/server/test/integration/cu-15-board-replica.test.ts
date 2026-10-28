// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"
import WebSocket from "ws"
import { createServer } from "node:net"
import * as Y from "yjs"
import { createHeadlessSync } from "@umlstudio/core/internals"
import { startRelayServer } from "../../src/ws.js"
import {
  createBoardReplica,
  createBoardReplicaRegistry,
} from "../../src/services/room-ai/board-replica.js"

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

describe("board replica update validation", () => {
  it("rejects stale generations and invalid or unmet revisions after recreation", () => {
    const registry = createBoardReplicaRegistry()
    const first = registry.open("board")
    const generation = first.generation
    const revision = first.getRevision()
    expect(registry.getAtLeast("board", generation, revision)).toBe(first)
    expect(registry.getAtLeast("board", generation, revision + 1)).toBeUndefined()
    expect(registry.getAtLeast("board", generation, -1)).toBeUndefined()
    expect(registry.getAtLeast("board", generation, NaN)).toBeUndefined()
    registry.close("board")
    const next = registry.open("board")
    expect(next.generation).not.toBe(generation)
    expect(registry.getAtLeast("board", generation, revision)).toBeUndefined()
    expect(registry.getAtLeast("board", next.generation, 0)).toBe(next)
    registry.closeAll()
  })

  it("accepts an empty full state and rejects malformed updates", () => {
    const replica = createBoardReplica("empty")
    const doc = new Y.Doc()
    const emptyFrame = Buffer.concat([Buffer.from([1]), Buffer.from(Y.encodeStateAsUpdate(doc))])
    expect(replica.applyFrame(Buffer.from([1, 255]).toString("base64"))).toBe(false)
    expect(replica.applyFrame(emptyFrame.toString("base64"))).toBe(true)
    expect(replica.getModel().nodes).toEqual([])
    doc.destroy()
    replica.destroy()
  })
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

  it("does not acknowledge an incomplete dependent update as a full flush", async () => {
    const port = await getFreePort()
    relay = startRelayServer({ port, host: "127.0.0.1", verifyToken: async () => "owner" })
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}?diagramId=partial-flush&mode=shared&token=owner`
    )
    const messages: Array<Record<string, unknown>> = []
    ws.on("message", (raw) => messages.push(JSON.parse(raw.toString())))
    await new Promise<void>((resolve) => ws.once("open", resolve))
    ws.send(JSON.stringify({ kind: "replica-flush-request", requestId: "partial" }))
    await waitFor(() => messages.some((m) => m.kind === "replica-flush-challenge"), "challenge")
    const nonce = messages.find((m) => m.kind === "replica-flush-challenge")!.nonce
    const doc = new Y.Doc()
    doc.getMap("nodes").set("a", classNode("a", "A"))
    const vector = Y.encodeStateVector(doc)
    doc.getMap("nodes").set("b", classNode("b", "B"))
    const partial = Buffer.concat([
      Buffer.from([1]),
      Buffer.from(Y.encodeStateAsUpdate(doc, vector)),
    ])
    ws.send(JSON.stringify({ diagramData: partial.toString("base64") }))
    ws.send(JSON.stringify({ kind: "replica-flush-marker", nonce }))
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(messages.some((m) => m.kind === "replica-flush-ack")).toBe(false)
    expect(relay.getSharedBoardReplica("partial-flush")).toBeUndefined()
    doc.destroy()
    await new Promise<void>((resolve) => {
      ws.once("close", resolve)
      ws.close()
    })
  })

  it("never relays client-sent server-only flush envelopes", async () => {
    const port = await getFreePort()
    relay = startRelayServer({ port, host: "127.0.0.1", verifyToken: async () => "owner" })
    const first = new WebSocket(
      `ws://127.0.0.1:${port}?diagramId=spoof-flush&mode=shared&token=owner`
    )
    const second = new WebSocket(
      `ws://127.0.0.1:${port}?diagramId=spoof-flush&mode=shared&token=owner`
    )
    const received: Array<Record<string, unknown>> = []
    second.on("message", (raw) => received.push(JSON.parse(raw.toString())))
    await Promise.all(
      [first, second].map((ws) => new Promise<void>((resolve) => ws.once("open", resolve)))
    )
    first.send(JSON.stringify({ kind: "replica-flush-challenge", requestId: "1", nonce: "forged" }))
    first.send(
      JSON.stringify({
        kind: "replica-flush-ack",
        requestId: "1",
        nonce: "forged",
        generation: "a".repeat(64),
        revision: 0,
        diagramData: Buffer.from([1, 0, 0]).toString("base64"),
      })
    )
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(
      received.some((m) => m.kind === "replica-flush-challenge" || m.kind === "replica-flush-ack")
    ).toBe(false)
    await Promise.all(
      [first, second].map(
        (ws) =>
          new Promise<void>((resolve) => {
            ws.once("close", resolve)
            ws.close()
          })
      )
    )
  })

  it("never returns a local replica through the shared-only accessor", async () => {
    const port = await getFreePort()
    relay = startRelayServer({ port, host: "127.0.0.1", verifyToken: async () => "owner" })
    const id = "replica-accessor-isolation"
    const local = connectPeer(port, id)
    peers.push(local)
    await local.ready
    expect(relay.getSharedBoardReplica(id)).toBeUndefined()
    const shared = new WebSocket(`ws://127.0.0.1:${port}?diagramId=${id}&mode=shared&token=owner`)
    await new Promise<void>((resolve, reject) => {
      shared.once("open", resolve)
      shared.once("error", reject)
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(relay.getSharedBoardReplica(id)).toBeUndefined()
    await new Promise<void>((resolve) => {
      shared.once("close", resolve)
      shared.close()
    })
    await waitFor(
      () => relay!.getSharedBoardReplica(id) === undefined,
      "shared replica still present"
    )
    expect(relay.getBoardReplica(id)).toBeDefined()
  })

  it("requires an authenticated challenge and a valid ordered update before readiness", async () => {
    const port = await getFreePort()
    relay = startRelayServer({ port, host: "127.0.0.1", verifyToken: async () => "owner" })
    const ws = new WebSocket(`ws://127.0.0.1:${port}?diagramId=barrier&mode=shared&token=owner`)
    const messages: Array<Record<string, unknown>> = []
    ws.on("message", (raw) => messages.push(JSON.parse(raw.toString())))
    await new Promise<void>((resolve) => ws.once("open", resolve))
    ws.send(JSON.stringify({ kind: "replica-flush-request", requestId: "one" }))
    await waitFor(() => messages.some((m) => m.kind === "replica-flush-challenge"), "challenge")
    const challenge = messages.find((m) => m.kind === "replica-flush-challenge")!
    expect(relay.getSharedBoardReplica("barrier")).toBeUndefined()
    ws.send(JSON.stringify({ kind: "replica-flush-marker", nonce: challenge.nonce }))
    ws.send(JSON.stringify({ diagramData: Buffer.from([1, 255]).toString("base64") }))
    ws.send(JSON.stringify({ kind: "replica-flush-marker", nonce: "wrong" }))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(relay.getSharedBoardReplica("barrier")).toBeUndefined()
    const doc = new Y.Doc()
    doc.getMap("nodes").set("a", classNode("a", "Course"))
    const frame = Buffer.concat([Buffer.from([1]), Buffer.from(Y.encodeStateAsUpdate(doc))])
    ws.send(JSON.stringify({ diagramData: frame.toString("base64") }))
    ws.send(JSON.stringify({ kind: "replica-flush-marker", nonce: challenge.nonce }))
    await waitFor(() => messages.some((m) => m.kind === "replica-flush-ack"), "ack")
    const replica = relay.getSharedBoardReplica("barrier")!
    expect(replica.getModel().nodes[0]).toMatchObject({ id: "a" })
    expect(messages.find((m) => m.kind === "replica-flush-ack")?.generation).toBe(
      replica.generation
    )
    expect(
      relay.getSharedBoardReplicaAtLeast("barrier", replica.generation, replica.getRevision())
    ).toBe(replica)
    expect(
      relay.getSharedBoardReplicaAtLeast("barrier", "stale", replica.getRevision())
    ).toBeUndefined()
    expect(messages.find((m) => m.kind === "replica-flush-ack")?.revision).toBe(
      replica.getRevision()
    )
    const dependent = new Y.Doc()
    dependent.getMap("nodes").set("first", classNode("first", "First"))
    const firstUpdate = Y.encodeStateAsUpdate(dependent)
    const vector = Y.encodeStateVector(dependent)
    dependent.getMap("nodes").set("second", classNode("second", "Second"))
    const partial = Buffer.concat([
      Buffer.from([1]),
      Buffer.from(Y.encodeStateAsUpdate(dependent, vector)),
    ])
    ws.send(JSON.stringify({ diagramData: partial.toString("base64") }))
    await waitFor(() => !relay!.getBoardReplica("barrier")!.isComplete(), "pending Yjs dependency")
    expect(relay.getSharedBoardReplica("barrier")).toBeUndefined()
    expect(relay.getSharedBoardReplicaAtLeast("barrier", replica.generation, 0)).toBeUndefined()
    ws.send(
      JSON.stringify({
        diagramData: Buffer.concat([Buffer.from([1]), Buffer.from(firstUpdate)]).toString("base64"),
      })
    )
    await waitFor(
      () => relay!.getSharedBoardReplica("barrier") !== undefined,
      "dependencies resolved"
    )
    dependent.destroy()
    doc.destroy()
    await new Promise<void>((resolve) => {
      ws.once("close", resolve)
      ws.close()
    })
  })

  it("rejects an acknowledgement from a prior replica lifetime", async () => {
    const port = await getFreePort()
    relay = startRelayServer({ port, host: "127.0.0.1", verifyToken: async () => "owner" })
    async function synchronize() {
      const ws = new WebSocket(`ws://127.0.0.1:${port}?diagramId=reborn&mode=shared&token=owner`)
      const messages: Array<Record<string, unknown>> = []
      ws.on("message", (raw) => messages.push(JSON.parse(raw.toString())))
      await new Promise<void>((resolve) => ws.once("open", resolve))
      ws.send(JSON.stringify({ kind: "replica-flush-request", requestId: "request" }))
      await waitFor(
        () => messages.some((message) => message.kind === "replica-flush-challenge"),
        "challenge"
      )
      const nonce = messages.find((message) => message.kind === "replica-flush-challenge")!.nonce
      const doc = new Y.Doc()
      const frame = Buffer.concat([Buffer.from([1]), Buffer.from(Y.encodeStateAsUpdate(doc))])
      ws.send(JSON.stringify({ diagramData: frame.toString("base64") }))
      ws.send(JSON.stringify({ kind: "replica-flush-marker", nonce }))
      await waitFor(() => messages.some((message) => message.kind === "replica-flush-ack"), "ack")
      doc.destroy()
      return { ws, ack: messages.find((message) => message.kind === "replica-flush-ack")! }
    }
    const first = await synchronize()
    const oldGeneration = first.ack.generation as string
    const oldRevision = first.ack.revision as number
    await new Promise<void>((resolve) => {
      first.ws.once("close", resolve)
      first.ws.close()
    })
    await waitFor(() => relay!.getSharedBoardReplica("reborn") === undefined, "old replica closed")
    const next = await synchronize()
    expect(next.ack.generation).not.toBe(oldGeneration)
    expect(relay.getSharedBoardReplicaAtLeast("reborn", oldGeneration, oldRevision)).toBeUndefined()
    expect(
      relay.getSharedBoardReplicaAtLeast(
        "reborn",
        next.ack.generation as string,
        next.ack.revision as number
      )
    ).toBeDefined()
    await new Promise<void>((resolve) => {
      next.ws.once("close", resolve)
      next.ws.close()
    })
  })

  it("does not expose a shared replica or issue challenges to local sockets", async () => {
    const port = await getFreePort()
    relay = startRelayServer({ port, host: "127.0.0.1" })
    const local = connectPeer(port, "local-barrier")
    peers.push(local)
    const messages: Array<Record<string, unknown>> = []
    local.ws.on("message", (raw) => messages.push(JSON.parse(raw.toString())))
    await local.ready
    local.ws.send(JSON.stringify({ kind: "replica-flush-request", requestId: "local" }))
    local.ws.send(JSON.stringify({ kind: "replica-flush-marker", nonce: "local" }))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(messages.some((message) => message.kind === "replica-flush-challenge")).toBe(false)
    expect(relay.getSharedBoardReplica("local-barrier")).toBeUndefined()
  })

  it("accepts an empty full state before acknowledging readiness", async () => {
    const port = await getFreePort()
    relay = startRelayServer({ port, host: "127.0.0.1", verifyToken: async () => "owner" })
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}?diagramId=empty-barrier&mode=shared&token=owner`
    )
    const messages: Array<Record<string, unknown>> = []
    ws.on("message", (raw) => messages.push(JSON.parse(raw.toString())))
    await new Promise<void>((resolve) => ws.once("open", resolve))
    ws.send(JSON.stringify({ kind: "replica-flush-request", requestId: "empty" }))
    await waitFor(
      () => messages.some((message) => message.kind === "replica-flush-challenge"),
      "challenge"
    )
    const nonce = messages.find((message) => message.kind === "replica-flush-challenge")!.nonce
    const doc = new Y.Doc()
    const frame = Buffer.concat([Buffer.from([1]), Buffer.from(Y.encodeStateAsUpdate(doc))])
    ws.send(JSON.stringify({ diagramData: frame.toString("base64") }))
    ws.send(JSON.stringify({ kind: "replica-flush-marker", nonce }))
    await waitFor(() => messages.some((message) => message.kind === "replica-flush-ack"), "ack")
    expect(relay.getSharedBoardReplica("empty-barrier")?.getModel().nodes).toEqual([])
    doc.destroy()
    await new Promise<void>((resolve) => {
      ws.once("close", resolve)
      ws.close()
    })
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
