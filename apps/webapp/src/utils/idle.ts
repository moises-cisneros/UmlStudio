type IdleWindow = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback) => number;
  cancelIdleCallback?: (id: number) => void;
};

const IDLE_FALLBACK_MS = 120;

export const runWhenIdle = (callback: () => void): (() => void) => {
  const idleWindow = window as IdleWindow;
  if (typeof idleWindow.requestIdleCallback === "function") {
    const id = idleWindow.requestIdleCallback(() => callback());
    return () => idleWindow.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(callback, IDLE_FALLBACK_MS);
  return () => window.clearTimeout(id);
};

export const waitForIdle = (): Promise<void> =>
  new Promise((resolve) => {
    runWhenIdle(resolve);
  });
