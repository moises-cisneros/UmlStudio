import { afterEach, describe, expect, it, vi } from "vitest"
import { WebSocketManager } from "./WebSocketManager"
import type { UmlStudioEditor } from "@umlstudio/core"

vi.mock("@umlstudio/core", () => ({
  UmlStudioEditor: {
    generateInitialSyncMessage: () => "sync",
    generateInitialAwarenessSyncMessage: () => "awareness",
  },
}))

class FakeSocket {
  static OPEN = 1
  static last: FakeSocket
  readyState = 1
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((event: Event) => void) | null = null
  constructor() {
    FakeSocket.last = this
  }
  send(value: string) {
    this.sent.push(value)
  }
  close() {
    this.readyState = 3
    this.onclose?.()
  }
  receive(value: object) {
    this.onmessage?.({ data: JSON.stringify(value) })
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("replica flush", () => {
  function setup() {
    vi.stubGlobal("WebSocket", FakeSocket)
    let send: (value: string) => void = () => {}
    const editor = {
      sendBroadcastMessage: (fn: typeof send) => {
        send = fn
      },
      broadcastFullState: () => send("full"),
      broadcastAwareness: () => {},
    } as unknown as UmlStudioEditor
    const manager = new WebSocketManager("board", editor, () => {}, {
      mode: "shared",
      getToken: () => "token",
    })
    manager.startConnection()
    const socket = FakeSocket.last
    socket.onopen?.()
    return { manager, socket }
  }

  it("sends the full state before the matching marker and resolves only on acknowledgement", async () => {
    const { manager, socket } = setup()
    const pending = manager.flushSharedReplica()
    const request = JSON.parse(socket.sent.at(-1)!)
    socket.receive({
      kind: "replica-flush-challenge",
      requestId: request.requestId,
      nonce: "nonce",
    })
    expect(JSON.parse(socket.sent.at(-2)!)).toEqual({ diagramData: "full" })
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({
      kind: "replica-flush-marker",
      nonce: "nonce",
    })
    socket.receive({
      kind: "replica-flush-ack",
      requestId: request.requestId,
      nonce: "nonce",
      revision: 4,
      generation: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    })
    await expect(pending).resolves.toEqual({
      generation: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      revision: 4,
    })
    manager.cleanup()
  })

  it("rejects local mode and ignores acknowledgements with an unrelated nonce", async () => {
    const { manager, socket } = setup()
    const pending = manager.flushSharedReplica()
    const request = JSON.parse(socket.sent.at(-1)!)
    socket.receive({
      kind: "replica-flush-challenge",
      requestId: request.requestId,
      nonce: "right",
    })
    socket.receive({
      kind: "replica-flush-ack",
      requestId: request.requestId,
      nonce: "right",
      revision: 9,
      generation: "invalid",
    })
    socket.receive({
      kind: "replica-flush-ack",
      requestId: request.requestId,
      nonce: "wrong",
      revision: 9,
    })
    manager.cleanup()
    await expect(pending).rejects.toThrow()
    const editor = { sendBroadcastMessage: () => {} } as unknown as UmlStudioEditor
    const local = new WebSocketManager("board", editor, () => {}, { mode: "local" })
    await expect(local.flushSharedReplica()).rejects.toThrow()
  })

  it("rejects pending flushes on disconnect and timeout", async () => {
    vi.useFakeTimers()
    const { manager, socket } = setup()
    const disconnected = manager.flushSharedReplica()
    socket.onclose?.()
    await expect(disconnected).rejects.toThrow()
    manager.cleanup()
    const next = setup()
    const timedOut = next.manager.flushSharedReplica(25)
    const rejected = expect(timedOut).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(25)
    await rejected
    next.manager.cleanup()
  })
})
