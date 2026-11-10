import { DEFAULT_EXAM_LINK_POLICY, parseExamLinkPolicy, type ExamLinkPolicy } from "./examLink";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Read the platform's examination-link policy (`platform_settings.exam_link_policy`).
 *
 * A missing or unreadable setting falls back to the conservative default: links
 * must expire. The platform never silently creates a permanent link.
 */
export async function loadExamLinkPolicy(admin: SupabaseClient): Promise<ExamLinkPolicy> {
  try {
    const { data } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", "exam_link_policy")
      .maybeSingle();
    return data ? parseExamLinkPolicy(data.value) : DEFAULT_EXAM_LINK_POLICY;
  } catch {
    return DEFAULT_EXAM_LINK_POLICY;
  }
}

export interface LinkCounts {
  started: number;
  submitted: number;
  inProgress: number;
}

/** Started / submitted attempt counts for a set of examinations. */
export async function loadLinkAttemptCounts(
  admin: SupabaseClient,
  examIds: string[],
): Promise<Map<string, LinkCounts>> {
  const counts = new Map<string, LinkCounts>();
  if (!examIds.length) return counts;
  const { data } = await admin
    .from("exam_attempts")
    .select("exam_id,status")
    .in("exam_id", examIds)
    .limit(20000);
  for (const row of data ?? []) {
    const examId = (row as { exam_id: string }).exam_id;
    const status = (row as { status: string }).status;
    const current = counts.get(examId) ?? { started: 0, submitted: 0, inProgress: 0 };
    current.started += 1;
    if (status === "in_progress") current.inProgress += 1;
    else current.submitted += 1;
    counts.set(examId, current);
  }
  return counts;
}
