import { appVersion } from "@/constants";
import { ISLAND_LAYOUT_STYLE } from "@/components/navbar/islandPrimitives";

export function HomeBrandPill() {
  return (
    <header
      role="banner"
      aria-label="Home"
      className="umlstudio-glass umlstudio-chrome-island"
      style={ISLAND_LAYOUT_STYLE}
      title={`UmlStudio ${appVersion}`}
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M3 9h18" />
          <path d="M9 21V9" />
        </svg>
      </div>
    </header>
  );
}
