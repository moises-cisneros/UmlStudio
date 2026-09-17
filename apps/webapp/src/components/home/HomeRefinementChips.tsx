import { XIcon } from "lucide-react";
import type { HomeChrome } from "./useHomeChrome";

export function HomeRefinementChips({ chrome }: { chrome: HomeChrome }) {
  const { activeRefinements } = chrome;

  if (activeRefinements.length === 0) {
    return null;
  }

  return (
    <div
      role="group"
      aria-label="Active filters"
      className="umlstudio-glass flex w-full flex-wrap items-center gap-[var(--umlstudio-chrome-gap)] p-[var(--umlstudio-chrome-pad)] md:inline-flex md:w-fit md:flex-nowrap"
      style={{
        maxWidth: "100%",
        borderRadius: "var(--umlstudio-chrome-radius-lg)",
      }}
    >
      {activeRefinements.map((refinement) => (
        <button
          key={refinement.key}
          type="button"
          onClick={refinement.clear}
          aria-label={`Remove ${refinement.label} filter`}
          className="inline-flex min-h-9 max-w-[min(100%,14rem)] min-w-0 cursor-pointer items-center gap-1 rounded-[var(--umlstudio-chrome-radius-sm)] border border-[color:var(--umlstudio-chrome-border)] bg-[var(--umlstudio-chrome-surface-hover)] px-2.5 text-xs font-medium text-[color:var(--umlstudio-chrome-text)] transition-colors hover:bg-[var(--umlstudio-chrome-surface-active)] focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--umlstudio-chrome-accent)_45%,transparent)] focus-visible:outline-none"
        >
          <span className="min-w-0 truncate">{refinement.label}</span>
          <XIcon className="size-3 shrink-0 opacity-70" aria-hidden />
        </button>
      ))}
      <button
        type="button"
        onClick={chrome.resetAll}
        className="inline-flex min-h-9 cursor-pointer items-center rounded-[var(--umlstudio-chrome-radius-sm)] px-2 text-xs font-medium whitespace-nowrap text-[color:var(--umlstudio-chrome-text)] transition-colors hover:bg-[var(--umlstudio-chrome-surface-hover)] focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--umlstudio-chrome-accent)_45%,transparent)] focus-visible:outline-none"
      >
        Clear all
      </button>
    </div>
  );
}
