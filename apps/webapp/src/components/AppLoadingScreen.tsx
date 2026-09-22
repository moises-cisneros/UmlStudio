type AppLoadingScreenProps = {
  label?: string
  variant?: "page" | "panel"
}

export const AppLoadingScreen = ({
  label = "Loading workspace...",
  variant = "page",
}: AppLoadingScreenProps) => {
  return (
    <div
      className={`app-loading-screen app-loading-screen--${variant}`}
      role="status"
      aria-label={label}
      aria-live="polite"
    >
      <div className="app-loading-content">
        <div className="app-loading-logo-shell flex items-center justify-center">
          <svg
            className="h-14 w-14 text-primary"
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
        <span className="app-loading-progress" aria-hidden="true" />
      </div>
    </div>
  )
}
