import { openDB, type DBSchema, type IDBPDatabase } from "idb"

interface PersonalRoomMemoryDB extends DBSchema {
  memories: {
    key: [string, string]
    value: string
  }
}

function keyFor(userId: string, diagramId: string): [string, string] {
  if (!userId.trim() || !diagramId.trim()) {
    throw new Error("A user ID and diagram ID are required for personal memory")
  }
  return [userId, diagramId]
}

async function withDatabase<T>(
  action: (db: IDBPDatabase<PersonalRoomMemoryDB>) => Promise<T>
): Promise<T> {
  const db = await openDB<PersonalRoomMemoryDB>("umlstudio-personal-room-memory", 1, {
    upgrade(database) {
      database.createObjectStore("memories")
    },
  })
  try {
    return await action(db)
  } finally {
    db.close()
  }
}

export async function readPersonalRoomMemory(
  userId: string,
  diagramId: string
): Promise<string | null> {
  const key = keyFor(userId, diagramId)
  return withDatabase(async (db) => (await db.get("memories", key)) ?? null)
}

export async function writePersonalRoomMemory(
  userId: string,
  diagramId: string,
  memory: string
): Promise<void> {
  const key = keyFor(userId, diagramId)
  await withDatabase(async (db) => {
    await db.put("memories", memory, key)
  })
}

export async function deletePersonalRoomMemory(userId: string, diagramId: string): Promise<void> {
  const key = keyFor(userId, diagramId)
  await withDatabase(async (db) => {
    await db.delete("memories", key)
  })
}
