import type { UMLModel } from "@umlstudio/core";
import { ApiError } from "@/services/DiagramApiClient";
import { MAX_LOCAL_VERSIONS_PER_DIAGRAM } from "@/constants";
import { log } from "@/logger";
import type { Diagram, VersionSummary } from "@/types";
import {
  getDb,
  type UmlStudioVersionsDBHandle,
  type UmlStudioVersionsTx,
  type VersionBodyRow,
  type VersionMetaRow,
} from "./idb";
import { planEviction } from "./eviction";
import type {
  CreateVersionResult,
  ListVersionsResponse,
  RestoreVersionResult,
  VersionRepository,
} from "./types";

const BROADCAST_CHANNEL = "umlstudio-versions";

type BroadcastInvalidate = { type: "invalidate"; diagramId: string };
type BroadcastMessage = BroadcastInvalidate;

let bc: BroadcastChannel | null = null;
function getBroadcast(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!bc) bc = new BroadcastChannel(BROADCAST_CHANNEL);
  return bc;
}

export function subscribeToLocalVersionEvents(
  handler: (msg: BroadcastInvalidate) => void,
): () => void {
  const channel = getBroadcast();
  if (!channel) return () => {};
  const listener = (event: MessageEvent<BroadcastMessage>) => {
    const data = event.data;
    if (data && data.type === "invalidate") handler(data);
  };
  channel.addEventListener("message", listener);
  return () => channel.removeEventListener("message", listener);
}

function broadcastInvalidate(diagramId: string): void {
  const channel = getBroadcast();
  if (!channel) return;
  channel.postMessage({
    type: "invalidate",
    diagramId,
  } satisfies BroadcastMessage);
}

function nowIso(): string {
  return new Date().toISOString();
}

function diagramRange(diagramId: string): IDBKeyRange {
  return IDBKeyRange.bound([diagramId], [diagramId, []], false, true);
}

function metaToSummary(m: VersionMetaRow): VersionSummary {
  return {
    id: m.id,
    diagramId: m.diagramId,
    name: m.name,
    description: m.description,
    createdAt: m.createdAt,
    kind: m.kind,
    librarySchemaVersion: m.librarySchemaVersion,
    seq: m.seq,
  };
}

function decodeBody(row: VersionBodyRow): Diagram {
  return JSON.parse(row.body) as Diagram;
}

function serializeBody(model: UMLModel | Diagram): string {
  return JSON.stringify(model);
}

let persistenceRequested = false;

export function __resetPersistenceForTests(): void {
  persistenceRequested = false;
}

async function requestPersistenceImpl(): Promise<void> {
  if (persistenceRequested) return;
  persistenceRequested = true;
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return;
  try {
    await navigator.storage.persist();
  } catch (err) {
    log.warn(
      "Failed to request persistent storage",
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function listSinglePage(
  db: UmlStudioVersionsDBHandle,
  diagramId: string,
  limit: number,
  before?: string,
): Promise<ListVersionsResponse> {
  const ascending = await db.getAllFromIndex(
    "versions",
    "by_diagram_seq",
    diagramRange(diagramId),
  );
  const newestFirst = ascending.slice().reverse();
  const total = newestFirst.length;
  let start = 0;
  if (before) {
    const idx = newestFirst.findIndex((v) => v.id === before);
    start = idx >= 0 ? idx + 1 : 0;
  }
  const slice = newestFirst.slice(start, start + limit);
  const versions = slice.map(metaToSummary);
  const last = slice.at(-1);
  const nextCursor = last && start + slice.length < total ? last.id : undefined;
  return { versions, nextCursor, total };
}

function mapQuotaError(err: unknown): never {
  if (
    err instanceof DOMException &&
    (err.name === "QuotaExceededError" || err.code === 22)
  ) {
    throw new ApiError(
      507,
      "BODY_TOO_LARGE",
      "Local storage is full — delete older versions or diagrams to save more.",
    );
  }
  throw err;
}

export const LocalVersionRepository = {
  kind: "local" as const,
  cap: MAX_LOCAL_VERSIONS_PER_DIAGRAM,

  async list(diagramId, opts = {}): Promise<ListVersionsResponse> {
    const db = await getDb();
    return listSinglePage(db, diagramId, opts.limit ?? 25, opts.before);
  },

  async create(diagramId, body, opts): Promise<CreateVersionResult> {
    const db = await getDb();
    const { row, evictedVersionIds, evictedKinds, totalAfter } =
      await commitVersion(db, {
        diagramId,
        body,
        meta: {
          id: crypto.randomUUID(),
          diagramId,
          name: (opts.name ?? "").trim(),
          description: (opts.description ?? "").trim(),
          createdAt: nowIso(),
          kind: "user",
          librarySchemaVersion: body.version,
        },
      });
    broadcastInvalidate(diagramId);
    return {
      ...metaToSummary(row),
      evictedVersionIds,
      evictedKinds,
      total: totalAfter,
      cap: MAX_LOCAL_VERSIONS_PER_DIAGRAM,
      headRev: undefined,
    };
  },

  async getBody(diagramId, versionId): Promise<Diagram> {
    const db = await getDb();
    const row = await db.get("versionBodies", [diagramId, versionId]);
    if (!row) {
      throw new ApiError(404, "NOT_FOUND", "Version body not found locally.");
    }
    return decodeBody(row);
  },

  async restore(diagramId, versionId, opts): Promise<RestoreVersionResult> {
    const db = await getDb();
    let autoSnapshotVersionId: string;
    try {
      const tx = db.transaction(
        ["versions", "versionBodies", "diagramMeta"],
        "readwrite",
      );
      const target = await tx.objectStore("versions").get(versionId);
      if (!target || target.diagramId !== diagramId) {
        throw new ApiError(404, "NOT_FOUND", "Version not found locally.");
      }
      const label =
        target.description.trim() || target.name.trim() || `v${target.seq}`;
      const { row } = await writeVersionInTx(tx, {
        diagramId,
        body: opts.currentBody,
        meta: {
          id: crypto.randomUUID(),
          diagramId,
          name: `Before restoring ${label}`,
          description: "",
          createdAt: nowIso(),
          kind: "auto",
          librarySchemaVersion: opts.currentBody.version,
        },
      });
      await tx.done;
      autoSnapshotVersionId = row.id;
    } catch (err) {
      mapQuotaError(err);
    }
    broadcastInvalidate(diagramId);
    return {
      autoSnapshotVersionId,
      updatedAt: nowIso(),
      headRev: undefined,
    };
  },

  async editInfo(diagramId, versionId, patch): Promise<VersionSummary> {
    const db = await getDb();
    const tx = db.transaction("versions", "readwrite");
    const existing = await tx.store.get(versionId);
    if (!existing || existing.diagramId !== diagramId) {
      throw new ApiError(404, "NOT_FOUND", "Version not found locally.");
    }
    const next: VersionMetaRow = {
      ...existing,
      name: patch.name !== undefined ? patch.name.trim() : existing.name,
      description:
        patch.description !== undefined
          ? patch.description.trim()
          : existing.description,
    };
    await tx.store.put(next);
    await tx.done;
    broadcastInvalidate(diagramId);
    return metaToSummary(next);
  },

  async delete(diagramId, versionId): Promise<void> {
    const db = await getDb();
    const tx = db.transaction(["versions", "versionBodies"], "readwrite");
    const target = await tx.objectStore("versions").get(versionId);
    if (!target || target.diagramId !== diagramId) {
      throw new ApiError(404, "NOT_FOUND", "Version not found locally.");
    }
    await tx.objectStore("versions").delete(versionId);
    await tx.objectStore("versionBodies").delete([diagramId, versionId]);
    await tx.done;
    broadcastInvalidate(diagramId);
  },

  permalink(): string | null {
    return null;
  },

  requestPersistence(): Promise<void> {
    return requestPersistenceImpl();
  },

  async purgeDiagram(diagramId): Promise<void> {
    const db = await getDb();
    const tx = db.transaction(
      ["versions", "versionBodies", "diagramMeta"],
      "readwrite",
    );
    const versionsStore = tx.objectStore("versions");
    const ids = await versionsStore
      .index("by_diagram_seq")
      .getAllKeys(diagramRange(diagramId));
    for (const id of ids) {
      await versionsStore.delete(id);
    }
    const bodiesStore = tx.objectStore("versionBodies");
    let cursor = await bodiesStore.openCursor(diagramRange(diagramId));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.objectStore("diagramMeta").delete(diagramId);
    await tx.done;
    broadcastInvalidate(diagramId);
  },
} satisfies VersionRepository;

interface WriteVersionResult {
  row: VersionMetaRow;
  evictedVersionIds: string[];
  evictedKinds: ("unnamed" | "named")[];
  totalAfter: number;
}

async function writeVersionInTx(
  tx: UmlStudioVersionsTx,
  args: {
    diagramId: string;
    body: UMLModel;
    meta: Omit<VersionMetaRow, "seq">;
  },
): Promise<WriteVersionResult> {
  const { diagramId, body, meta } = args;
  const diagramMeta = (await tx.objectStore("diagramMeta").get(diagramId)) ?? {
    diagramId,
    headSeq: 0,
  };
  const seq = diagramMeta.headSeq + 1;
  const row: VersionMetaRow = { ...meta, seq };
  await tx.objectStore("versions").add(row);
  await tx
    .objectStore("versionBodies")
    .put({ diagramId, id: row.id, body: serializeBody(body) });

  const rows = await tx
    .objectStore("versions")
    .index("by_diagram_seq")
    .getAll(diagramRange(diagramId));
  const plan = planEviction({ rows, cap: MAX_LOCAL_VERSIONS_PER_DIAGRAM });
  for (const evictedId of plan.evictedVersionIds) {
    await tx.objectStore("versions").delete(evictedId);
    await tx.objectStore("versionBodies").delete([diagramId, evictedId]);
  }

  await tx.objectStore("diagramMeta").put({ diagramId, headSeq: seq });
  return {
    row,
    evictedVersionIds: plan.evictedVersionIds,
    evictedKinds: plan.evictedKinds,
    totalAfter: rows.length - plan.evictedVersionIds.length,
  };
}

async function commitVersion(
  db: UmlStudioVersionsDBHandle,
  args: {
    diagramId: string;
    body: UMLModel;
    meta: Omit<VersionMetaRow, "seq">;
  },
): Promise<WriteVersionResult> {
  try {
    const tx = db.transaction(
      ["versions", "versionBodies", "diagramMeta"],
      "readwrite",
    );
    const result = await writeVersionInTx(tx, args);
    await tx.done;
    return result;
  } catch (err) {
    mapQuotaError(err);
  }
}
