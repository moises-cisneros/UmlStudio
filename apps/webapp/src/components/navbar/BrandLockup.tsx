import { appVersion } from "@/constants"

export const BrandLockup = () => {
  return (
    <div
      title={`UmlStudio ${appVersion}`}
      className="flex shrink-0 items-center gap-2 whitespace-nowrap"
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="18" height="15" x="3" y="3" rx="2" />
          <path d="M3 8h18" />
          <path d="M3 13h18" />
          <path d="m9 21 3-3 3 3" />
        </svg>
      </div>
      <span className="hidden overflow-visible pr-1 text-base leading-none font-bold tracking-[0.05em] whitespace-nowrap text-[color:var(--umlstudio-chrome-text)] uppercase min-[480px]:inline">
        UmlStudio
      </span>
    </div>
  )
}
