import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { useThemeStore } from "./stores/useThemeStore.tsx";
import { usePersistenceModelStore } from "./stores/usePersistenceModelStore.tsx";
import { runLegacyMigrationIfNeeded } from "./services/legacyMigration";
import { log } from "./logger";
import {
  setLogger as setUmlStudioLogger,
  setLogLevel as setUmlStudioLogLevel,
} from "@umlstudio/core";
import { Keyboard } from "@capacitor/keyboard";
import {
  notifyLiveUpdateReady,
  checkForLiveUpdate,
} from "./services/liveUpdate";

const rootElement = document.getElementById("root");

useThemeStore.getState().initializeTheme();

Keyboard.setScroll({ isDisabled: true }).catch(() => {});

if (import.meta.env.DEV || import.meta.env.VITE_E2E === "true") {
  const SIDES = ["top", "right", "bottom", "left"] as const;
  const applySafeArea = (value: number | number[] | null) => {
    const root = document.documentElement.style;
    if (value === null) {
      SIDES.forEach((s) => root.removeProperty(`--safe-area-inset-${s}`));
      return;
    }
    const px = Array.isArray(value) ? value : [value, value, value, value];
    SIDES.forEach((s, i) =>
      root.setProperty(`--safe-area-inset-${s}`, `${px[i] ?? 0}px`),
    );
  };
  const saved = localStorage.getItem("umlstudio:safe-area-sim");
  if (saved) {
    try {
      applySafeArea(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }
  (window as unknown as Record<string, unknown>).__umlstudioSafeArea = (
    value: number | number[] | null,
  ) => {
    if (value === null) localStorage.removeItem("umlstudio:safe-area-sim");
    else localStorage.setItem("umlstudio:safe-area-sim", JSON.stringify(value));
    applySafeArea(value);
  };
}

const umlstudioSink = {
  debug: (...args: unknown[]) => log.debug(...args),
  warn: (...args: unknown[]) => log.warn(...args),
  error: (...args: unknown[]) => log.error(...args),
};

setUmlStudioLogger(umlstudioSink);
setUmlStudioLogLevel(import.meta.env.DEV ? "debug" : "warn");

function startLegacyMigration() {
  if (usePersistenceModelStore.persist.hasHydrated()) {
    void runLegacyMigrationIfNeeded();
  } else {
    const unsubscribe = usePersistenceModelStore.persist.onFinishHydration(
      () => {
        unsubscribe();
        void runLegacyMigrationIfNeeded();
      },
    );
  }
}

startLegacyMigration();

if (rootElement) {
  createRoot(rootElement).render(<App />);
  void notifyLiveUpdateReady();
  void checkForLiveUpdate();
} else {
  log.error("Root element not found");
}
