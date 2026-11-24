/**
 * Interface-locale configuration for EVALORA.
 *
 * `interfaceLocale` is the language of the APPLICATION SHELL only. Examination
 * content has its own independent `exam_content_language` (see lib/examLanguage)
 * and is never translated or altered by this preference.
 */
export type Locale = "en" | "fr" | "es";

export const LOCALES: Locale[] = ["en", "fr", "es"];

export const DEFAULT_LOCALE: Locale = "en";

/** Professional, native language labels — exactly as shown in the selector. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
};

/** BCP-47 tags used for Intl date/number/time formatting. */
export const LOCALE_TAGS: Record<Locale, string> = {
  en: "en-GB",
  fr: "fr-FR",
  es: "es-ES",
};

/** Persistent preference cookie — works for authenticated AND anonymous users. */
export const LOCALE_COOKIE = "evalora_locale";

export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as string[]).includes(value);
}

/** Resolve a stored preference (cookie / profile) to a supported locale. */
export function resolveLocale(value: unknown): Locale {
  if (isLocale(value)) return value;
  if (typeof value === "string") {
    const base = value.toLowerCase().split(/[-_]/)[0];
    if (base === "fr") return "fr";
    if (base === "es") return "es";
    if (base === "en") return "en";
  }
  return DEFAULT_LOCALE;
}
