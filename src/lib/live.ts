import type { SupabaseClient } from "@supabase/supabase-js";

/** Deterministic shuffle seeded by a string (stable across requests). */
export function seededShuffle<T>(arr: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface SessionQuestionRow {
  id: string; // quiz_question id
  question_id: string;
  position: number;
  points: number | null;
  time_limit_seconds: number | null;
  questions: {
    id: string;
    type: string;
    prompt: string;
    prompt_doc: import("./content").RichDoc | null;
    explanation: string | null;
    explanation_doc: import("./content").RichDoc | null;
    points: number;
    config: Record<string, unknown> | null;
    question_options: { id: string; label: string; content_doc: import("./content").RichDoc | null; is_correct: boolean; position: number }[];
  };
}

export async function loadQuizQuestions(
  supabase: SupabaseClient,
  quizId: string,
): Promise<SessionQuestionRow[]> {
  const { data } = await supabase
    .from("quiz_questions")
    .select("*, questions(*, question_options(*))")
    .eq("quiz_id", quizId)
    .order("position");
  return (data ?? []).map((r) => ({
    ...r,
    questions: {
      ...r.questions,
      points: Number(r.questions.points),
      question_options: [...(r.questions.question_options ?? [])].sort(
        (a: { position: number }, b: { position: number }) => a.position - b.position,
      ),
    },
  })) as SessionQuestionRow[];
}

/**
 * The question as a participant/candidate may see it.
 * Correctness, accepted answers, numeric solutions and pair mappings
 * are stripped — they never leave the server before grading.
 */
export function publicQuestion(
  row: SessionQuestionRow,
  opts: { randomizeOptions?: boolean; seed?: string } = {},
) {
  const q = row.questions;
  const cfg = (q.config ?? {}) as Record<string, unknown>;
  const baseOptions = q.question_options.map((o) => ({ id: o.id, label: o.label, content_doc: o.content_doc ?? null }));
  let options = baseOptions;
  if (opts.randomizeOptions && ["single_choice", "multiple_select", "true_false", "poll"].includes(q.type)) {
    options = seededShuffle(baseOptions, `${opts.seed ?? ""}:${q.id}`);
  }
  const out: Record<string, unknown> = {
    quiz_question_id: row.id,
    question_id: q.id,
    type: q.type,
    prompt: q.prompt,
    prompt_doc: q.prompt_doc ?? null,
    points: Number(row.points ?? q.points),
    media_url: (cfg.media_url as string) ?? null,
    media_type: (cfg.media_type as string) ?? null,
    options: q.type === "matching" ? [] : options,
  };
  if (q.type === "ordering") {
    out.options = seededShuffle(baseOptions, `${opts.seed ?? ""}:${q.id}:ord`);
  }
  if (q.type === "matching") {
    const pairs = (cfg.pairs as { left: string; right: string }[]) ?? [];
    out.matching_lefts = pairs.map((p) => p.left);
    out.matching_rights = seededShuffle(pairs.map((p) => p.right), `${opts.seed ?? ""}:${q.id}:mat`);
  }
  return out;
}
