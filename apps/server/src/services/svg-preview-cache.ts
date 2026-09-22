export class SvgPreviewCache {
  private readonly lru = new Map<string, string>()
  private readonly inflight = new Map<string, Promise<string>>()
  private readonly maxEntries: number

  constructor(maxEntries = Number(process.env.CONVERTER_PREVIEW_CACHE_MAX ?? 256)) {
    this.maxEntries = Math.max(1, maxEntries)
  }

  /**
   * Returns the cached SVG for `key`, joins an in-flight render for it, or runs
   * `produce()` once and caches the result. `produce` rejections propagate to
   * all joiners and are not cached.
   */
  async render(key: string, produce: () => Promise<string>): Promise<string> {
    const cached = this.lru.get(key)
    if (cached !== undefined) {
      this.lru.delete(key)
      this.lru.set(key, cached)
      return cached
    }

    const existing = this.inflight.get(key)
    if (existing) return existing

    const promise = produce()
      .then((svg) => {
        this.store(key, svg)
        return svg
      })
      .finally(() => this.inflight.delete(key))
    this.inflight.set(key, promise)
    return promise
  }

  private store(key: string, svg: string) {
    this.lru.set(key, svg)
    while (this.lru.size > this.maxEntries) {
      const oldest = this.lru.keys().next().value
      if (oldest === undefined) break
      this.lru.delete(oldest)
    }
  }
}
