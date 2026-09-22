import { useTranslation, type Locale } from "@/i18n"
import { Tooltip, TooltipContent, TooltipTrigger } from "@umlstudio/ui/components/tooltip"

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useTranslation()

  const handleToggle = (newLocale: Locale) => {
    if (newLocale !== locale) {
      setLocale(newLocale)
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            role="group"
            aria-label={t.common.language}
            className="flex h-8 items-center rounded-lg border border-border-subtle bg-(--home-surface-raised) p-0.5 text-xs font-medium"
          >
            <button
              type="button"
              onClick={() => handleToggle("en")}
              data-active={locale === "en"}
              aria-pressed={locale === "en"}
              className={`rounded-md w-8 px-0 py-1 text-center transition-colors ${
                locale === "en"
                  ? "bg-(--dodger-blue) font-semibold text-white shadow-xs"
                  : "text-secondary-foreground hover:text-(--home-text-primary)"
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => handleToggle("es")}
              data-active={locale === "es"}
              aria-pressed={locale === "es"}
              className={`rounded-md w-8 px-0 py-1 text-center transition-colors ${
                locale === "es"
                  ? "bg-(--dodger-blue) font-semibold text-white shadow-xs"
                  : "text-secondary-foreground hover:text-(--home-text-primary)"
              }`}
            >
              ES
            </button>
          </div>
        }
      />
      <TooltipContent>
        <span>
          {t.common.language}: {locale === "en" ? "English" : "Español"}
        </span>
      </TooltipContent>
    </Tooltip>
  )
}
