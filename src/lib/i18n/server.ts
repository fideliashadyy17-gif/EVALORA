/**
 * Server-only i18n helpers (they read the request cookie via next/headers).
 * Kept apart from `@/lib/i18n` so client components can import the pure
 * translation runtime without pulling the Server Component cookie API into
 * the client bundle.
 */
import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
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
 *   3. the sensible default (en).
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
  return DEFAULT_LOCALE;
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
