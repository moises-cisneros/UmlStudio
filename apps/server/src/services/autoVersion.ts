import { ulid } from "ulid";
import { fcall, gunzipJson, gzipJson, k, type Redis } from "../redis.js";
import type { Config } from "../config.js";
import type { Diagram } from "../types.js";
import type { RelayHook } from "../http/app.js";
import { logger } from "../logger.js";

interface AutoVersionDeps {
  config: Config;
  redis: Redis;
  relay: RelayHook | undefined;
}

const inflight = new Set<Promise<void>>();

/** Test helper. Resolves once every started `tryAutoVersion` has settled. */
export async function drainAutoVersionInflight(): Promise<void> {
  while (inflight.size > 0) {
    await Promise.allSettled([...inflight]);
  }
}

const VOLATILE_KEYS = new Set([
  "selected",
  "dragging",
  "resizing",
  "hidden",
  "measured",
  "selectable",
  "draggable",
  "connectable",
  "deletable",
]);

function structuralFingerprint(d: Diagram): string {
  return JSON.stringify(
    {
      title: d.title,
      type: d.type,
      version: d.version,
      nodes: d.nodes,
      edges: d.edges,
      assessments: d.assessments,
    },
    (key, value) => (VOLATILE_KEYS.has(key) ? undefined : value),
  );
}

export function tryAutoVersion(
  deps: AutoVersionDeps,
  diagramId: string,
  head: Diagram,
): Promise<void> {
  const p = runAutoVersion(deps, diagramId, head);
  inflight.add(p);
  p.finally(() => inflight.delete(p)).catch(() => undefined);
  return p;
}

async function runAutoVersion(
  { config, redis, relay }: AutoVersionDeps,
  diagramId: string,
  head: Diagram,
): Promise<void> {
  if (head.nodes.length === 0 && head.edges.length === 0) return;

  const marker = k.autoVersionMarker(diagramId);
  const acquired = await redis.set(marker, "1", {
    NX: true,
    EX: config.AUTO_VERSION_INTERVAL_SECONDS,
  });
  if (acquired !== "OK") return;

  let didCommit = false;
  try {
    const latestIds = (await redis.zRange(k.versionsIndex(diagramId), 0, 0, {
      REV: true,
    })) as string[];
    const latestId = latestIds[0];
    if (!latestId) {
      didCommit = true;
      return;
    }
    const raw = await redis.get(k.versionBody(diagramId, latestId));
    if (raw) {
      const latest = gunzipJson<Diagram>(raw);
      if (structuralFingerprint(latest) === structuralFingerprint(head)) {
        didCommit = true;
        return;
      }
    }

    const vid = ulid();
    const nowMs = Date.now();
    await fcall(
      redis,
      "commit_snapshot",
      [
        k.diagram(diagramId),
        k.versionsIndex(diagramId),
        k.diagramMeta(diagramId),
      ],
      [
        vid,
        String(nowMs),
        String(config.VERSION_TTL_SECONDS),
        String(config.MAX_VERSIONS_PER_DIAGRAM),
        "",
        "",
        "auto",
        head.version,
        gzipJson(head),
        head.userId ?? "",
      ],
    );
    didCommit = true;

    relay?.publishControl(diagramId, {
      type: "VERSION_CREATED",
      versionId: vid,
      createdAt: new Date(nowMs).toISOString(),
      name: "",
      kind: "auto",
    });

    logger.info(
      {
        event: "version.auto.created",
        diagramId,
        versionId: vid,
        librarySchemaVersion: head.version,
      },
      "auto-version committed",
    );
  } finally {
    if (!didCommit) {
      await redis.del(marker).catch((err) => {
        logger.error(
          { err, diagramId, event: "version.auto.markerCleanupFailed" },
          "failed to release auto-version marker after error",
        );
      });
    }
  }
}
