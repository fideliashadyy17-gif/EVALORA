"use server";

/**
 * Persist the signed-in user's interface locale (per-user, server-stored).
 *
 * The cookie is written client-side first (works for anonymous visitors and
 * gives immediate persistence); this action mirrors the choice into
 * `profiles.interface_locale` so the preference follows the ACCOUNT to any
 * device. It updates only the caller's own verified profile row — RLS
 * (`prof_update`) and the verified session both apply. Never touches
 * examination content language (lib/examLanguage).
 */
import { isLocale } from "./config";
import { createClient } from "@/lib/supabase/server";

export async function saveLocalePreference(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return; // anonymous — cookie-only persistence
    const { error } = await supabase
      .from("profiles")
      .update({ interface_locale: locale })
      .eq("id", userId);
    // A failed preference write never blocks the UI switch (cookie already
    // holds the choice); it simply means cross-device sync lags.
    void error;
  } catch {
    // best-effort
  }
}
