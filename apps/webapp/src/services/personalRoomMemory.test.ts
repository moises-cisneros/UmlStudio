import "fake-indexeddb/auto"
import { deleteDB, openDB } from "idb"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  readPersonalRoomProfile,
  writePersonalRoomProfile,
  type PersonalRoomProfileRecord,
} from "./personalRoomMemory"

const databaseName = "umlstudio-personal-room-memory"
const profileRecord: PersonalRoomProfileRecord = {
  profile: { detailLevel: "balanced", exampleStyle: "analogy" },
  revision: "11111111-1111-4111-8111-111111111111",
}

beforeEach(async () => {
  await deleteDB(databaseName)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("browser-local Room teaching profile", () => {
  it("isolates profiles by user and diagram composite key", async () => {
    await writePersonalRoomProfile("user", "room", profileRecord)
    await writePersonalRoomProfile("other", "room", {
      ...profileRecord,
      profile: { detailLevel: "concise", exampleStyle: "none" },
    })
    await writePersonalRoomProfile("user", "other", {
      ...profileRecord,
      profile: { detailLevel: "step_by_step", exampleStyle: "code" },
    })

    expect(await readPersonalRoomProfile("user", "room")).toEqual(profileRecord)
    expect(await readPersonalRoomProfile("other", "room")).toMatchObject({
      profile: { detailLevel: "concise", exampleStyle: "none" },
    })
    expect(await readPersonalRoomProfile("user", "other")).toMatchObject({
      profile: { detailLevel: "step_by_step", exampleStyle: "code" },
    })
    expect(await readPersonalRoomProfile("missing", "room")).toBeNull()
  })

  it("persists a profile across module reload and overwrites only the same scope", async () => {
    await writePersonalRoomProfile("user", "room", profileRecord)
    vi.resetModules()
    const reloaded = await import("./personalRoomMemory")
    const next: PersonalRoomProfileRecord = {
      profile: { detailLevel: "concise", exampleStyle: "uml" },
      revision: "22222222-2222-4222-8222-222222222222",
    }
    await reloaded.writePersonalRoomProfile("user", "room", next)
    expect(await readPersonalRoomProfile("user", "room")).toEqual(next)
  })

  it("leaves legacy free-text data untouched and normalizes the old closed-profile shape", async () => {
    const legacy = await openDB(databaseName, 2, {
      upgrade(db) {
        db.createObjectStore("memories")
        db.createObjectStore("profiles")
      },
    })
    await legacy.put("memories", "old free-text note", ["user", "room"])
    await legacy.put("profiles", { status: "approved", ...profileRecord }, ["user", "room"])
    legacy.close()

    expect(await readPersonalRoomProfile("user", "room")).toEqual(profileRecord)
    const preserved = await openDB(databaseName, 2)
    expect(preserved.objectStoreNames.contains("memories")).toBe(true)
    expect(await preserved.get("memories", ["user", "room"])).toBe("old free-text note")
    expect(await preserved.get("profiles", ["user", "room"])).toEqual({
      status: "approved",
      ...profileRecord,
    })
    preserved.close()
  })

  it("ignores a malformed persisted profile without deleting local data", async () => {
    const db = await openDB(databaseName, 2, {
      upgrade(database) {
        database.createObjectStore("profiles")
      },
    })
    await db.put("profiles", { profile: null, revision: "bad" }, ["user", "room"])
    db.close()

    expect(await readPersonalRoomProfile("user", "room")).toBeNull()
    const check = await openDB(databaseName, 2)
    expect(await check.get("profiles", ["user", "room"])).toEqual({
      profile: null,
      revision: "bad",
    })
    check.close()
  })

  it("does not create the retired free-text store for new browser profiles", async () => {
    await writePersonalRoomProfile("user", "room", profileRecord)
    const db = await openDB(databaseName, 2)
    expect(db.objectStoreNames.contains("memories")).toBe(false)
    expect(db.objectStoreNames.contains("profiles")).toBe(true)
    db.close()
  })

  it("propagates browser storage failures without pretending a profile was saved", async () => {
    const failure = new Error("storage unavailable")
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw failure
      },
    })
    await expect(readPersonalRoomProfile("user", "room")).rejects.toBe(failure)
    await expect(writePersonalRoomProfile("user", "room", profileRecord)).rejects.toBe(failure)
  })

  it("rejects missing identity or diagram identifiers", async () => {
    await expect(readPersonalRoomProfile("", "room")).rejects.toThrow()
    await expect(writePersonalRoomProfile("user", " ", profileRecord)).rejects.toThrow()
  })
})
