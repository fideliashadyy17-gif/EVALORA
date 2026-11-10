/**
 * Server-side hint loading.
 *
 * Design constraints that shape this file:
 *  · The examination paper must never fail because hints failed. Every read
 *    here degrades to "no hints" instead of throwing into the exam payload.
 *  · One query per paper (not one per question), so opening an examination is
 *    as fast as before and opening a hint costs no round-trip when the content
 *    was already delivered with the paper.
 *  · Only `status = 'published'` rows are loaded, and only through the
 *    candidate-safe projection in `examHints.ts`.
 *  · Scoping is (this examination) OR (bank-wide hint of the same organisation),
 *    so a hint configured for examination A can never appear in examination B.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_HINTS_POLICY,
  groupPublishedHints,
  parseHintsPolicy,
  type HintsPolicy,
  type PublicHint,
  type HintRowLike,
} from "./examHints";

const QUESTION_CHUNK = 200;

/** Instance-local cache: the policy changes rarely and must not add a query per page view. */
let policyCache: { at: number; value: HintsPolicy } | null = null;
const POLICY_TTL_MS = 60_000;

export function __resetHintsPolicyCache() {
  policyCache = null;
}

export async function readHintsPolicy(admin: SupabaseClient): Promise<HintsPolicy> {
  if (policyCache && Date.now() - policyCache.at < POLICY_TTL_MS) return policyCache.value;
  const { data, error } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "exam_hints_policy")
    .maybeSingle();
  const value = error || !data ? { ...DEFAULT_HINTS_POLICY } : parseHintsPolicy(data.value);
  policyCache = { at: Date.now(), value };
  return value;
}

export type HintExamScope = { id: string; organization_id: string };

/**
 * Published hints for the questions of one paper, grouped per question id.
 * Examination-specific rows shadow bank-wide rows (see `groupPublishedHints`).
 */
export async function loadPublishedHints(
  admin: SupabaseClient,
  exam: HintExamScope,
  questionIds: string[],
  options: { policy?: HintsPolicy } = {},
): Promise<Map<string, PublicHint[]>> {
  const unique = [...new Set(questionIds.filter((id) => typeof id === "string" && id.length > 0))];
  if (!unique.length) return new Map();

  const policy = options.policy ?? (await readHintsPolicy(admin));
  if (!policy.enabled) return new Map();

  const rows: HintRowLike[] = [];
  for (let start = 0; start < unique.length; start += QUESTION_CHUNK) {
    const chunk = unique.slice(start, start + QUESTION_CHUNK);
    const { data, error } = await admin
      .from("question_hints")
      .select("question_id,exam_id,level,body,body_doc,status")
      .eq("status", "published")
      .in("question_id", chunk)
      .or(`exam_id.eq.${exam.id},and(exam_id.is.null,organization_id.eq.${exam.organization_id})`);
    // A hint read failure must never break an examination.
    if (error) return new Map();
    rows.push(...((data ?? []) as HintRowLike[]));
  }

  return groupPublishedHints(rows, exam.id, { maxLevels: policy.maxLevels });
}

/**
 * The correct-answer context used by the answer-leak guard in the admin console.
 * This is NEVER sent to a candidate: it exists only so an author can be warned
 * that their hint quotes the answer before it is published.
 */
export async function loadHintLeakContext(
  admin: SupabaseClient,
  questionIds: string[],
): Promise<Map<string, { correctOptionLabels: string[]; acceptedAnswers: string[] }>> {
  const out = new Map<string, { correctOptionLabels: string[]; acceptedAnswers: string[] }>();
  const unique = [...new Set(questionIds)];
  if (!unique.length) return out;

  const [{ data: options }, { data: questions }] = await Promise.all([
    admin.from("question_options").select("question_id,label,is_correct").in("question_id", unique),
    admin.from("questions").select("id,config").in("id", unique),
  ]);

  for (const id of unique) out.set(id, { correctOptionLabels: [], acceptedAnswers: [] });
  for (const option of (options ?? []) as { question_id: string; label: string; is_correct: boolean }[]) {
    if (!option.is_correct) continue;
    out.get(option.question_id)?.correctOptionLabels.push(option.label);
  }
  for (const question of (questions ?? []) as { id: string; config: Record<string, unknown> | null }[]) {
    const config = question.config ?? {};
    const raw = config.answers ?? config.accepted_answers ?? config.answer;
    const list: string[] = [];
    if (typeof raw === "string") list.push(raw);
    else if (typeof raw === "number") list.push(String(raw));
    else if (Array.isArray(raw)) for (const item of raw) if (typeof item === "string" || typeof item === "number") list.push(String(item));
    if (config.numeric_answer !== undefined && config.numeric_answer !== null) list.push(String(config.numeric_answer));
    out.get(question.id)?.acceptedAnswers.push(...list);
  }
  return out;
}
