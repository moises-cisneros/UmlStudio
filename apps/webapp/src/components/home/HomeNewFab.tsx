import { Plus } from "lucide-react";

export function HomeNewFab({ onNewDiagram }: { onNewDiagram?: () => void }) {
  return (
    <button
      type="button"
      onClick={onNewDiagram}
      aria-label="New diagram"
      className="umlstudio-chrome-accent-btn umlstudio-glass fixed bottom-[var(--umlstudio-chrome-edge-safe-bottom)] left-1/2 z-30 inline-flex h-12 -translate-x-1/2 cursor-pointer items-center justify-center gap-2 rounded-full border-0 pr-5 pl-4 text-sm font-semibold transition-transform active:scale-95 focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--umlstudio-chrome-accent)_50%,transparent)] focus-visible:outline-none md:hidden"
    >
      <Plus className="size-5" aria-hidden />
      New diagram
    </button>
  );
}
