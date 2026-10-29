import { describe, it, expect, afterEach, beforeEach } from "vitest"
import WebSocket from "ws"
import { createServer } from "node:net"
import { getRedis } from "../../src/__tests__/setup.js"
import { gzipJson, k } from "../../src/redis.js"
import { startRelayServer, type RelayServer } from "../../src/ws.js"
import { createRoomAiTestService as createRoomAiService } from "./helpers/room-ai-test-support.js"
import { createRoomAiEventBus } from "../../src/services/room-ai/room-ai-event-bus.js"

const DIAGRAM_ID = "room-events-1"

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

function connect(
  port: number,
  diagramId: string,
  mode: "shared" | "local" = "shared"
): Promise<{ ws: WebSocket; frames: string[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}?diagramId=${diagramId}&mode=${mode}&token=test`
    )
    const frames: string[] = []
    ws.on("message", (raw) => frames.push(raw.toString()))
    ws.once("open", () => resolve({ ws, frames }))
    ws.once("error", reject)
  })
}

const settle = () => new Promise((r) => setTimeout(r, 100))

const roomAiFrames = (frames: string[]) =>
  frames.filter((f) => f.includes('"kind":"room-ai"')).map((f) => JSON.parse(f))

describe("INT-CU15: room AI events over WebSocket", () => {
  let relay: RelayServer
  let port: number
  const sockets: WebSocket[] = []

  beforeEach(async () => {
    port = await getFreePort()
    relay = startRelayServer({ port, host: "127.0.0.1", verifyToken: async () => "test-user" })
  })

  afterEach(async () => {
    for (const ws of sockets.splice(0)) ws.terminate()
    await relay.close()
  })

  it("delivers message.created with Juan as author to Ana's socket", async () => {
    const redis = await getRedis()
    await redis.set(k.diagram(DIAGRAM_ID), gzipJson({ id: DIAGRAM_ID }))
    const roomAi = createRoomAiService({
      redis,
      ttlSeconds: 3600,
      publish: relay.publishRoomAi,
    })

    const ana = await connect(port, DIAGRAM_ID)
    sockets.push(ana.ws)
    await settle()

    await roomAi.postMessage({
      diagramId: DIAGRAM_ID,
      author: { id: "juan-id", name: "Juan", color: "#ff0000" } as never,
      text: "Add an Order class",
      intent: "change",
    })
    await settle()

    const [envelope] = roomAiFrames(ana.frames)
    expect(envelope.kind).toBe("room-ai")
    expect(envelope.event.type).toBe("message.created")
    expect(envelope.event.message.author).toMatchObject({ id: "juan-id", name: "Juan" })
    expect(envelope.event.message.text).toBe("Add an Order class")
  })

  it("publishes the pending message's queue position", async () => {
    const redis = await getRedis()
    await redis.set(k.diagram(DIAGRAM_ID), gzipJson({ id: DIAGRAM_ID }))
    const received: unknown[] = []
    const roomAi = createRoomAiService({
      redis,
      ttlSeconds: 3600,
      publish: (_, event) => received.push(event),
    })
    await roomAi.postMessage({
      diagramId: DIAGRAM_ID,
      author: { id: "u1", name: "User" } as never,
      text: "Question",
      intent: "ask",
    })
    expect(received).toContainEqual({
      type: "ai.status",
      status: "idle",
      queueLength: 1,
      queuePosition: 1,
    })
  })

  it("does not send shared Room AI events to an unauthenticated local-mode socket", async () => {
    const local = await connect(port, DIAGRAM_ID, "local")
    sockets.push(local.ws)
    await settle()
    relay.publishRoomAi(DIAGRAM_ID, { type: "ai.status", status: "thinking", queueLength: 1 })
    await settle()
    expect(roomAiFrames(local.frames)).toEqual([])
  })

  it("broadcasts ai.status and policy.updated to every socket in the room", async () => {
    const ana = await connect(port, DIAGRAM_ID)
    const luis = await connect(port, DIAGRAM_ID)
    sockets.push(ana.ws, luis.ws)
    await settle()

    relay.publishRoomAi(DIAGRAM_ID, {
      type: "ai.status",
      status: "thinking",
      forUserName: "Juan",
      queueLength: 2,
    })
    await settle()

    for (const peer of [ana, luis]) {
      expect(roomAiFrames(peer.frames)).toEqual([
        {
          kind: "room-ai",
          event: { type: "ai.status", status: "thinking", forUserName: "Juan", queueLength: 2 },
        },
      ])
    }
  })

  it("does not relay a room-ai event sent by a client", async () => {
    const ana = await connect(port, DIAGRAM_ID)
    const luis = await connect(port, DIAGRAM_ID)
    sockets.push(ana.ws, luis.ws)
    await settle()

    ana.ws.send(
      JSON.stringify({
        kind: "room-ai",
        event: { type: "ai.status", status: "idle", queueLength: 0 },
      })
    )
    await settle()

    expect(roomAiFrames(luis.frames)).toEqual([])
  })

  it("delivers a policy update to a socket on another relay", async () => {
    const redis = await getRedis()
    const otherPort = await getFreePort()
    const otherRelay = startRelayServer({
      port: otherPort,
      host: "127.0.0.1",
      verifyToken: async () => "test-user",
    })
    const firstBus = await createRoomAiEventBus(redis, relay.publishRoomAi)
    const secondBus = await createRoomAiEventBus(redis, otherRelay.publishRoomAi)
    try {
      const peer = await connect(otherPort, DIAGRAM_ID)
      sockets.push(peer.ws)
      await settle()
      const event = {
        type: "policy.updated" as const,
        policy: {
          enabled: true,
          allowChanges: false,
          applyMode: "confirm" as const,
          proactive: false,
        },
      }
      await firstBus.publish(DIAGRAM_ID, event)
      await settle()
      expect(roomAiFrames(peer.frames)).toEqual([{ kind: "room-ai", event }])
    } finally {
      for (const ws of sockets.splice(0)) ws.terminate()
      await firstBus.close()
      await secondBus.close()
      await otherRelay.close()
    }
  })
})
