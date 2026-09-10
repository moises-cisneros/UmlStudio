import { Worker } from "node:worker_threads";
import os from "node:os";
import path from "node:path";
import type { UMLModel } from "@umlstudio/core";
import { Errors } from "../http/errors.js";
import type { ConversionFormat } from "../workers/conversion-worker-thread.js";

export type ConversionOutput = { mime: string; data: Buffer | string };

type Job = {
  id: number;
  format: ConversionFormat;
  model: UMLModel;
  scale?: number;
  enqueuedAt: number;
  resolve: (output: ConversionOutput) => void;
  reject: (error: Error) => void;
};

type WorkerMessage =
  | { id: number; ok: true; mime: string; data: string | Uint8Array }
  | { id: number; ok: false; error: string; code?: string };

export class QueueFullError extends Error {}

const PER_WORKER_MB_BASE = 80;
const RENDER_DEADLINE_MS: Record<ConversionFormat, number> = {
  svg: Number(process.env.CONVERTER_TIMEOUT_SVG_MS ?? 10_000),
  png: Number(process.env.CONVERTER_TIMEOUT_PNG_MS ?? 15_000),
  pdf: Number(process.env.CONVERTER_TIMEOUT_PDF_MS ?? 30_000),
};

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

function computePoolMax(workerHeapMb: number): number {
  const cores = os.availableParallelism();
  const cpuDerived = cores >= 4 ? cores - 1 : cores;
  const perWorkerMb = workerHeapMb + PER_WORKER_MB_BASE;
  const budgetMb = 0.6 * (os.totalmem() / 1e6);
  const memDerived = Math.max(1, Math.floor(budgetMb / perWorkerMb));
  const derived = clamp(Math.min(cpuDerived, memDerived), 1, 32);
  const override = Number(process.env.CONVERTER_POOL_MAX);
  return Number.isFinite(override) && override >= 1
    ? clamp(override, 1, 64)
    : derived;
}

type PooledWorker = {
  worker: Worker;
  busy: boolean;
  idleSince: number;
  renders: number;
  active: { id: number; timeout: NodeJS.Timeout; job: Job } | undefined;
};

/**
 * Pool of worker threads for model -> image/PDF conversion.
 * Maintains a warm pool of workers, recycles old ones, and מקס queue growth
 * to prevent slow clients from hogging resources.
 */
export class ConversionResource {
  private readonly workerMaxOldGenerationMb = Number(
    process.env.CONVERTER_WORKER_MAX_OLD_SPACE_MB ?? 256,
  );
  private readonly workerStackMb = Number(
    process.env.CONVERTER_WORKER_STACK_MB ?? 8,
  );
  private readonly poolMax = computePoolMax(this.workerMaxOldGenerationMb);
  private readonly poolMin = clamp(
    Number(process.env.CONVERTER_POOL_MIN ?? 1),
    1,
    this.poolMax,
  );
  private readonly maxQueueLength = clamp(
    Number(process.env.CONVERTER_MAX_QUEUE_LENGTH ?? this.poolMax * 8),
    8,
    512,
  );
  private readonly maxQueueWaitMs = Number(
    process.env.CONVERTER_MAX_QUEUE_WAIT_MS ?? 10_000,
  );
  private readonly recycleAfterRenders = Number(
    process.env.CONVERTER_RECYCLE_AFTER_RENDERS ?? 500,
  );
  private readonly crashBackoffMaxMs = Number(
    process.env.CONVERTER_CRASH_BACKOFF_MAX_MS ?? 5_000,
  );

  private workers: PooledWorker[] = [];
  private queue: Job[] = [];
  private nextId = 1;
  private consecutiveCrashes = 0;

  constructor() {
    for (let i = 0; i < this.poolMin; i++) this.spawn();
    setInterval(() => this.reapIdle(), 15_000).unref();
  }

  protected createWorker(): Worker {
    const fromSource = import.meta.url.endsWith(".ts");
    const workerPath =
      process.env.CONVERTER_WORKER_PATH ??
      path.resolve(
        import.meta.dirname,
        fromSource
          ? "../workers/conversion-worker-dev.mjs"
          : "../workers/conversion-worker-thread.js",
      );
    return new Worker(workerPath, {
      env: { ...process.env },
      resourceLimits: {
        maxOldGenerationSizeMb: this.workerMaxOldGenerationMb,
        stackSizeMb: this.workerStackMb,
      },
    });
  }

  private spawn(): PooledWorker {
    const pw: PooledWorker = {
      worker: this.createWorker(),
      busy: false,
      idleSince: Date.now(),
      renders: 0,
      active: undefined,
    };
    pw.worker.on("message", (m: WorkerMessage) => this.onMessage(pw, m));
    pw.worker.on("error", (e) =>
      this.onExit(pw, e instanceof Error ? e : new Error(String(e))),
    );
    pw.worker.on("exit", (code) => {
      if (code !== 0) {
        this.onExit(
          pw,
          new Error(`Conversion worker exited with code ${code}`),
        );
      }
    });
    this.workers.push(pw);
    return pw;
  }

  private onMessage(pw: PooledWorker, message: WorkerMessage) {
    if (!pw.active || pw.active.id !== message.id) return;
    clearTimeout(pw.active.timeout);
    const { job } = pw.active;
    pw.active = undefined;
    pw.busy = false;
    pw.idleSince = Date.now();
    pw.renders += 1;
    this.consecutiveCrashes = 0;

    if (message.ok) {
      job.resolve({
        mime: message.mime,
        data:
          typeof message.data === "string"
            ? message.data
            : Buffer.from(message.data),
      });
    } else if (message.code === "INVALID_MODEL_GEOMETRY") {
      job.reject(
        Errors.invalidParams(message.error.split("\n")[0] || message.error),
      );
    } else {
      job.reject(new Error(message.error));
    }

    if (pw.renders >= this.recycleAfterRenders) this.retire(pw);
    this.dispatch();
  }
  private onExit(pw: PooledWorker, error: Error) {
    if (!this.workers.includes(pw)) return;
    this.workers = this.workers.filter((w) => w !== pw);

    if (pw.active) {
      clearTimeout(pw.active.timeout);
      pw.active.job.reject(error);
      pw.active = undefined;
    }
    void pw.worker.terminate().catch(() => undefined);

    this.consecutiveCrashes += 1;
    const backoff = Math.min(
      250 * 2 ** (this.consecutiveCrashes - 1),
      this.crashBackoffMaxMs,
    );
    const respawn = () => {
      if (this.queue.length > 0 || this.workers.length < this.poolMin) {
        this.spawn();
      }
      this.dispatch();
    };
    if (this.consecutiveCrashes <= 1) respawn();
    else setTimeout(respawn, backoff).unref();
  }
  private retire(pw: PooledWorker) {
    this.workers = this.workers.filter((w) => w !== pw);
    void pw.worker.terminate().catch(() => undefined);
    if (this.workers.length < this.poolMin) this.spawn();
  }

  private reapIdle() {
    const now = Date.now();
    const idleTtlMs = Number(process.env.CONVERTER_IDLE_TTL_MS ?? 60_000);
    for (const pw of [...this.workers]) {
      if (
        !pw.busy &&
        this.workers.length > this.poolMin &&
        now - pw.idleSince >= idleTtlMs
      ) {
        this.workers = this.workers.filter((w) => w !== pw);
        void pw.worker.terminate().catch(() => undefined);
      }
    }
  }

  private dispatch() {
    const now = Date.now();
    while (this.queue.length > 0) {
      const head = this.queue[0]!;
      if (now - head.enqueuedAt <= this.maxQueueWaitMs) break;
      this.queue.shift();
      head.reject(new QueueFullError("Conversion queue wait exceeded"));
    }
    if (this.queue.length === 0) return;

    let pw = this.workers.find((w) => !w.busy);
    if (!pw && this.workers.length < this.poolMax) pw = this.spawn();
    if (!pw) return;

    const job = this.queue.shift()!;
    pw.busy = true;
    const timeout = setTimeout(
      () => this.onExit(pw!, new Error("Conversion worker timed out")),
      RENDER_DEADLINE_MS[job.format],
    );
    pw.active = { id: job.id, timeout, job };
    pw.worker.postMessage({
      id: job.id,
      model: job.model,
      format: job.format,
      scale: job.scale,
    });
    if (this.queue.length > 0) this.dispatch();
  }

  render = async (
    format: ConversionFormat,
    model: UMLModel,
    scale?: number,
  ): Promise<ConversionOutput> => {
    if (this.queue.length >= this.maxQueueLength) {
      throw new QueueFullError("Conversion queue is full");
    }
    return await new Promise<ConversionOutput>((resolve, reject) => {
      this.queue.push({
        id: this.nextId++,
        format,
        model,
        enqueuedAt: Date.now(),
        resolve,
        reject,
        ...(scale !== undefined ? { scale } : {}),
      });
      this.dispatch();
    });
  };
}
