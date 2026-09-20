import { create } from "zustand"
import type { Locale, TranslationDictionary } from "./types"
import { en } from "./locales/en"
import { es } from "./locales/es"

const STORAGE_KEY = "umlstudio_locale"

const dictionaries: Record<Locale, TranslationDictionary> = {
  en,
  es,
}

const getInitialLocale = (): Locale => {
  if (typeof window === "undefined") return "en"
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === "es" || saved === "en") return saved
    if (typeof process !== "undefined" && (process.env.VITEST || process.env.NODE_ENV === "test")) {
      return "en"
    }
    const browserLang = navigator.language.slice(0, 2).toLowerCase()
    return browserLang === "es" ? "es" : "en"
  } catch {
    return "en"
  }
}

interface I18nState {
  locale: Locale
  setLocale: (locale: Locale) => void
  toggleLocale: () => void
  dictionary: TranslationDictionary
}

export const useI18nStore = create<I18nState>((set) => ({
  locale: getInitialLocale(),
  dictionary: dictionaries[getInitialLocale()],
  setLocale: (locale: Locale) => {
    try {
      localStorage.setItem(STORAGE_KEY, locale)
    } catch {
      // Intentionally ignore storage write errors
    }
    set({
      locale,
      dictionary: dictionaries[locale] ?? dictionaries.en,
    })
  },
  toggleLocale: () => {
    set((state) => {
      const nextLocale: Locale = state.locale === "en" ? "es" : "en"
      try {
        localStorage.setItem(STORAGE_KEY, nextLocale)
      } catch {
        // Intentionally ignore storage write errors
      }
      return {
        locale: nextLocale,
        dictionary: dictionaries[nextLocale],
      }
    })
  },
}))

export function useTranslation() {
  const locale = useI18nStore((state) => state.locale)
  const setLocale = useI18nStore((state) => state.setLocale)
  const toggleLocale = useI18nStore((state) => state.toggleLocale)
  const dictionary = useI18nStore((state) => state.dictionary)

  return {
    locale,
    setLocale,
    toggleLocale,
    t: dictionary,
  }
}
