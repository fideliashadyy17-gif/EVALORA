/**
 * Server-only i18n helpers (they read the request cookie via next/headers).
 * Kept apart from `@/lib/i18n` so client components can import the pure
 * translation runtime without pulling the Server Component cookie API into
 * the client bundle.
 */
import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_COOKIE,
  isLocale,
  resolveLocale,
  type Locale,
} from "./config";
import { getDictionary, translate, type Dictionary, type TranslateParams } from "./index";

/**
 * Server-side locale resolution:
 *   1. the `evalora_locale` cookie (anonymous + signed-in, immediate),
 *   2. the signed-in user's stored profile preference (new device / no cookie),
 *   3. the CONFIGURED platform/organization default
 *      (localization.default_locale, Platform Control Center → Language &
 *      region), constrained to localization.supported_locales,
 *   4. the compiled-in default (en).
 *
 * Step 3 replaced a hardcoded `DEFAULT_LOCALE`: before the Control Center an
 * administrator could not choose the platform's default interface language
 * without a code change.
 */
export async function getRequestLocale(): Promise<Locale> {
  try {
    const jar = await cookies();
    const cookieValue = jar.get(LOCALE_COOKIE)?.value;
    if (isLocale(cookieValue)) return cookieValue;
    if (typeof cookieValue === "string" && cookieValue.length > 0) {
      // A stale/unknown cookie still resolves through the normalizer (e.g. "fr-CA").
      const resolved = resolveLocale(cookieValue);
      if (resolved !== DEFAULT_LOCALE) return resolved;
    }
    // No usable cookie → restore the server-stored per-user preference.
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        const { data } = await supabase
          .from("profiles")
          .select("interface_locale")
          .eq("id", auth.user.id)
          .maybeSingle();
        if (isLocale(data?.interface_locale)) return data.interface_locale;
      }
    } catch {
      // fall through to default
    }
  } catch {
    // no request cookies (static render) → default
  }
  return configuredDefaultLocale();
}

/**
 * Locales the platform currently offers, resolved from configuration. Falls
 * back to every bundled dictionary when configuration is unreachable, so the
 * language switcher can never end up empty.
 */
export async function getSupportedLocales(): Promise<Locale[]> {
  try {
    const { getLocalizationConfig } = await import("@/lib/config/service");
    const cfg = await getLocalizationConfig();
    const requested = Array.isArray(cfg.supported_locales)
      ? cfg.supported_locales.filter((c): c is Locale => isLocale(c))
      : [];
    // Keep the canonical order and never withdraw the compiled-in default.
    const ordered = LOCALES.filter((c) => requested.includes(c) || c === DEFAULT_LOCALE);
    return ordered.length ? ordered : [...LOCALES];
  } catch {
    return [...LOCALES];
  }
}

/**
 * The configured default locale. Synchronous on purpose: it is the tail of
 * getRequestLocale(), which has already done its async work, and a failure
 * here must fall back rather than throw.
 */
function configuredDefaultLocale(): Locale {
  const cached = defaultLocaleCache;
  if (cached && Date.now() - cached.at < DEFAULT_LOCALE_CACHE_TTL_MS) return cached.locale;
  return DEFAULT_LOCALE;
}

const DEFAULT_LOCALE_CACHE_TTL_MS = 15_000;
let defaultLocaleCache: { at: number; locale: Locale } | null = null;

/**
 * Refresh the cached configured default. Called by the root layout (which is
 * already resolving configuration for branding) so getRequestLocale() stays
 * free of an extra database round trip on every request.
 */
export async function primeDefaultLocaleCache(): Promise<Locale> {
  try {
    const { getLocalizationConfig } = await import("@/lib/config/service");
    const cfg = await getLocalizationConfig();
    const supported = await getSupportedLocales();
    const locale = isLocale(cfg.default_locale) && supported.includes(cfg.default_locale)
      ? cfg.default_locale
      : DEFAULT_LOCALE;
    defaultLocaleCache = { at: Date.now(), locale };
    return locale;
  } catch {
    defaultLocaleCache = { at: Date.now(), locale: DEFAULT_LOCALE };
    return DEFAULT_LOCALE;
  }
}

/** Server-side translator bound to the request locale. */
export async function getI18n(): Promise<{
  locale: Locale;
  dict: Dictionary;
  t: (key: string, params?: TranslateParams) => string;
}> {
  const locale = await getRequestLocale();
  const dict = getDictionary(locale);
  return { locale, dict, t: (key, params) => translate(dict, key, params) };
}
