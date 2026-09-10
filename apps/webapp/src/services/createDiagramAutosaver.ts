import type { UMLModel } from "@umlstudio/core";
import { ApiError, DiagramApiClient } from "@/services/DiagramApiClient";
import { log } from "@/logger";

interface AutosaverOptions {
  diagramId: string;
  getModel: () => UMLModel | undefined;
  isPaused: () => boolean;
  collaboration: boolean;
  debounceMs?: number;
  maxWaitMs?: number;
  maxRebaseRetries?: number;
  onError?: (err: unknown) => void;
  onSaved?: () => void;
}

export interface DiagramAutosaver {
  schedule(): void;
  flush(): Promise<void>;
  setHeadRev(headRev: number | undefined): void;
  dispose(): void;
}

export function createDiagramAutosaver(
  opts: AutosaverOptions,
): DiagramAutosaver {
  const debounceMs = opts.debounceMs ?? 1500;
  const maxWaitMs = opts.maxWaitMs ?? 5000;
  const maxRebaseRetries = opts.maxRebaseRetries ?? 3;

  let dirty = false;
  let stopScheduling = false;
  let lastHeadRev: number | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;

  const clearTimers = () => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (maxWaitTimer !== null) {
      clearTimeout(maxWaitTimer);
      maxWaitTimer = null;
    }
  };

  const putOnce = async (model: UMLModel): Promise<boolean> => {
    let attempt = 0;
    let ifMatch = lastHeadRev;
    for (;;) {
      try {
        const res = await DiagramApiClient.sendDiagramUpdate(
          opts.diagramId,
          model,
          { ifMatch },
        );
        lastHeadRev = res.headRev;
        return true;
      } catch (err) {
        if (
          err instanceof ApiError &&
          err.code === "REVISION_MISMATCH" &&
          opts.collaboration &&
          attempt < maxRebaseRetries
        ) {
          attempt += 1;
          const meta = err.meta as { currentHeadRev?: number } | undefined;
          if (typeof meta?.currentHeadRev === "number") {
            ifMatch = meta.currentHeadRev;
          } else {
            const head = await DiagramApiClient.fetchDiagram(opts.diagramId);
            ifMatch = (head as { headRev?: number }).headRev;
          }
          lastHeadRev = ifMatch;
          const next = opts.getModel();
          if (!next) return false;
          model = next;
          continue;
        }
        if (err instanceof ApiError && err.code === "REVISION_MISMATCH") {
          const meta = err.meta as { currentHeadRev?: number } | undefined;
          if (typeof meta?.currentHeadRev === "number") {
            lastHeadRev = meta.currentHeadRev;
          }
          return false;
        }
        throw err;
      }
    }
  };

  const armDebounce = () => {
    if (stopScheduling) return;
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (dirty && opts.isPaused()) armDebounce();
      else void runSave();
    }, debounceMs);
  };

  const save = async () => {
    clearTimers();
    if (!dirty || opts.isPaused()) return;
    const model = opts.getModel();
    if (!model) return;
    dirty = false;
    try {
      if (await putOnce(model)) opts.onSaved?.();
      else dirty = true;
    } catch (err) {
      dirty = true;
      log.error("Autosave failed", err);
      opts.onError?.(err);
    }
  };

  const runSave = (): Promise<void> => {
    const prev = inFlight;
    const run: Promise<void> = (
      prev
        ? prev.then(() => {
            if (dirty && !opts.isPaused()) return save();
          })
        : save()
    ).finally(() => {
      if (inFlight === run) inFlight = null;
    });
    inFlight = run;
    return run;
  };

  return {
    schedule() {
      if (stopScheduling) return;
      dirty = true;
      armDebounce();
      if (maxWaitTimer === null) {
        maxWaitTimer = setTimeout(() => {
          maxWaitTimer = null;
          if (dirty && opts.isPaused()) armDebounce();
          else void runSave();
        }, maxWaitMs);
      }
    },
    async flush() {
      clearTimers();
      await runSave();
    },
    setHeadRev(headRev) {
      lastHeadRev = headRev;
      dirty = false;
    },
    dispose() {
      stopScheduling = true;
      clearTimers();
    },
  };
}
