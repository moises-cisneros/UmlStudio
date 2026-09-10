import type { UmlStudioEditor } from "@umlstudio/core";

type PerfProbe = {
  __perf: (
    skipDocumentEncoding?: boolean,
  ) => Record<string, number> | undefined;
};

type PerfHookWindow = Window & {
  __umlstudioPerf?: (
    skipDocumentEncoding?: boolean,
  ) => Record<string, number> | undefined;
};

export const installPerfHooks = (editor: UmlStudioEditor): (() => void) => {
  if (!(import.meta.env.DEV || import.meta.env.VITE_E2E === "true"))
    return () => {};
  if (!new URLSearchParams(window.location.search).has("perfHooks")) {
    return () => {};
  }

  const w = window as PerfHookWindow;
  const probe = editor as unknown as PerfProbe;
  w.__umlstudioPerf = (skipDocumentEncoding) =>
    probe.__perf(skipDocumentEncoding);

  return () => {
    delete w.__umlstudioPerf;
  };
};
