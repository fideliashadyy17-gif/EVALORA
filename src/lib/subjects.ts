import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolving a subject name to the organization's subject record.
 *
 * Examinations and papers record their subject as a free-text NAME (`settings.subject`)
 * because `subjects` is an optional catalogue that most schools have not filled
 * in. The subject authorization policies, on the other hand, key on ids. This
 * module is the one place that crosses between the two, so the dashboard form,
 * the AI paper builder and the AI Core resolver cannot disagree about what
 * "Mathematics" means.
 */

/**
 * The id of the subject with this name in this organization, or null.
 *
 * Case- and whitespace-insensitive. Returns null when the name matches nothing
 * *and* when it matches more than one subject differing only in case: picking
 * one of two would silently scope a paper to a subject the school did not
 * choose, and the id is only ever used to narrow permissions.
 */
export async function resolveSubjectIdByName(
  supabase: SupabaseClient,
  organizationId: string,
  name: string | null | undefined,
): Promise<string | null> {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return null;
  // `ilike` with no wildcards is a case-insensitive equality test. The name is
  // passed as a parameter by the client, never interpolated.
  const { data, error } = await supabase
    .from("subjects")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("name", trimmed)
    .limit(2);
  if (error) throw new Error(`Could not resolve subject "${trimmed}": ${error.message}`);
  const rows = (data ?? []) as { id: string }[];
  return rows.length === 1 ? rows[0].id : null;
}
