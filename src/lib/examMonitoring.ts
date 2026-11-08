import type { SupabaseClient } from "@supabase/supabase-js";
import { attemptDeadline } from "./exam";
import { parseTrack } from "./examTrack";
import { buildMonitorRow, paperForAttempt, sortMonitorRows, type MonitorSnapshot, type PaperRow } from "./monitorRows";
import type { SavedAnswerFacts } from "./examMessaging";

/** Attempts shown on one dashboard. Older attempts are reachable through the results pages. */
export const MONITOR_ATTEMPT_LIMIT = 500;
const IN_CHUNK = 150;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Loads the live monitoring snapshot for one examination with the caller's own session
 * (row level security applies). Returns null when the examination is not visible to the caller.
 * Answer keys, marks of other candidates and access tokens are never selected.
 */
export async function loadMonitorSnapshot(
  supabase: SupabaseClient,
  examId: string,
  nowMs: number = Date.now(),
): Promise<{ exam: { id: string; title: string; organization_id: string }; snapshot: MonitorSnapshot } | null> {
  const { data: exam } = await supabase
    .from("exams")
    .select("id, title, organization_id, duration_minutes, ends_at, quiz_id")
    .eq("id", examId)
    .maybeSingle();
  if (!exam) return null;

  const { data: attemptRows } = await supabase
    .from("exam_attempts")
    .select("id, status, started_at, submitted_at, extension_minutes, track, question_order, exam_candidates(full_name, candidate_ref, class_id)")
    .eq("exam_id", examId)
    .order("started_at", { ascending: false })
    .limit(MONITOR_ATTEMPT_LIMIT);
  const attempts = (attemptRows ?? []) as unknown as {
    id: string; status: string; started_at: string; submitted_at: string | null; extension_minutes: number;
    track: string | null; question_order: unknown;
    exam_candidates: { full_name: string; candidate_ref: string | null; class_id: string | null } | null;
  }[];
  const attemptIds = attempts.map((a) => a.id);

  // The paper: quiz rows with only the configuration needed to tell BC-only items apart.
  const { data: quizRows } = exam.quiz_id
    ? await supabase.from("quiz_questions").select("id, questions(id, config)").eq("quiz_id", exam.quiz_id).order("position")
    : { data: [] as unknown[] };
  const paper = ((quizRows ?? []) as unknown as { id: string; questions: { config?: unknown } | null }[])
    .map((r) => ({ id: r.id, questions: r.questions ?? {} })) as PaperRow[];

  const classIds = [...new Set(attempts.map((a) => a.exam_candidates?.class_id).filter((id): id is string => Boolean(id)))];
  const classNames = new Map<string, string>();
  for (const part of chunks(classIds, IN_CHUNK)) {
    const { data } = await supabase.from("classes").select("id, name").in("id", part);
    for (const c of data ?? []) classNames.set(c.id as string, c.name as string);
  }

  const answersByAttempt = new Map<string, (SavedAnswerFacts & { quiz_question_id: string | null })[]>();
  const presenceByAttempt = new Map<string, { last_seen_at: string; current_question: number | null; pending_saves: number }>();
  const unreadByAttempt = new Map<string, number>();
  for (const part of chunks(attemptIds, IN_CHUNK)) {
    const { data: answers } = await supabase
      .from("exam_answers")
      .select("attempt_id, quiz_question_id, answer, is_correct, points_awarded")
      .in("attempt_id", part);
    for (const a of (answers ?? []) as { attempt_id: string; quiz_question_id: string | null; answer: unknown; is_correct: boolean | null; points_awarded: number | null }[]) {
      const list = answersByAttempt.get(a.attempt_id) ?? [];
      list.push({ answer: a.answer, is_correct: a.is_correct, points_awarded: a.points_awarded, quiz_question_id: a.quiz_question_id });
      answersByAttempt.set(a.attempt_id, list);
    }
  }
  const { data: presence } = await supabase
    .from("exam_presence")
    .select("attempt_id, last_seen_at, current_question, pending_saves")
    .eq("exam_id", examId);
  for (const p of (presence ?? []) as { attempt_id: string; last_seen_at: string; current_question: number | null; pending_saves: number }[]) {
    presenceByAttempt.set(p.attempt_id, { last_seen_at: p.last_seen_at, current_question: p.current_question, pending_saves: p.pending_saves });
  }
  const { data: unread } = await supabase
    .from("exam_messages")
    .select("attempt_id")
    .eq("exam_id", examId)
    .eq("sender_kind", "candidate")
    .is("read_at", null)
    .limit(5000);
  for (const u of (unread ?? []) as { attempt_id: string }[]) {
    unreadByAttempt.set(u.attempt_id, (unreadByAttempt.get(u.attempt_id) ?? 0) + 1);
  }

  const rows = attempts.map((a) => {
    const track = parseTrack(a.track);
    const deadline = attemptDeadline(exam, a.started_at, Number(a.extension_minutes ?? 0)).toISOString();
    const candidate = a.exam_candidates;
    const attemptPaper = paperForAttempt(paper, a.question_order, track);
    return buildMonitorRow({
      id: a.id,
      status: a.status,
      started_at: a.started_at,
      submitted_at: a.submitted_at,
      track,
      question_order: a.question_order,
      candidate_name: candidate?.full_name ?? "Candidate",
      candidate_ref: candidate?.candidate_ref ?? null,
      class_name: candidate?.class_id ? classNames.get(candidate.class_id) ?? null : null,
      deadline,
      answers: answersByAttempt.get(a.id) ?? [],
      presence: presenceByAttempt.get(a.id) ?? null,
      unread_from_candidate: unreadByAttempt.get(a.id) ?? 0,
    }, attemptPaper, nowMs);
  });

  return {
    exam: { id: exam.id as string, title: exam.title as string, organization_id: exam.organization_id as string },
    snapshot: { server_now: new Date(nowMs).toISOString(), rows: sortMonitorRows(rows) },
  };
}
