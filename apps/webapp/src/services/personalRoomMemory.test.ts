import "fake-indexeddb/auto"
import { deleteDB } from "idb"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  deletePersonalRoomMemory,
  readPersonalRoomMemory,
  writePersonalRoomMemory,
} from "./personalRoomMemory"

const databaseName = "umlstudio-personal-room-memory"

beforeEach(async () => {
  await deleteDB(databaseName)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("personal room memory", () => {
  it("isolates users and diagrams, including composite-key boundaries", async () => {
    await writePersonalRoomMemory("user", "room", "first")
    await writePersonalRoomMemory("other", "room", "second")
    await writePersonalRoomMemory("user", "other", "third")
    await writePersonalRoomMemory("user:room", "other", "fourth")
    await writePersonalRoomMemory("user", "room:other", "fifth")
    expect(await readPersonalRoomMemory("user", "room")).toBe("first")
    expect(await readPersonalRoomMemory("other", "room")).toBe("second")
    expect(await readPersonalRoomMemory("user", "other")).toBe("third")
    expect(await readPersonalRoomMemory("user:room", "other")).toBe("fourth")
    expect(await readPersonalRoomMemory("user", "room:other")).toBe("fifth")
    expect(await readPersonalRoomMemory("missing", "room")).toBeNull()
  })

  it("persists across module reload and overwrites the same scope", async () => {
    await writePersonalRoomMemory("user", "room", "before")
    vi.resetModules()
    const reloaded = await import("./personalRoomMemory")
    expect(await reloaded.readPersonalRoomMemory("user", "room")).toBe("before")
    await reloaded.writePersonalRoomMemory("user", "room", "after")
    expect(await readPersonalRoomMemory("user", "room")).toBe("after")
  })

  it("deletes only the requested scope", async () => {
    await writePersonalRoomMemory("user", "room", "delete me")
    await writePersonalRoomMemory("other", "room", "keep me")
    await writePersonalRoomMemory("user", "other", "also keep me")
    await deletePersonalRoomMemory("user", "room")
    expect(await readPersonalRoomMemory("user", "room")).toBeNull()
    expect(await readPersonalRoomMemory("other", "room")).toBe("keep me")
    expect(await readPersonalRoomMemory("user", "other")).toBe("also keep me")
  })

  it("propagates storage errors for every operation", async () => {
    const failure = new Error("storage unavailable")
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw failure
      },
    })
    await expect(readPersonalRoomMemory("user", "room")).rejects.toBe(failure)
    await expect(writePersonalRoomMemory("user", "room", "memory")).rejects.toBe(failure)
    await expect(deletePersonalRoomMemory("user", "room")).rejects.toBe(failure)
  })

  it("rejects missing identity or diagram identifiers", async () => {
    await expect(readPersonalRoomMemory("", "room")).rejects.toThrow()
    await expect(writePersonalRoomMemory("user", " ", "memory")).rejects.toThrow()
    await expect(deletePersonalRoomMemory(" ", "room")).rejects.toThrow()
  })
})
