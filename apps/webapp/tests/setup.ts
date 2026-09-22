class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

if (typeof globalThis.IntersectionObserver === "undefined") {
  Object.assign(globalThis, { IntersectionObserver: NoopObserver })
}
if (typeof globalThis.ResizeObserver === "undefined") {
  Object.assign(globalThis, { ResizeObserver: NoopObserver })
}

export {}
