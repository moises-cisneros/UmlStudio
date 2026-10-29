import { openDB, type DBSchema, type IDBPDatabase } from "idb"

interface PersonalRoomProfileDB extends DBSchema {
  profiles: {
    key: [string, string]
    value: PersonalRoomProfileRecord
  }
}

export interface PersonalRoomTeachingProfile {
  detailLevel: "concise" | "balanced" | "step_by_step"
  exampleStyle: "uml" | "code" | "analogy" | "none"
}

export interface PersonalRoomProfileRecord {
  profile: PersonalRoomTeachingProfile
  revision: string
}

function keyFor(userId: string, diagramId: string): [string, string] {
  if (!userId.trim() || !diagramId.trim()) {
    throw new Error("A user ID and diagram ID are required for the Room profile")
  }
  return [userId, diagramId]
}

async function withDatabase<T>(
  action: (db: IDBPDatabase<PersonalRoomProfileDB>) => Promise<T>
): Promise<T> {
  const db = await openDB<PersonalRoomProfileDB>("umlstudio-personal-room-memory", 2, {
    upgrade(database) {
      if (!database.objectStoreNames.contains("profiles")) database.createObjectStore("profiles")
    },
  })
  try {
    return await action(db)
  } finally {
    db.close()
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isTeachingProfile(value: unknown): value is PersonalRoomTeachingProfile {
  if (!isRecord(value)) return false
  return (
    ["concise", "balanced", "step_by_step"].includes(String(value.detailLevel)) &&
    ["uml", "code", "analogy", "none"].includes(String(value.exampleStyle))
  )
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
}

function isStoredProfile(value: unknown): value is {
  profile: PersonalRoomTeachingProfile
  revision: string
  status?: "approved"
} {
  return (
    isRecord(value) &&
    isTeachingProfile(value.profile) &&
    isUuid(value.revision) &&
    (value.status === undefined || value.status === "approved")
  )
}

export async function readPersonalRoomProfile(
  userId: string,
  diagramId: string
): Promise<PersonalRoomProfileRecord | null> {
  const key = keyFor(userId, diagramId)
  return withDatabase(async (db) => {
    const stored: unknown = await db.get("profiles", key)
    if (stored === undefined) return null
    if (!isStoredProfile(stored)) return null
    // Normalize profiles written by the previous, explicit-approval flow.
    return {
      profile: {
        detailLevel: stored.profile.detailLevel,
        exampleStyle: stored.profile.exampleStyle,
      },
      revision: stored.revision,
    }
  })
}

export async function writePersonalRoomProfile(
  userId: string,
  diagramId: string,
  record: PersonalRoomProfileRecord
): Promise<void> {
  const key = keyFor(userId, diagramId)
  if (!isTeachingProfile(record.profile) || !isUuid(record.revision)) {
    throw new Error("The Room teaching profile is invalid")
  }
  await withDatabase(async (db) => {
    await db.put(
      "profiles",
      {
        profile: {
          detailLevel: record.profile.detailLevel,
          exampleStyle: record.profile.exampleStyle,
        },
        revision: record.revision,
      },
      key
    )
  })
}
