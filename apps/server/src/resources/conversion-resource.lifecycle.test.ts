import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import type { Worker } from "node:worker_threads";
import { ConversionResource } from "./conversion-resource.js";

let fakes: FakeWorker[] = [];

class FakeWorker extends EventEmitter {
  terminated = false;
  postMessage() {}
  terminate() {
    this.terminated = true;
    queueMicrotask(() => this.emit("exit", 1));
    return Promise.resolve(1);
  }
}

class TestPool extends ConversionResource {
  protected override createWorker(): Worker {
    const w = new FakeWorker();
    fakes.push(w);
    return w as unknown as Worker;
  }
  get crashes(): number {
    return (this as unknown as { consecutiveCrashes: number })
      .consecutiveCrashes;
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const liveWorkers = () => fakes.filter((f) => !f.terminated).length;

describe("ConversionResource worker lifecycle", () => {
  beforeEach(() => {
    fakes = [];
    process.env.CONVERTER_POOL_MIN = "1";
    process.env.CONVERTER_POOL_MAX = "2";
  });
  afterEach(() => {
    delete process.env.CONVERTER_POOL_MIN;
    delete process.env.CONVERTER_POOL_MAX;
  });

  it("counts a real crash once and ignores the terminate's exit(1)", async () => {
    const pool = new TestPool();
    expect(fakes.length).toBe(1);

    fakes[0].emit("error", new Error("boom"));
    await tick();

    expect(pool.crashes).toBe(1);
    expect(liveWorkers()).toBe(1);
  });

  it("a stray exit(1) from an already-removed worker spawns nothing", async () => {
    const pool = new TestPool();
    const original = fakes[0];
    original.emit("error", new Error("boom"));
    await tick();
    const spawnedSoFar = fakes.length;

    original.emit("exit", 1);
    await tick();
    expect(fakes.length).toBe(spawnedSoFar);
    expect(liveWorkers()).toBe(1);
    expect(pool.crashes).toBe(1);
  });
});
