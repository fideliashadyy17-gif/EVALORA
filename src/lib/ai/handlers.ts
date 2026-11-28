import "server-only";

/**
 * EVALORA AI CORE — tool handlers.
 *
 * Every handler is a thin, honest adapter over an existing EVALORA service.
 * The rules this file keeps:
 *
 *   - Reads are tenant-scoped by the caller's own `organization_id`, always.
 *   - Writes go through the ordinary authoring services, so plan limits, RBAC,
 *     zod schemas and attempt-lock guards apply exactly as they do in the UI.
 *   - Nothing claims success that the database did not confirm.
 *   - Model output is treated as untrusted data: it is parsed, validated and
 *     bounded before it reaches any write.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CoreModelError } from "./provider";
import type { MarkingTransport } from "../ai-marking";
import { AGENT_CLIENTS, createAgent, isKnownPermission } from "./agents";
import type { AiOrgSettings } from "./engine";
import { ToolError, type ActorIdentity, type CallScope, type ToolResult, type PreviewBlock } from "./types";
import {
  type ProposedExam,
  type ProposedQuestion,
  type ProposedSection,
  type ValidationReport,
  validateProposedExam,
  promptFingerprint,
  VALIDATION_HONESTY_NOTE,
} from "./validation";
import {
  buildExamPlan,
  gradeOrderFromLabel,
  inferDifficultyMix,
  resolveTopics,
  TOPIC_CATALOG,
  topicsForGrade,
  topicLabel,
  type PlanSpec,
  type TopicKey,
} from "./generator";
import { loadOrganizationContext, type AiOrganizationContext } from "./context";
import { materializeExam, MaterializeError } from "./examBuilder";
import { modelExamPlan } from "./model";
import { scoreAnswer } from "../scoring";

export interface ToolRuntime {
  actor: ActorIdentity;
  scope: CallScope;
  /** Service role: journal, approvals, and reads that must bypass RLS. */
  admin: SupabaseClient;
  /** Request-scoped client (RLS, or the agent's bound-user session). */
  supabase: SupabaseClient;
  settings: AiOrgSettings;
  env: NodeJS.ProcessEnv;
  now: () => Date;
  modelTransport?: MarkingTransport;
  /**
   * Permission check for a caller authenticated WITHOUT a browser cookie.
   *
   * The shared authoring services normally resolve permissions through a
   * cookie-bound client. An external agent has no cookies, so it supplies this
   * resolver, which asks the identical `access_has_permission` question under
   * the owner identity the request already proved. Absent on the native path,
   * where the browser session answers for itself.
   */
  authorize?: (permission: string, module?: string) => Promise<boolean>;
  /**
   * Permission check for the ACTING HUMAN, independent of any request client.
   * Used when a tool must decide what to grant rather than whether to proceed
   * (agent registration intersects requested permissions with what the owner
   * really holds).
   */
  hasPermissionFor?: (permission: string) => Promise<boolean>;
  /** Deployment base URL, so a registration can hand back real endpoints. */
  publicBaseUrl?: string;
}

/**
 * What an agent gets when the caller names no permissions: enough to look around
 * and draft, and nothing that publishes, marks, adjusts a score or touches a
 * credential. Deliberately narrower than "every tool the owner can run".
 */
const DEFAULT_AGENT_PERMISSIONS = [
  "dashboard.view",
  "exams.view",
  "questions.view",
  "quizzes.view",
  "grading.view",
  "reports.view",
  "exams.create",
  "questions.create",
  "quizzes.create",
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requireUuid = (value: unknown, field: string): string => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!UUID.test(text)) throw new ToolError("invalid_arguments", `"${field}" must be a valid id.`);
  return text;
};
const optionalUuid = (value: unknown, field: string): string | null =>
  value === undefined || value === null || value === "" ? null : requireUuid(value, field);
const boundedString = (value: unknown, field: string, max: number, min = 1): string => {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < min) throw new ToolError("invalid_arguments", `"${field}" is required.`);
  if (text.length > max) throw new ToolError("invalid_arguments", `"${field}" is limited to ${max} characters.`);
  return text;
};
const optionalString = (value: unknown, max: number): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text ? text.slice(0, max) : undefined;
};
const finiteNumber = (value: unknown, field: string, min: number, max: number): number => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new ToolError("invalid_arguments", `"${field}" must be a number between ${min} and ${max}.`);
  }
  return n;
};
const optionalNumber = (value: unknown, field: string, min: number, max: number): number | undefined =>
  value === undefined || value === null || value === "" ? undefined : finiteNumber(value, field, min, max);

const truncate = (value: string, max = 400): string => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

/**
 * Confirms that a record belongs to the caller's organization.
 *
 * This is the anti-cross-tenant check used by every handler that accepts an id.
 * RLS already protects the RLS client; the service client does not, so an
 * explicit comparison is mandatory whenever `runtime.admin` is used.
 */
/**
 * Resolves an examination the teacher described in words rather than by id.
 *
 * "the last one", "my Grade 9 draft", "the linear equations exam". Two rules
 * make this safe:
 *   • it only ever considers examinations in the caller's own organization, so a
 *     phrase can never reach another tenant's record;
 *   • it refuses when the phrase matches more than one, instead of picking one
 *     and changing a paper the teacher did not mean.
 *
 * Ordered by `created_at` descending, so "the last one" is the newest — which is
 * what the phrase means to a person.
 */
async function resolveExaminationReference(runtime: ToolRuntime, reference: string): Promise<string> {
  const text = reference.toLowerCase();
  const search = /["“']([^"”']{3,120})["”']/.exec(reference)?.[1];

  let query = runtime.admin
    .from("exams")
    .select("id, title, status, created_at")
    .eq("organization_id", runtime.scope.organizationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  // A quoted title is an explicit name, not a guess.
  if (search) query = query.ilike("title", `%${search}%`);

  const { data, error } = await query;
  if (error) throw new ToolError("internal", "The examination list could not be read.");

  const rows = (data ?? []) as { id: string; title: string; status: string }[];
  if (!rows.length) {
    throw new ToolError(
      "not_found",
      "I could not find an examination matching that description in this workspace.",
      "Name it exactly, or ask me to list the examinations first.",
    );
  }

  // A status word in the sentence narrows the set.
  const wantsDraft = /\bdraft\b/i.test(text);
  const wantsPublished = /\b(published|live|open)\b/i.test(text);
  let candidates = rows;
  if (wantsDraft) candidates = rows.filter((r) => r.status === "draft");
  else if (wantsPublished) candidates = rows.filter((r) => ["published", "open"].includes(r.status));

  // A grade/topic phrase narrows it too, when it is distinctive.
  const gradeMention = /\b(?:myp\s*[1-5]|grade\s*\d{1,2})\b/i.exec(reference)?.[0];
  if (gradeMention) {
    const narrowed = candidates.filter((r) => r.title.toLowerCase().includes(gradeMention.toLowerCase()));
    if (narrowed.length) candidates = narrowed;
  }

  if (candidates.length === 1) return candidates[0].id;
  if (!candidates.length) {
    throw new ToolError(
      "not_found",
      "No examination in this workspace matches that description.",
      `Found ${rows.length} examination(s) in total; none matched.`,
    );
  }

  // "the last one" / "latest" / "most recent" is unambiguous by definition.
  if (/\b(last|latest|newest|most recent)\b/i.test(text)) return candidates[0].id;

  const named = candidates.slice(0, 5).map((r) => `"${r.title}" (${r.status})`);
  throw new ToolError(
    "conflict",
    `${candidates.length} examinations match that description, so nothing was changed.`,
    `Which one? ${named.join("; ")}${candidates.length > 5 ? "; …" : ""}. Give me the id or the exact title.`,
  );
}

async function requireOwned<T extends Record<string, unknown>>(
  runtime: ToolRuntime,
  table: string,
  id: string,
  columns = "id",
): Promise<T> {
  const { data, error } = await runtime.admin
    .from(table)
    .select(columns)
    .eq("id", id)
    .eq("organization_id", runtime.scope.organizationId)
    .maybeSingle();
  if (error || !data) {
    throw new ToolError("not_found", `No ${table.replace(/_/g, " ")} with that id exists in this organization.`);
  }
  return data as unknown as T;
}

/** Row → compact, candidate-safe summary. Keys are never included here. */
function examSummary(row: Record<string, unknown>, counts?: { candidates?: number; attempts?: number; marks?: number }) {
  return {
    id: row.id as string,
    title: row.title as string,
    status: row.status as string,
    duration_minutes: Number(row.duration_minutes ?? 0),
    quiz_id: (row.quiz_id as string | null) ?? null,
    created_at: row.created_at as string,
    starts_at: (row.starts_at as string | null) ?? null,
    ends_at: (row.ends_at as string | null) ?? null,
    results_published: Boolean((row.settings as Record<string, unknown> | null)?.results_published),
    ...(counts ?? {}),
  };
}

/* ─────────────────────────── context ─────────────────────────── */

async function getOrgContext(runtime: ToolRuntime): Promise<ToolResult> {
  const context = await loadOrganizationContext(runtime.supabase, { profile: { platform_role: "user" } }, runtime.scope.organizationId);
  const data = {
    organization: context.organization,
    plan: context.plan,
    modules: context.modules.filter((m) => m.enabled).map((m) => ({ key: m.key, label: m.label })),
    classes: context.classes,
    subjects: context.subjects,
    question_types: context.questionTypes,
    topics: TOPIC_CATALOG.map((t) => ({ key: t.key, label: t.label, summary: t.summary })),
    curricula: context.curricula.map((c) => ({ key: c.key, reference: c.reference })),
    counts: context.counts,
    exam_defaults: context.examDefaults,
    assessment: context.assessment,
    notes: context.notes,
  };
  const preview: PreviewBlock = {
    kind: "analysis",
    title: `${context.organization.name} — workspace context`,
    sections: [
      {
        heading: "Structure",
        rows: [
          { label: "Plan", value: `${context.plan.name} (exams limit ${context.plan.maxExams === -1 ? "unlimited" : context.plan.maxExams})` },
          { label: "Classes", value: context.classes.length ? context.classes.map((c) => c.name).join(", ") : "none configured" },
          { label: "Subjects", value: context.subjects.length ? context.subjects.map((s) => s.name).join(", ") : "none configured" },
        ],
      },
      {
        heading: "Content",
        rows: [
          { label: "Questions", value: String(context.counts.questions) },
          { label: "Papers", value: `${context.counts.quizzes} (${context.counts.publishedQuizzes} published)` },
          { label: "Examinations", value: String(context.counts.exams) },
        ],
      },
      ...(context.notes.length ? [{ heading: "Caveats", bullets: context.notes }] : []),
    ],
  };
  return {
    ok: true,
    data,
    summary: `Read the live workspace context for ${context.organization.name}.`,
    preview,
  };
}

/* ─────────────────────────── examinations ─────────────────────────── */

async function listExaminations(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const limit = optionalNumber(args.limit, "limit", 1, 50) ?? 20;
  const status = optionalString(args.status, 20);
  let query = runtime.admin
    .from("exams")
    .select("id, title, status, duration_minutes, quiz_id, settings, created_at, starts_at, ends_at")
    .eq("organization_id", runtime.scope.organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status) query = query.eq("status", status);
  if (typeof args.query === "string" && args.query.trim()) query = query.ilike("title", `%${args.query.trim()}%`);
  const { data, error } = await query;
  if (error) throw new ToolError("internal", "The examination list could not be read.");
  const rows = (data ?? []).map((row) => examSummary(row as Record<string, unknown>));
  return {
    ok: true,
    data: { examinations: rows, count: rows.length },
    summary: `Found ${rows.length} examination(s).`,
    preview: {
      kind: "analysis",
      title: "Examinations",
      sections: rows.length
        ? [{ heading: "Results", rows: rows.map((r) => ({ label: r.title, value: `${r.status} · ${r.duration_minutes} min · ${r.id}` })) }]
        : [{ heading: "Results", paragraphs: ["No examinations match."] }],
    },
  };
}

async function loadExamPaper(runtime: ToolRuntime, examId: string) {
  const exam = await requireOwned<Record<string, unknown>>(
    runtime,
    "exams",
    examId,
    "id, title, description, instructions, duration_minutes, quiz_id, settings, status, organization_id, starts_at, ends_at, created_at, access_code",
  );
  const quizId = (exam.quiz_id as string | null) ?? null;
  if (!quizId) return { exam, questions: [] as PaperQuestion[], quiz: null };
  const { data: quiz } = await runtime.admin
    .from("quizzes")
    .select("id, title, description, settings, status")
    .eq("id", quizId)
    .eq("organization_id", runtime.scope.organizationId)
    .maybeSingle();
  const { data: rows, error } = await runtime.admin
    .from("quiz_questions")
    .select("position, points, questions(id, type, prompt, points, difficulty, topic, subtopic, config, explanation)")
    .eq("quiz_id", quizId)
    .order("position");
  if (error) throw new ToolError("internal", "The examination paper could not be read.");
  const questions = (rows ?? []).map((row) => {
    const q = (row as unknown as { questions: Record<string, unknown> }).questions ?? {};
    const section = ((q.config as Record<string, unknown> | null)?.paper_section as string | undefined) ?? null;
    return {
      id: q.id as string,
      position: Number((row as { position: number }).position),
      points: Number((row as { points: number | null }).points ?? (q.points as number) ?? 0),
      type: (q.type as string) ?? "unknown",
      prompt: (q.prompt as string) ?? "",
      difficulty: (q.difficulty as string) ?? null,
      topic: (q.topic as string) ?? null,
      subtopic: (q.subtopic as string) ?? null,
      section,
    } satisfies PaperQuestion;
  });
  return { exam, questions, quiz: quiz ?? null };
}

interface PaperQuestion {
  id: string;
  position: number;
  points: number;
  type: string;
  prompt: string;
  difficulty: string | null;
  topic: string | null;
  subtopic: string | null;
  section: string | null;
}

async function getExamination(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const examId = requireUuid(args.examination_id, "examination_id");
  const { exam, questions, quiz } = await loadExamPaper(runtime, examId);
  const settings = (exam.settings as Record<string, unknown> | null) ?? {};
  const sections = Array.isArray(settings.sections) ? settings.sections : [];
  const totalMarks = questions.reduce((sum, q) => sum + q.points, 0);
  const data = {
    ...examSummary(exam, { marks: totalMarks }),
    instructions: (exam.instructions as string | null) ?? null,
    paper: quiz ? { id: quiz.id as string, title: quiz.title as string, status: quiz.status as string } : null,
    sections,
    questions,
    totals: { questions: questions.length, marks: totalMarks },
  };
  return {
    ok: true,
    data,
    summary: `Read "${exam.title as string}" — ${questions.length} questions, ${totalMarks} marks.`,
    preview: {
      kind: "exam",
      title: exam.title as string,
      sections: [
        {
          heading: "Examination",
          rows: [
            { label: "Status", value: String(exam.status) },
            { label: "Duration", value: `${exam.duration_minutes} minutes` },
            { label: "Paper", value: quiz ? `${quiz.title as string} (${quiz.status as string})` : "no paper attached" },
            { label: "Total marks", value: String(totalMarks) },
          ],
        },
        ...(questions.length
          ? [{
              heading: "Questions",
              rows: questions.slice(0, 40).map((q) => ({
                label: `${q.position + 1}. ${truncate(q.prompt.replace(/\s+/g, " "), 110)}`,
                value: `${q.points} mark(s) · ${q.type}${q.section ? ` · §${q.section}` : ""}`,
              })),
            }]
          : []),
      ],
    },
  };
}

/** Builds a PlanSpec from either an instruction or explicit parameters. */
export function specFromRequest(args: Record<string, unknown>, context: AiOrganizationContext): PlanSpec {
  const instruction = optionalString(args.instruction, 4000) ?? "";
  const gradeLabel = optionalString(args.grade_label, 80) ?? inferGradeLabel(instruction, context);
  const gradeOrder = gradeOrderFromLabel(gradeLabel);
  const duration = optionalNumber(args.duration_minutes, "duration_minutes", 1, 1440)
    ?? inferDuration(instruction)
    ?? context.examDefaults.durationMinutes;
  const questionCount = optionalNumber(args.question_count, "question_count", 2, 60) ?? inferQuestionCount(instruction) ?? 20;
  const totalMarks = optionalNumber(args.total_marks, "total_marks", 1, 2000) ?? inferTotalMarks(instruction);
  const subject = optionalString(args.subject, 120) ?? inferSubject(instruction, context);
  const curriculum = optionalString(args.curriculum, 20) ?? inferCurriculum(instruction, context);
  const explicitTopics = Array.isArray(args.topics)
    ? args.topics.filter((t): t is string => typeof t === "string")
    : [];
  const topics = (explicitTopics.length ? explicitTopics : resolveTopics(instruction, gradeOrder)) as TopicKey[];
  const mix = args.difficulty_mix && typeof args.difficulty_mix === "object"
    ? normaliseMix(args.difficulty_mix as Record<string, unknown>)
    : inferDifficultyMix(instruction);
  const title = optionalString(args.title, 160) ?? inferTitle(instruction, { gradeLabel, subject, topics });
  const sections = Array.isArray(args.sections)
    ? (args.sections as Record<string, unknown>[])
        .filter((s) => typeof s?.id === "string" && typeof s?.title === "string")
        .slice(0, 12)
        .map((s) => ({
          id: String(s.id).slice(0, 8),
          title: String(s.title).slice(0, 200),
          instructions: optionalString(s.instructions, 1000),
          share: Number.isFinite(Number(s.share)) ? Math.max(0.01, Math.min(1, Number(s.share))) : 1 / (args.sections as unknown[]).length,
        }))
    : inferSections(instruction);
  const seed = optionalString(args.seed, 120) ?? `${title}|${gradeLabel ?? ""}|${questionCount}|${duration}`;

  return {
    title,
    description: instruction ? `Generated from the instruction: ${truncate(instruction, 900)}` : undefined,
    instructions:
      `Answer all questions. Show your working clearly. The total mark for this paper is ${totalMarks ?? "shown at the end"}. ` +
      `Duration: ${duration} minutes.`,
    durationMinutes: duration,
    gradeLabel,
    gradeOrder,
    subject,
    curriculum,
    topics: topics.length ? topics : undefined as unknown as TopicKey[],
    questionCount,
    totalMarks,
    difficultyMix: mix,
    sections,
    passMarkPercent: optionalNumber(args.pass_mark_percent, "pass_mark_percent", 0, 100) ?? context.assessment.defaultPassPercent,
    seed,
  };
}

/**
 * Builds a plan, turning a constraint conflict into an actionable refusal.
 *
 * "A 20-mark paper of 60 questions" is a request no generator can satisfy while
 * keeping every question worth at least half a mark. Surfacing that as an
 * internal error would look like a crash; the caller is told what to change.
 */
function buildPlan(spec: Parameters<typeof buildExamPlan>[0]) {
  try {
    return buildExamPlan(spec);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/cannot hold .* questions at the minimum/i.test(message)) {
      throw new ToolError("invalid_arguments", message, "Nothing was created.");
    }
    throw error;
  }
}

function normaliseMix(raw: Record<string, unknown>): { easy: number; medium: number; hard: number } {
  const easy = Math.max(0, Number(raw.easy) || 0);
  const medium = Math.max(0, Number(raw.medium) || 0);
  const hard = Math.max(0, Number(raw.hard) || 0);
  const sum = easy + medium + hard;
  if (sum <= 0) return { easy: 0.35, medium: 0.4, hard: 0.25 };
  return { easy: easy / sum, medium: medium / sum, hard: hard / sum };
}

function inferGradeLabel(instruction: string, context: AiOrganizationContext): string {
  const explicit = /(myp\s*[1-5]|grade\s*\d{1,2}|year\s*\d{1,2}|cm2|cm1|6e|5e|4e|3e|seconde|premiere|terminale)/i.exec(instruction);
  if (explicit) return explicit[0].replace(/\b([a-z])/, (m) => m.toUpperCase());
  // Fall back to the organization's own class names, which is the only real
  // evidence of its level structure.
  const known = context.classes.find((c) => {
    const words = c.name.toLowerCase().split(/[\s—-]+/).filter((w) => w.length > 2);
    return words.some((w) => instruction.toLowerCase().includes(w));
  });
  return known?.name ?? "Grade 9";
}

function inferDuration(instruction: string): number | undefined {
  const m = /(\d{1,4})\s*(?:minutes?|mins?|min\b)/i.exec(instruction);
  if (m) return Number(m[1]);
  const h = /(\d(?:\.\d)?)\s*(?:hours?|hrs?\b)/i.exec(instruction);
  if (h) return Math.round(Number(h[1]) * 60);
  return undefined;
}

function inferQuestionCount(instruction: string): number | undefined {
  const m = /(\d{1,3})\s*(?:questions?|items?|problems?)/i.exec(instruction);
  return m ? Number(m[1]) : undefined;
}

function inferTotalMarks(instruction: string): number | undefined {
  const m = /(\d{1,4})\s*(?:marks?|points?|pts?\b)/i.exec(instruction);
  return m ? Number(m[1]) : undefined;
}

function inferSubject(instruction: string, context: AiOrganizationContext): string {
  const lower = instruction.toLowerCase();
  const known = context.subjects.find((s) => lower.includes(s.name.toLowerCase()));
  if (known) return known.name;
  for (const subject of ["mathematics", "maths", "math", "physics", "chemistry", "biology", "science", "english", "history", "geography", "french"]) {
    if (lower.includes(subject)) return subject === "maths" || subject === "math" ? "Mathematics" : subject.charAt(0).toUpperCase() + subject.slice(1);
  }
  return "Mathematics";
}

function inferCurriculum(instruction: string, context: AiOrganizationContext): string {
  const lower = instruction.toLowerCase();
  if (lower.includes("myp") || lower.includes("ib ")) return "myp";
  if (lower.includes("ap ") || lower.includes("advanced placement")) return "ap";
  if (lower.includes("francophone") || lower.includes("bénin") || lower.includes("benin")) return "beninese";
  const moduleEnabledMath = context.questionTypes.some((t) => t.value === "assess_parts");
  return moduleEnabledMath ? "myp" : "english";
}

function inferTitle(instruction: string, parts: { gradeLabel: string; subject: string; topics: TopicKey[] }): string {
  const topicPart = parts.topics.length ? parts.topics.slice(0, 4).map(topicLabel).join(", ") : "Mathematics";
  const year = new Date().getFullYear();
  return `${parts.gradeLabel} ${parts.subject} Examination — ${topicPart} (${year})`.slice(0, 160);
}

function inferSections(instruction: string): PlanSpec["sections"] {
  const m = /(\d)\s*sections?/i.exec(instruction);
  const count = m ? Math.max(1, Math.min(6, Number(m[1]))) : 2;
  if (count === 1) return [{ id: "A", title: "All questions", share: 1 }];
  if (count === 2) {
    return [
      { id: "A", title: "Section A — Short answer and multiple choice", share: 0.65 },
      { id: "B", title: "Section B — Structured questions", share: 0.35 },
    ];
  }
  return Array.from({ length: count }, (_, i) => ({
    id: String.fromCharCode(65 + i),
    title: `Section ${String.fromCharCode(65 + i)}`,
    share: 1 / count,
  }));
}

/** Renders a plan into the reviewable preview block shown before saving. */
export function planPreview(plan: ProposedExam, report: ValidationReport, sources: { ref: string; topic: TopicKey | null; family: string }[]): PreviewBlock {
  const familyFor = new Map(sources.map((s) => [s.ref, s.family]));
  return {
    kind: "exam",
    title: plan.title,
    sections: [
      {
        heading: "Blueprint",
        rows: [
          { label: "Level", value: plan.gradeLabel ?? "not specified" },
          { label: "Subject", value: plan.subject ?? "not specified" },
          { label: "Duration", value: `${plan.durationMinutes} minutes` },
          { label: "Questions", value: String(report.totals.questions) },
          { label: "Total marks", value: String(report.totals.marks) },
          { label: "Pass mark", value: `${plan.passMarkPercent ?? 50}%` },
          { label: "Sections", value: report.totals.bySection.map((s) => `${s.title} (${s.questions} q · ${s.marks} marks)`).join(" · ") },
          { label: "Difficulty", value: Object.entries(report.totals.byDifficulty).map(([k, v]) => `${k}: ${v}`).join(", ") },
          { label: "Question types", value: Object.entries(report.totals.byType).map(([k, v]) => `${k}: ${v}`).join(", ") },
        ],
      },
      {
        heading: "Questions",
        rows: plan.questions.map((q, index) => ({
          label: `${index + 1}. ${truncate(q.prompt.replace(/\s+/g, " "), 130)}`,
          value: `${q.points} mark(s) · ${q.type} · ${q.difficulty}${familyFor.get(q.ref) ? ` · ${familyFor.get(q.ref)}` : ""}`,
        })),
      },
      {
        heading: "Checks",
        // A preview is shown for a paper that PASSED (or one that was refused,
        // where the errors are the point). Listing warnings as a wall of red
        // text under a successful creation is what made a good result look
        // broken, so a clean paper says so in one line.
        bullets: report.ok
          ? [
              report.warnings.length
                ? `Structural checks passed with ${report.warnings.length} note(s):`
                : "Structural checks passed: title, duration, sections, marks, answer keys and part totals all agree.",
              ...report.warnings.slice(0, 5).map((w) => w.message),
              VALIDATION_HONESTY_NOTE,
            ]
          : [
              `${report.errors.length} blocking error(s) — nothing is saved until these are fixed:`,
              ...report.errors.slice(0, 8).map((e) => e.message),
              VALIDATION_HONESTY_NOTE,
            ],
      },
    ],
  };
}

async function createExamination(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const context = await loadOrganizationContext(runtime.supabase, { profile: { platform_role: "user" } }, runtime.scope.organizationId);
  const spec = specFromRequest(args, context);
  const source = (optionalString(args.source, 10) ?? "auto") as "auto" | "model" | "template";

  let plan: ProposedExam;
  let sources: { ref: string; topic: TopicKey | null; family: string }[] = [];
  let authoredBy: "template" | "model" = "template";
  let modelNote: string | undefined;

  // The model is used only when it is actually configured. Otherwise the
  // deterministic generator authors the paper and the response says so.
  if (source !== "template") {
    try {
      const drafted = await modelExamPlan(spec, context, {
        env: runtime.env,
        preferred: { provider: runtime.settings.preferredProvider, model: runtime.settings.preferredModel },
        transport: runtime.modelTransport,
      });
      plan = drafted.plan;
      authoredBy = "model";
      modelNote = `Questions authored by ${drafted.provider}/${drafted.model}; every answer was re-checked against the platform scorer.`;
    } catch (error) {
      if (source === "model") {
        const reason =
          error instanceof CoreModelError
            ? error.message
            : error instanceof ToolError
              ? error.message
              : "The model did not return a usable paper.";
        throw new ToolError("unconfigured", `The model could not author this examination: ${reason}`, "Switch source to \"template\" to use EVALORA's deterministic generator instead.");
      }
      // `auto`: fall back honestly and say which engine produced the paper.
      const built = buildPlan(spec);
      plan = built.plan;
      sources = built.sources;
      modelNote =
        error instanceof CoreModelError && error.code === "unconfigured"
          ? "No model credential is configured, so EVALORA's deterministic generator authored this paper (answers are computed, not generated)."
          : `The model was unavailable (${error instanceof Error ? error.message : "unknown reason"}), so EVALORA's deterministic generator authored this paper.`;
    }
  } else {
    const built = buildPlan(spec);
    plan = built.plan;
    sources = built.sources;
  }

  // A generator that produced nothing must never be reported as success. If a
  // requested topic yielded no questions the paper falls back to grade-appropriate
  // material rather than a silent empty examination.
  if (!plan.questions.length) {
    const rebuilt = buildPlan({ ...spec, topics: undefined, seed: `${spec.seed}|fallback` });
    if (rebuilt.plan.questions.length) {
      plan = rebuilt.plan;
      sources = rebuilt.sources;
      modelNote = [modelNote, "The requested topic produced no items, so grade-appropriate topics were used instead."]
        .filter(Boolean)
        .join(" ");
    }
  }
  if (!plan.questions.length) {
    throw new ToolError(
      "internal",
      "The generator produced no questions for this request, so nothing was saved.",
      "Try naming a supported topic, or ask for a grade-appropriate paper instead.",
    );
  }

  const report = validateProposedExam(plan);
  if (!report.ok) {
    return {
      ok: false,
      error: {
        code: "invalid_arguments",
        message: `The paper did not pass validation, so nothing was saved: ${report.errors
          .map((e) => e.message)
          .join(" ")}`,
      },
      data: { errors: report.errors, warnings: report.warnings, totals: report.totals },
      summary: "The generated paper did not pass structural validation, so nothing was saved.",
      preview: planPreview(plan, report, sources),
    };
  }

  // The acting human's session is rebuilt from their verified membership:
  // the authoring services need a SessionContext, and an agent must never
  // supply one of its own.
  const { sessionContextForUser } = await import("../auth");
  const { getEntitlementFor } = await import("../entitlements");
  const { getCapabilities } = await import("../capabilities");
  const session = await sessionContextForUser(runtime.admin, runtime.actor.userId, runtime.scope.organizationId);
  if (!session) throw new ToolError("permission_denied", "The acting user is not an active member of this organization.");
  const entitlement = await getEntitlementFor(runtime.supabase, session, runtime.scope.organizationId);
  const { capabilities } = await getCapabilities(runtime.supabase, session, runtime.scope.organizationId);

  let materialized;
  try {
    materialized = await materializeExam({
      plan,
      report,
      organizationId: runtime.scope.organizationId,
      userId: runtime.actor.userId,
      supabase: runtime.supabase,
      session,
      entitlement,
      capabilities: { examinations: capabilities.examinations, proctoring: capabilities.proctoring },
      passMarkPercent: plan.passMarkPercent,
      // Present only on the external-agent path: the services then ask the
      // permission question under the identity the agent already proved,
      // instead of through a browser cookie it does not have.
      authorize: runtime.authorize,
    });
  } catch (error) {
    if (error instanceof MaterializeError) {
      throw new ToolError(
        error.code === "limit" ? "conflict" : error.code === "permission" ? "permission_denied" : "internal",
        error.message,
        error.partial.length ? `Partial progress: ${error.partial.join("; ")}.` : undefined,
      );
    }
    throw error;
  }

  const data = {
    examination_id: materialized.examId,
    quiz_id: materialized.quizId,
    question_ids: materialized.questionIds,
    access_code: materialized.accessCode,
    status: "draft",
    title: plan.title,
    totals: report.totals,
    authored_by: authoredBy,
    validated: true,
    honesty: VALIDATION_HONESTY_NOTE,
  };
  return {
    ok: true,
    data,
    summary:
      `Created draft examination "${plan.title}" — ${report.totals.questions} questions, ${report.totals.marks} marks, ` +
      `${plan.sections.length} section(s). It is a DRAFT: nothing is published and no candidate is assigned.`,
    preview: planPreview(plan, report, sources),
    links: [{ label: "Open the draft examination", href: materialized.href }],
    ...(modelNote ? { warnings: [modelNote] } : {}),
  } as ToolResult & { warnings?: string[] };
}

async function validateExamination(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const reference = optionalString(args.reference, 400);
  const examId = args.examination_id !== undefined
    ? requireUuid(args.examination_id, "examination_id")
    : reference
      ? await resolveExaminationReference(runtime, reference)
      : (() => { throw new ToolError("invalid_arguments", "Which examination? Give an id or describe it."); })();
  const { exam, questions } = await loadExamPaper(runtime, examId);
  const proposed = await proposedFromStored(runtime, questions);
  const report = validateProposedExam({
    title: String(exam.title),
    durationMinutes: Number(exam.duration_minutes ?? 60),
    sections: sectionsFromStored(exam, questions),
    questions: proposed,
  });
  return {
    ok: true,
    data: { examination_id: examId, report },
    summary: `Validated "${exam.title as string}": ${report.errors.length} error(s), ${report.warnings.length} warning(s).`,
    preview: {
      kind: "analysis",
      title: `Validation — ${exam.title as string}`,
      sections: [
        {
          heading: "Totals",
          rows: [
            { label: "Questions", value: String(report.totals.questions) },
            { label: "Marks", value: String(report.totals.marks) },
            { label: "Sections", value: report.totals.bySection.map((s) => `${s.title}: ${s.questions} q / ${s.marks} marks`).join(" · ") || "none" },
          ],
        },
        {
          heading: "Findings",
          bullets: [
            ...(report.errors.length ? report.errors.map((e) => `Error: ${e.message}`) : ["No blocking errors."]),
            ...(report.warnings.length ? report.warnings.map((w) => `Warning: ${w.message}`) : []),
            VALIDATION_HONESTY_NOTE,
          ],
        },
      ],
    },
  };
}

/**
 * Reads a stored paper back into the validator's shape, including keys, because
 * validation must be able to run the real scorer. The result is never returned
 * to a client: only the report is.
 */
async function proposedFromStored(runtime: ToolRuntime, questions: PaperQuestion[]): Promise<ProposedQuestion[]> {
  const ids = questions.map((q) => q.id);
  if (!ids.length) return [];
  const { data: full } = await runtime.admin
    .from("questions")
    .select("id, type, prompt, points, difficulty, topic, subtopic, config, question_options(label, is_correct, position)")
    .in("id", ids);
  const byId = new Map((full ?? []).map((row) => [(row as { id: string }).id, row as Record<string, unknown>]));
  return questions.map((q) => {
    const row = byId.get(q.id) ?? {};
    const config = ((row.config as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
    const options = ((row.question_options as { label: string; is_correct: boolean; position: number }[] | undefined) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((o) => ({ label: o.label, is_correct: Boolean(o.is_correct) }));
    return {
      ref: q.id,
      type: (row.type as ProposedQuestion["type"]) ?? (q.type as ProposedQuestion["type"]),
      prompt: (row.prompt as string) ?? q.prompt,
      points: q.points,
      difficulty: ((row.difficulty as ProposedQuestion["difficulty"]) ?? "medium"),
      topic: (row.topic as string) ?? undefined,
      subtopic: (row.subtopic as string) ?? undefined,
      explanation: (row.explanation as string) ?? undefined,
      options,
      config,
      parts: Array.isArray(config.parts) ? (config.parts as ProposedQuestion["parts"]) : undefined,
      markingCriteria: typeof config.marking_criteria === "string" ? config.marking_criteria : undefined,
    };
  });
}

function sectionsFromStored(exam: Record<string, unknown>, questions: PaperQuestion[]): ProposedSection[] {
  const settings = (exam.settings as Record<string, unknown> | null) ?? {};
  const declared = Array.isArray(settings.sections) ? (settings.sections as Record<string, unknown>[]) : [];
  if (declared.length) {
    return declared.map((section) => {
      const id = String(section.id ?? "A");
      return {
        id,
        title: String(section.title ?? `Section ${id}`),
        instructions: typeof section.instructions === "string" ? section.instructions : undefined,
        refs: questions.filter((q) => q.section === id).map((q) => q.id),
      };
    });
  }
  return [{ id: "A", title: "All questions", refs: questions.map((q) => q.id) }];
}

async function updateExamination(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const reference = optionalString(args.reference, 400);
  const examId = args.examination_id !== undefined
    ? requireUuid(args.examination_id, "examination_id")
    : reference
      ? await resolveExaminationReference(runtime, reference)
      : (() => { throw new ToolError("invalid_arguments", "Which examination? Give an id or describe it."); })();
  const exam = await requireOwned<Record<string, unknown>>(runtime, "exams", examId, "id, title, status, settings, quiz_id");
  const patch: Record<string, unknown> = {};
  const changes: string[] = [];

  const title = optionalString(args.title, 160);
  if (title) {
    patch.title = title;
    changes.push("title");
  }
  const description = optionalString(args.description, 1000);
  if (description !== undefined) {
    patch.description = description;
    changes.push("description");
  }
  const instructions = optionalString(args.instructions, 4000);
  if (instructions !== undefined) {
    patch.instructions = instructions;
    changes.push("instructions");
  }
  const duration = optionalNumber(args.duration_minutes, "duration_minutes", 1, 1440);
  if (duration !== undefined) {
    patch.duration_minutes = duration;
    changes.push("duration");
  }
  const starts = optionalString(args.starts_at, 40);
  const ends = optionalString(args.ends_at, 40);
  if (starts) {
    const d = new Date(starts);
    if (!Number.isFinite(d.getTime())) throw new ToolError("invalid_arguments", "\"starts_at\" is not a valid timestamp.");
    patch.starts_at = d.toISOString();
    changes.push("start");
  }
  if (ends) {
    const d = new Date(ends);
    if (!Number.isFinite(d.getTime())) throw new ToolError("invalid_arguments", "\"ends_at\" is not a valid timestamp.");
    patch.ends_at = d.toISOString();
    changes.push("end");
  }
  const passMark = optionalNumber(args.pass_mark_percent, "pass_mark_percent", 0, 100);
  const settings = { ...((exam.settings as Record<string, unknown> | null) ?? {}) };
  if (passMark !== undefined) {
    settings.pass_mark_percent = passMark;
    changes.push("pass mark");
  }
  if (!changes.length) throw new ToolError("invalid_arguments", "No change was requested.");
  if (passMark !== undefined) patch.settings = settings;

  const { error } = await runtime.supabase
    .from("exams")
    .update(patch)
    .eq("id", examId)
    .eq("organization_id", runtime.scope.organizationId);
  if (error) throw new ToolError("internal", `The examination could not be updated: ${error.message}`);

  return {
    ok: true,
    data: { examination_id: examId, changed: changes },
    summary: `Updated ${changes.join(", ")} on "${(title ?? exam.title) as string}". Question content was not touched.`,
    links: [{ label: "Open the examination", href: `/dashboard/exams/${examId}` }],
  };
}

async function duplicateExamination(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const examId = requireUuid(args.examination_id, "examination_id");
  const exam = await requireOwned<Record<string, unknown>>(runtime, "exams", examId, "id, title, quiz_id, status");
  const quizId = (exam.quiz_id as string | null) ?? null;
  if (!quizId) throw new ToolError("conflict", "That examination has no paper to copy.");

  const newTitle = (optionalString(args.title, 160) ?? `${exam.title as string} (AI revision)`).slice(0, 160);
  const { data: source, error: readError } = await runtime.admin
    .from("quizzes")
    .select("description")
    .eq("id", quizId)
    .eq("organization_id", runtime.scope.organizationId)
    .maybeSingle();
  if (readError || !source) throw new ToolError("not_found", "The examination's paper could not be read.");

  const { data: rows } = await runtime.admin
    .from("quiz_questions")
    .select("question_id, position")
    .eq("quiz_id", quizId)
    .order("position");
  const questionIds = (rows ?? []).map((r) => (r as { question_id: string }).question_id);
  if (!questionIds.length) throw new ToolError("conflict", "That examination's paper has no questions to copy.");

  // A duplicate is a NEW paper through the SAME authoring service, so plan
  // limits, tenant scoping and the lock guard all apply. The original rows are
  // never modified, so an attempt in progress keeps exactly its paper.
  const { sessionContextForUser } = await import("../auth");
  const { savePaperForActor } = await import("../services/paperAuthoring");
  const session = await sessionContextForUser(runtime.admin, runtime.actor.userId, runtime.scope.organizationId);
  if (!session) throw new ToolError("permission_denied", "The acting user is not an active member of this organization.");
  const copy = await savePaperForActor(
    {
      title: newTitle,
      description: (source.description as string | null) ?? "",
      status: "draft",
      randomize_questions: false,
      randomize_options: false,
      time_per_question_seconds: 60,
      question_ids: questionIds,
    },
    { ctx: session, organizationId: runtime.scope.organizationId, supabase: runtime.supabase },
  );
  if ("error" in copy) throw new ToolError("internal", `The copy could not be created: ${copy.error}`);

  return {
    ok: true,
    data: { quiz_id: copy.id, source_quiz_id: quizId, source_examination_id: examId, question_ids: questionIds },
    summary:
      `Copied "${exam.title as string}" into a new draft paper "${newTitle}" (id ${copy.id}, ${questionIds.length} questions). ` +
      "The original examination and its attempts are untouched; publish the copy when it is ready.",
    links: [{ label: "Open the copied paper", href: `/dashboard/paper-builder/${copy.id}` }],
  };
}

async function publishExamination(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const examId = requireUuid(args.examination_id, "examination_id");
  const status = String(args.status ?? "");
  if (!["scheduled", "open"].includes(status)) throw new ToolError("invalid_arguments", "\"status\" must be \"scheduled\" or \"open\".");
  if (args.confirm !== true) throw new ToolError("invalid_arguments", "\"confirm\" must be true to publish an examination.");
  const exam = await requireOwned<Record<string, unknown>>(runtime, "exams", examId, "id, title, status, quiz_id");
  if (exam.status !== "draft" && exam.status !== "scheduled") {
    throw new ToolError("conflict", `Only a draft or scheduled examination can be published; this one is ${exam.status}.`);
  }
  // A paper with no questions cannot be sat. Refuse before changing status.
  const { count } = await runtime.admin
    .from("quiz_questions")
    .select("id", { count: "exact", head: true })
    .eq("quiz_id", (exam.quiz_id as string) ?? "");
  if (!count) throw new ToolError("conflict", "The examination's paper has no questions, so it cannot be published.");

  const { data, error } = await runtime.supabase
    .from("exams")
    .update({ status })
    .eq("id", examId)
    .eq("organization_id", runtime.scope.organizationId)
    .select("id, status")
    .maybeSingle();
  if (error || !data) throw new ToolError("internal", "The examination status could not be changed; nothing was published.");

  return {
    ok: true,
    data: { examination_id: examId, status: data.status },
    summary: `"${exam.title as string}" is now ${data.status}. Candidates reach it through its access link.`,
    links: [{ label: "Open the examination", href: `/dashboard/exams/${examId}` }],
  };
}

async function compareExaminations(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const leftId = requireUuid(args.left_id, "left_id");
  const rightId = requireUuid(args.right_id, "right_id");
  const [left, right] = await Promise.all([loadExamPaper(runtime, leftId), loadExamPaper(runtime, rightId)]);
  const fingerprint = (qs: PaperQuestion[]) => new Set(qs.map((q) => q.prompt.toLowerCase().replace(/\s+/g, " ").trim()));
  const leftSet = fingerprint(left.questions);
  const rightSet = fingerprint(right.questions);
  const onlyLeft = left.questions.filter((q) => !rightSet.has(q.prompt.toLowerCase().replace(/\s+/g, " ").trim()));
  const onlyRight = right.questions.filter((q) => !leftSet.has(q.prompt.toLowerCase().replace(/\s+/g, " ").trim()));
  const totals = (qs: PaperQuestion[]) => ({
    questions: qs.length,
    marks: qs.reduce((s, q) => s + q.points, 0),
    byDifficulty: countBy(qs, (q) => q.difficulty ?? "unset"),
    byTopic: countBy(qs, (q) => q.topic ?? "untagged"),
  });
  return {
    ok: true,
    data: {
      left: { id: leftId, title: left.exam.title, ...totals(left.questions) },
      right: { id: rightId, title: right.exam.title, ...totals(right.questions) },
      only_in_left: onlyLeft.map((q) => truncate(q.prompt, 160)),
      only_in_right: onlyRight.map((q) => truncate(q.prompt, 160)),
    },
    summary: `Compared "${left.exam.title as string}" with "${right.exam.title as string}": ${onlyLeft.length} question(s) only in the first, ${onlyRight.length} only in the second.`,
    preview: {
      kind: "diff",
      title: "Version comparison",
      sections: [
        {
          heading: "Totals",
          rows: [
            { label: String(left.exam.title), value: `${left.questions.length} questions · ${totals(left.questions).marks} marks` },
            { label: String(right.exam.title), value: `${right.questions.length} questions · ${totals(right.questions).marks} marks` },
          ],
        },
        { heading: "Only in the first version", bullets: onlyLeft.slice(0, 20).map((q) => truncate(q.prompt, 140)) },
        { heading: "Only in the second version", bullets: onlyRight.slice(0, 20).map((q) => truncate(q.prompt, 140)) },
      ],
    },
  };
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return out;
}

/* ─────────────────────────── questions ─────────────────────────── */

async function getQuestionBank(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const limit = optionalNumber(args.limit, "limit", 1, 50) ?? 20;
  let query = runtime.admin
    .from("questions")
    .select("id, type, prompt, points, difficulty, topic, status, created_at")
    .eq("organization_id", runtime.scope.organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const type = optionalString(args.type, 40);
  if (type) query = query.eq("type", type);
  const difficulty = optionalString(args.difficulty, 20);
  if (difficulty) query = query.eq("difficulty", difficulty);
  const status = optionalString(args.status, 20);
  if (status) query = query.eq("status", status);
  if (typeof args.query === "string" && args.query.trim()) query = query.ilike("prompt", `%${args.query.trim()}%`);
  const { data, error } = await query;
  if (error) throw new ToolError("internal", "The question bank could not be read.");
  const rows = (data ?? []).map((q) => ({
    id: q.id as string,
    type: q.type as string,
    prompt: truncate((q.prompt as string) ?? "", 200),
    points: Number(q.points ?? 0),
    difficulty: q.difficulty as string,
    topic: (q.topic as string | null) ?? null,
    status: q.status as string,
  }));
  return {
    ok: true,
    data: { questions: rows, count: rows.length },
    summary: `Found ${rows.length} question(s).`,
    preview: {
      kind: "questions",
      title: "Question bank",
      sections: rows.length
        ? [{ heading: "Questions", rows: rows.map((q) => ({ label: truncate(q.prompt.replace(/\s+/g, " "), 120), value: `${q.points} mark(s) · ${q.type} · ${q.status}` })) }]
        : [{ heading: "Questions", paragraphs: ["No question matches."] }],
    },
  };
}

async function createQuestion(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const allowed = ["single_choice", "multiple_select", "true_false", "short_answer", "numeric", "open_ended", "assess_parts"];
  const type = String(args.type ?? "");
  if (!allowed.includes(type)) throw new ToolError("invalid_arguments", `"type" must be one of ${allowed.join(", ")}.`);
  const prompt = boundedString(args.prompt, "prompt", 8000);
  const points = finiteNumber(args.points, "points", 0, 1000);
  const difficulty = String(args.difficulty ?? "medium");
  if (!["easy", "medium", "hard", "competition"].includes(difficulty)) {
    throw new ToolError("invalid_arguments", "\"difficulty\" must be easy, medium, hard or competition.");
  }
  const options = Array.isArray(args.options)
    ? (args.options as { label?: unknown; is_correct?: unknown }[])
        .filter((o) => typeof o?.label === "string" && o.label.trim())
        .slice(0, 12)
        .map((o) => ({ label: String(o.label).slice(0, 2000), is_correct: o.is_correct === true }))
    : [];
  const config: Record<string, unknown> = {};
  if (type === "numeric") {
    if (!Number.isFinite(Number(args.numeric_answer))) throw new ToolError("invalid_arguments", "A numeric question needs \"numeric_answer\".");
    config.numeric_answer = Number(args.numeric_answer);
    config.tolerance = optionalNumber(args.tolerance, "tolerance", 0, 1000) ?? 0;
  }
  if (type === "open_ended") {
    const criteria = boundedString(args.marking_criteria, "marking_criteria", 4000);
    config.marking_criteria = criteria;
  }
  if (type === "assess_parts" && Array.isArray(args.parts)) {
    config.parts = (args.parts as Record<string, unknown>[]).slice(0, 12);
  }

  const proposed: ProposedQuestion = {
    ref: "q1",
    type: type as ProposedQuestion["type"],
    prompt,
    points,
    difficulty: difficulty as ProposedQuestion["difficulty"],
    topic: optionalString(args.topic, 120),
    explanation: optionalString(args.explanation, 4000),
    options,
    config,
    parts: config.parts as ProposedQuestion["parts"],
    markingCriteria: config.marking_criteria as string | undefined,
  };
  const report = validateProposedExam({
    title: "Single question check",
    durationMinutes: 60,
    sections: [{ id: "A", title: "All", refs: ["q1"] }],
    questions: [proposed],
  });
  if (report.errors.some((e) => e.code !== "marks_per_minute")) {
    const message = `The question was not saved: ${report.errors.map((e) => e.message).join(" ")}`;
    return {
      ok: false,
      error: { code: "invalid_arguments", message },
      data: { errors: report.errors },
      summary: message,
    };
  }

  // A question saved without a subject sits outside the subject policies, which
  // is exactly the gap a teacher restricted to one subject could exploit — or
  // fall foul of. The name is resolved within the caller's organization and
  // stored with the row; a name the school has not registered leaves it null,
  // which is the same unrestricted case as a question authored before the field
  // existed. Resolution failures are reported, never swallowed.
  const subjectName = optionalString(args.subject, 120);
  let subjectId: string | null = null;
  if (subjectName) {
    const { resolveSubjectIdByName } = await import("@/lib/subjects");
    try {
      subjectId = await resolveSubjectIdByName(runtime.admin, runtime.scope.organizationId, subjectName);
    } catch (error) {
      throw new ToolError("internal", error instanceof Error ? error.message : "The subject could not be resolved.");
    }
  }

  const { saveQuestion } = await import("@/app/dashboard/questions/actions");
  const saved = await saveQuestion({
    type: type as never,
    prompt,
    explanation: proposed.explanation,
    points,
    difficulty: proposed.difficulty,
    topic: proposed.topic,
    subject_id: subjectId,
    status: "draft",
    // A question the assistant wrote is labelled as such, so it can be reviewed
    // and filtered separately from a teacher's own work.
    creation_method: "ai_generated",
    config,
    options,
  });
  if (!("ok" in saved) || !saved.ok || !saved.id) {
    throw new ToolError("internal", ("error" in saved && saved.error) || "The question could not be saved.");
  }
  return {
    ok: true,
    data: { question_id: saved.id },
    summary: `Created draft question ${saved.id} (${type}, ${points} mark(s)).`,
    links: [{ label: "Open the question", href: `/dashboard/questions/${saved.id}` }],
  };
}

async function generateQuestion(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const topic = String(args.topic ?? "");
  if (!TOPIC_CATALOG.some((t) => t.key === topic)) {
    throw new ToolError("invalid_arguments", `"topic" must be one of ${TOPIC_CATALOG.map((t) => t.key).join(", ")}.`);
  }
  const difficulty = (String(args.difficulty ?? "medium") as "easy" | "medium" | "hard");
  if (!["easy", "medium", "hard"].includes(difficulty)) {
    throw new ToolError("invalid_arguments", "\"difficulty\" must be easy, medium or hard.");
  }
  const gradeLabel = optionalString(args.grade_label, 80) ?? "Grade 9";
  const count = optionalNumber(args.count, "count", 1, 20) ?? 1;
  const seed = optionalString(args.seed, 120) ?? `${topic}|${difficulty}|${count}|${Date.now()}`;

  // Author one question per index from the same deterministic families the
  // examination generator uses, so a saved question is byte-for-byte the kind
  // of item a real paper contains — computed answers, not model guesses.
  const built = buildExamPlan({
    title: "Practice questions",
    durationMinutes: 30,
    questionCount: count,
    topics: [topic as TopicKey],
    // An explicit spread wins; otherwise the named difficulty fills the batch.
    difficultyMix:
      args.difficulty_mix && typeof args.difficulty_mix === "object"
        ? normaliseMix(args.difficulty_mix as Record<string, unknown>)
        : difficulty === "easy"
          ? { easy: 1, medium: 0, hard: 0 }
          : difficulty === "medium"
            ? { easy: 0, medium: 1, hard: 0 }
            : { easy: 0, medium: 0, hard: 1 },
    seed,
    gradeLabel,
    sections: [{ id: "qa", title: "Practice", share: 1 }],
  });

  // Every generated item passes the SAME structural review a whole paper does.
  // A malformed or unmarkable item is dropped here rather than saved, and if
  // nothing survives the caller is told why instead of receiving an empty list.
  const report = validateProposedExam(built.plan);
  const problemFor = new Map(report.errors.filter((e) => e.where).map((e) => [e.where as string, e]));
  const usable = built.plan.questions.filter((q) => !problemFor.has(q.ref));
  if (!usable.length) {
    const first = report.errors[0];
    throw new ToolError(
      "internal",
      first
        ? `The generator could not produce a valid question on "${topic}" for ${gradeLabel}: ${first.message}`
        : `No question could be generated for "${topic}" at ${gradeLabel}; try another topic.`,
    );
  }

  // Duplicate wordings are removed before saving: the bank must not fill with
  // the same item twice because a seed happened to repeat.
  const seen = new Set<string>();
  const unique = usable.filter((q) => {
    const fingerprint = promptFingerprint(q.prompt);
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });

  if (args.save === true) {
    const saved: { id: string; prompt: string; points: number; type: string }[] = [];
    const failures: string[] = [];
    for (const question of unique) {
      try {
        const result = await createQuestion(runtime, {
          type: question.type,
          prompt: question.prompt,
          points: question.points,
          difficulty: question.difficulty,
          topic: question.topic,
          // Carries the subject through, so a question authored for a teacher is
          // filed under the subject they teach instead of landing subjectless and
          // outside the scope rules.
          subject: args.subject,
          explanation: question.explanation,
          options: question.options,
          numeric_answer: question.config?.numeric_answer,
          tolerance: question.config?.tolerance,
          parts: question.parts,
          marking_criteria: question.markingCriteria,
        });
        const id = String((result.data as Record<string, unknown> | undefined)?.question_id ?? "");
        saved.push({ id, prompt: question.prompt, points: question.points, type: question.type });
      } catch (error) {
        // One refused item must not discard items the bank already accepted.
        failures.push(
          error instanceof ToolError
            ? error.message
            : `Question "${truncate(question.prompt, 60)}" could not be saved.`,
        );
      }
    }
    if (!saved.length) {
      throw new ToolError(
        "conflict",
        failures[0] ?? "None of the generated questions could be saved to the bank.",
      );
    }
    const bankHref = "/dashboard/questions";
    return {
      ok: true,
      data: {
        saved: true,
        questions: unique,
        question_ids: saved.map((s) => s.id),
        saved_count: saved.length,
        rejected_count: unique.length - saved.length,
        seed,
      },
      summary:
        `Saved ${saved.length} ${difficulty} ${topic.replace(/_/g, " ")} question(s) to the Question Bank` +
        (failures.length ? ` (${failures.length} could not be saved).` : ".") +
        " They are available in the bank now.",
      preview: {
        kind: "questions",
        title: `${saved.length} question(s) saved to the bank`,
        sections: unique.slice(0, 6).map((question, index) => ({
          heading: `${index + 1}. ${truncate(question.prompt.replace(/\s+/g, " "), 160)}`,
          rows: [
            { label: "Type", value: `${question.type} · ${question.points} mark(s) · ${question.difficulty}` },
            {
              label: "Answer",
              value: String(
                question.options?.find((o) => o.is_correct)?.label ??
                  question.config?.numeric_answer ??
                  "see marking criteria",
              ),
            },
          ],
          paragraphs: question.explanation ? [`Worked solution: ${question.explanation}`] : undefined,
        })),
      },
      links: [{ label: "Open the Question Bank", href: bankHref }],
      ...(failures.length ? { warnings: failures.slice(0, 5) } : {}),
    } as ToolResult & { warnings?: string[] };
  }

  const question = unique[0];
  return {
    ok: true,
    data: {
      questions: unique,
      count: unique.length,
      explanation: question?.explanation,
      seeded: true,
      note:
        `These ${unique.length} question(s) are computed, not model-generated. ` +
        "They were NOT saved: ask for them to be saved (or set save=true) to add them to the bank.",
    },
    summary: `Generated ${unique.length} ${difficulty} ${topic.replace(/_/g, " ")} question(s) for review; nothing was saved.`,
    preview: {
      kind: "questions",
      title: "Generated question(s)",
      sections: unique.slice(0, 6).map((q, index) => ({
        heading: `${index + 1}. ${truncate(q.prompt.replace(/\s+/g, " "), 160)}`,
        rows: [
          {
            label: "Answer",
            value: String(q.options?.find((o) => o.is_correct)?.label ?? q.config?.numeric_answer ?? "see marking criteria"),
          },
        ],
        paragraphs: q.explanation ? [`Worked solution: ${q.explanation}`] : undefined,
      })),
    },
  };
}

/* ─────────────────────────── quizzes ─────────────────────────── */

async function listQuizzes(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const limit = optionalNumber(args.limit, "limit", 1, 50) ?? 20;
  let query = runtime.admin
    .from("quizzes")
    .select("id, title, status, description, settings, created_at")
    .eq("organization_id", runtime.scope.organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const status = optionalString(args.status, 20);
  if (status) query = query.eq("status", status);
  if (typeof args.query === "string" && args.query.trim()) query = query.ilike("title", `%${args.query.trim()}%`);
  const { data, error } = await query;
  if (error) throw new ToolError("internal", "The paper list could not be read.");
  const rows = (data ?? []).map((q) => ({
    id: q.id as string,
    title: q.title as string,
    status: q.status as string,
    sections: Array.isArray((q.settings as Record<string, unknown> | null)?.sections) ? ((q.settings as Record<string, unknown>).sections as unknown[]).length : 0,
  }));
  return {
    ok: true,
    data: { quizzes: rows, count: rows.length },
    summary: `Found ${rows.length} paper(s).`,
  };
}

async function getQuiz(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const quizId = requireUuid(args.quiz_id, "quiz_id");
  const quiz = await requireOwned<Record<string, unknown>>(runtime, "quizzes", quizId, "id, title, description, status, settings, created_at");
  const { data: rows } = await runtime.admin
    .from("quiz_questions")
    .select("position, points, questions(id, type, prompt, difficulty, points)")
    .eq("quiz_id", quizId)
    .order("position");
  const questions = (rows ?? []).map((row) => {
    const q = (row as unknown as { questions: Record<string, unknown> }).questions ?? {};
    return {
      id: q.id as string,
      position: Number((row as { position: number }).position),
      points: Number((row as { points: number | null }).points ?? (q.points as number) ?? 0),
      type: (q.type as string) ?? "",
      prompt: truncate((q.prompt as string) ?? "", 200),
      difficulty: (q.difficulty as string) ?? null,
    };
  });
  const settings = (quiz.settings as Record<string, unknown> | null) ?? {};
  return {
    ok: true,
    data: {
      id: quiz.id,
      title: quiz.title,
      status: quiz.status,
      description: quiz.description,
      sections: settings.sections ?? [],
      randomize_questions: settings.randomize_questions === true,
      randomize_options: settings.randomize_options === true,
      questions,
      totals: { questions: questions.length, marks: questions.reduce((s, q) => s + q.points, 0) },
    },
    summary: `Read paper "${quiz.title as string}" — ${questions.length} questions.`,
  };
}

async function createQuiz(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const title = boundedString(args.title, "title", 160, 2);
  const generate = args.generate && typeof args.generate === "object" ? (args.generate as Record<string, unknown>) : null;
  const existing = Array.isArray(args.question_ids) ? (args.question_ids as unknown[]).map((id) => requireUuid(id, "question_ids")) : [];

  const questionIds: string[] = [];
  const drafts: ProposedQuestion[] = [];

  if (existing.length) {
    // Only questions from this organization may enter the paper.
    const { data: owned } = await runtime.admin
      .from("questions")
      .select("id")
      .eq("organization_id", runtime.scope.organizationId)
      .in("id", existing);
    const ownedIds = new Set((owned ?? []).map((row) => (row as { id: string }).id));
    if (ownedIds.size !== existing.length) throw new ToolError("invalid_arguments", "One or more question ids do not belong to this organization.");
    questionIds.push(...existing);
  }

  // The duration the teacher asked for, not a fixed 30. Quizzes store their
  // timing in `settings.time_per_question_seconds`, so a 20-minute/10-question
  // quiz must be 120 s per question rather than the previous hardcoded 60 (which
  // produced a 10-minute quiz that claimed to be 20).
  const durationMinutes = optionalNumber(args.duration_minutes, "duration_minutes", 1, 1440);
  const optionsPerQuestion = optionalNumber(args.options_per_question, "options_per_question", 2, 8);

  if (generate) {
    const count = optionalNumber(generate.question_count, "generate.question_count", 1, 60) ?? 10;
    const topics = Array.isArray(generate.topics) ? (generate.topics as string[]).filter((t): t is TopicKey => TOPIC_CATALOG.some((c) => c.key === t)) : [];
    // An unresolvable topic must never be dropped silently: the paper would then
    // be filled with grade-appropriate material and be about the wrong subject.
    const requestedTopics = Array.isArray(generate.topics) ? (generate.topics as unknown[]).filter((t): t is string => typeof t === "string") : [];
    const unknownTopics = requestedTopics.filter((t) => !TOPIC_CATALOG.some((c) => c.key === t));
    if (unknownTopics.length && !topics.length) {
      throw new ToolError(
        "invalid_arguments",
        `"${unknownTopics.join('", "')}" ${unknownTopics.length === 1 ? "is not a topic" : "are not topics"} EVALORA can generate from, so nothing was created.`,
        `Supported topics: ${TOPIC_CATALOG.map((c) => c.key).join(", ")}.`,
      );
    }
    const built = buildExamPlan({
      title,
      durationMinutes: durationMinutes ?? 30,
      questionCount: count,
      topics: topics.length ? topics : topicsForGrade(gradeOrderFromLabel(optionalString(args.grade_label, 80))),
      // Carried into the generator so the option count is honoured while the
      // questions are authored, not checked after the fact.
      preferredOptions: optionsPerQuestion,
      difficultyMix: generate.difficulty_mix && typeof generate.difficulty_mix === "object" ? normaliseMix(generate.difficulty_mix as Record<string, unknown>) : undefined,
      seed: `${title}|${count}|quiz`,
      gradeLabel: optionalString(args.grade_label, 80),
    });
    drafts.push(...built.plan.questions);

    // "four options per question" is a requirement, not decoration. Most
    // generator families are numeric or short-answer, so a four-option demand
    // cannot be met for every topic — and silently returning two-option items
    // would be the assistant claiming something it did not do. Say so instead,
    // before anything is written.
    if (optionsPerQuestion) {
      const wrongShape = drafts.filter((q) => (q.options?.length ?? 0) !== optionsPerQuestion);
      if (wrongShape.length) {
        throw new ToolError(
          "invalid_arguments",
          `${wrongShape.length} of ${drafts.length} generated item(s) on this topic cannot have exactly ${optionsPerQuestion} options, so nothing was created.`,
          wrongShape.length === drafts.length
            ? "This topic generates short-answer or numeric questions rather than multiple choice. Ask for a multiple-choice topic (quadratics, probability, sequences or inequalities), or drop the option requirement."
            : `Choose a topic whose items are multiple choice, or ask for ${drafts[0].options?.length ?? 0} options.`,
        );
      }
    }

    const { saveQuestion } = await import("@/app/dashboard/questions/actions");
    for (const question of drafts) {
      const saved = await saveQuestion({
        type: question.type as never,
        prompt: question.prompt,
        explanation: question.explanation,
        points: question.points,
        difficulty: question.difficulty,
        topic: question.topic,
        status: "draft",
        creation_method: "ai_generated",
        config: { ...(question.config ?? {}), ...(question.parts ? { parts: question.parts } : {}) },
        options: (question.options ?? []).map((o) => ({ label: o.label, is_correct: o.is_correct })),
      });
      if (!("ok" in saved) || !saved.ok || !saved.id) {
        throw new ToolError("internal", ("error" in saved && saved.error) || "A generated question could not be saved; the paper was not created.");
      }
      questionIds.push(saved.id);
    }
  }

  if (!questionIds.length) throw new ToolError("invalid_arguments", "Provide question_ids or a generate block: a paper needs questions.");

  const sectionTitles = Array.isArray(args.section_titles) ? (args.section_titles as unknown[]).filter((t): t is string => typeof t === "string").slice(0, 12) : [];
  const sections = sectionTitles.length
    ? sectionTitles.map((t, i) => ({
        id: String.fromCharCode(65 + i),
        title: t.slice(0, 200),
        questions: Math.ceil(questionIds.length / sectionTitles.length),
        marks: 0,
      }))
    : [{ id: "A", title: "All questions", questions: questionIds.length, marks: 0 }];

  const { saveQuiz } = await import("@/app/dashboard/quizzes/actions");
  const saved = await saveQuiz({
    title,
    description: optionalString(args.description, 1000) ?? "",
    status: "draft",
    randomize_questions: args.randomize_questions === true,
    randomize_options: args.randomize_options === true,
    time_per_question_seconds: durationMinutes
      ? Math.max(5, Math.min(3600, Math.round((durationMinutes * 60) / Math.max(1, questionIds.length))))
      : 60,
    question_ids: questionIds,
    sections,
    grade_label: optionalString(args.grade_label, 80) ?? "",
    subject: optionalString(args.subject, 120) ?? "",
    instructions: optionalString(args.instructions, 4000) ?? "",
  });
  if (!("ok" in saved) || !saved.ok || !saved.id) {
    throw new ToolError("internal", ("error" in saved && saved.error) || "The paper could not be saved.");
  }
  return {
    ok: true,
    data: {
      quiz_id: saved.id,
      question_ids: questionIds,
      status: "draft",
      authored_questions: drafts.length,
      duration_minutes: durationMinutes ?? null,
    },
    summary:
      `Created draft paper "${title}" with ${questionIds.length} question(s)` +
      `${drafts.length ? ` (${drafts.length} newly authored)` : ""}` +
      `${durationMinutes ? `, ${durationMinutes} minutes` : ""}.`,
    links: [{ label: "Open the paper", href: `/dashboard/paper-builder/${saved.id}` }],
  };
}

async function updateQuiz(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const quizId = requireUuid(args.quiz_id, "quiz_id");
  const quiz = await requireOwned<Record<string, unknown>>(runtime, "quizzes", quizId, "id, title, description, settings");
  const settings = { ...((quiz.settings as Record<string, unknown> | null) ?? {}) };
  const patch: Record<string, unknown> = {};
  const changes: string[] = [];
  const title = optionalString(args.title, 160);
  if (title) {
    patch.title = title;
    changes.push("title");
  }
  const description = optionalString(args.description, 1000);
  if (description !== undefined) {
    patch.description = description;
    changes.push("description");
  }
  const instructions = optionalString(args.instructions, 4000);
  if (instructions !== undefined) {
    settings.instructions = instructions;
    changes.push("instructions");
  }
  if (args.randomize_questions !== undefined) {
    settings.randomize_questions = args.randomize_questions === true;
    changes.push("randomize_questions");
  }
  if (args.randomize_options !== undefined) {
    settings.randomize_options = args.randomize_options === true;
    changes.push("randomize_options");
  }
  if (!changes.length) throw new ToolError("invalid_arguments", "No change was requested.");
  patch.settings = settings;
  patch.updated_at = new Date().toISOString();

  const { error } = await runtime.supabase
    .from("quizzes")
    .update(patch)
    .eq("id", quizId)
    .eq("organization_id", runtime.scope.organizationId);
  if (error) {
    // The attempt-lock guard is surfaced verbatim: it is the honest answer.
    throw new ToolError(
      "conflict",
      error.message.includes("ASSESSMENT_SOURCE_IMMUTABLE")
        ? "This paper's questions belong to an examination attempt already in progress, so its content is locked. Its title, instructions and settings can still be saved."
        : `The paper could not be updated: ${error.message}`,
    );
  }
  return {
    ok: true,
    data: { quiz_id: quizId, changed: changes },
    summary: `Updated ${changes.join(", ")} on paper "${(title ?? quiz.title) as string}". Question content was not rewritten.`,
    links: [{ label: "Open the paper", href: `/dashboard/paper-builder/${quizId}` }],
  };
}

/* ─────────────────────────── marking ─────────────────────────── */

async function getMarkingScheme(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const examId = requireUuid(args.examination_id, "examination_id");
  const { exam, questions } = await loadExamPaper(runtime, examId);
  const ids = questions.map((q) => q.id);
  const rows = ids.length
    ? (
        await runtime.admin
          .from("questions")
          .select("id, type, prompt, points, config, explanation, question_options(label, is_correct, position)")
          .in("id", ids)
      ).data ?? []
    : [];
  const byId = new Map((rows as Record<string, unknown>[]).map((r) => [r.id as string, r]));
  const scheme = questions.map((q) => {
    const row = (byId.get(q.id) ?? {}) as Record<string, unknown>;
    const config = (row.config as Record<string, unknown> | null) ?? {};
    const options = ((row.question_options as { label: string; is_correct: boolean; position: number }[] | undefined) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position);
    const key =
      q.type === "numeric"
        ? config.numeric_answer !== undefined
          ? `numeric answer ${String(config.numeric_answer)} ± ${String(config.tolerance ?? 0)}`
          : null
        : q.type === "short_answer"
          ? options.filter((o) => o.is_correct).map((o) => o.label).join(" / ")
          : q.type === "single_choice" || q.type === "true_false" || q.type === "multiple_select"
            ? options.filter((o) => o.is_correct).map((o) => o.label).join(" / ")
            : q.type === "assess_parts"
              ? `${Array.isArray(config.parts) ? (config.parts as unknown[]).length : 0} typed parts, each with its own key`
              : null;
    return {
      question_id: q.id,
      position: q.position + 1,
      type: q.type,
      points: q.points,
      prompt: truncate(q.prompt, 300),
      key,
      marking_criteria: typeof config.marking_criteria === "string" ? config.marking_criteria : null,
      worked_solution: (row.explanation as string | null) ?? null,
      automatically_marked: ["single_choice", "multiple_select", "true_false", "short_answer", "numeric", "assess_parts"].includes(q.type),
    };
  });
  return {
    ok: true,
    data: { examination_id: examId, title: exam.title, total_marks: questions.reduce((s, q) => s + q.points, 0), scheme },
    summary: `Read the marking scheme for "${exam.title as string}" — ${scheme.length} question(s), ${scheme.filter((s) => s.automatically_marked).length} automatically marked.`,
    preview: {
      kind: "marking",
      title: `Marking scheme — ${exam.title as string}`,
      sections: [
        {
          heading: "Questions",
          rows: scheme.map((s) => ({
            label: `Q${s.position} (${s.points} mark(s), ${s.type})`,
            value: s.key ? truncate(s.key, 120) : s.marking_criteria ? truncate(s.marking_criteria, 120) : "manual marking",
          })),
        },
      ],
    },
  };
}

async function getStudentResponses(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const examId = requireUuid(args.examination_id, "examination_id");
  await requireOwned(runtime, "exams", examId, "id");
  const attemptId = optionalUuid(args.attempt_id, "attempt_id");
  const limit = optionalNumber(args.limit, "limit", 1, 100) ?? 20;
  let attemptQuery = runtime.admin
    .from("exam_attempts")
    .select("id, candidate_id, status, score, max_score, submitted_at, exam_candidates(full_name)")
    .eq("exam_id", examId)
    .order("submitted_at", { ascending: false })
    .limit(limit);
  if (attemptId) attemptQuery = attemptQuery.eq("id", attemptId);
  const { data: attempts, error } = await attemptQuery;
  if (error) throw new ToolError("internal", "The attempts could not be read.");
  const ids = (attempts ?? []).map((a) => a.id as string);
  const answers = ids.length
    ? (
        await runtime.admin
          .from("exam_answers")
          .select("attempt_id, question_id, answer, is_correct, points_awarded, marked_by, grading_status")
          .in("attempt_id", ids)
      ).data ?? []
    : [];
  const byAttempt = new Map<string, typeof answers>();
  for (const answer of answers) {
    const list = byAttempt.get(answer.attempt_id as string) ?? [];
    list.push(answer);
    byAttempt.set(answer.attempt_id as string, list);
  }
  const rows = (attempts ?? []).map((attempt) => {
    const candidate = (attempt as unknown as { exam_candidates?: { full_name?: string } | null }).exam_candidates;
    return {
      attempt_id: attempt.id as string,
      candidate_name: candidate?.full_name ?? "Unknown candidate",
      status: attempt.status as string,
      score: attempt.score === null ? null : Number(attempt.score),
      max_score: attempt.max_score === null ? null : Number(attempt.max_score),
      submitted_at: (attempt.submitted_at as string | null) ?? null,
      responses: (byAttempt.get(attempt.id as string) ?? []).map((a) => ({
        question_id: a.question_id as string,
        answered: Boolean(a.answer && Object.keys(a.answer as object).length),
        points_awarded: a.points_awarded === null ? null : Number(a.points_awarded),
        is_correct: a.is_correct as boolean | null,
        marked_by: (a.marked_by as string | null) ?? null,
        grading_status: (a.grading_status as string | null) ?? null,
      })),
    };
  });
  return {
    ok: true,
    data: { examination_id: examId, attempts: rows, count: rows.length },
    summary: `Read ${rows.length} attempt(s) for the examination. ${rows.filter((r) => r.responses.length).length} have saved responses.`,
  };
}

/**
 * Proposes criterion marks for ONE open response.
 *
 * This deliberately reuses the existing proposal table and its constraints:
 * a rubric must be linked to the examination, the response must belong to a
 * submitted attempt in this organization, and the row is written with the
 * service role so a client can never fabricate a "model" suggestion. A human
 * accepts or rejects it in the marking screen; no mark is awarded here.
 */
async function markResponses(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const examId = requireUuid(args.examination_id, "examination_id");
  const attemptId = requireUuid(args.attempt_id, "attempt_id");
  const questionId = requireUuid(args.question_id, "question_id");
  const { describeAiMarking, suggestCriterionMarks, AiMarkingError } = await import("../ai-marking");
  const availability = describeAiMarking(runtime.env);
  if (!availability.configured) {
    throw new ToolError(
      "unconfigured",
      "AI marking is not configured on this deployment, so no proposal can be made. Nothing was changed.",
      availability.reason,
    );
  }

  const exam = await requireOwned<Record<string, unknown>>(runtime, "exams", examId, "id, quiz_id");
  const { data: attempt } = await runtime.admin
    .from("exam_attempts")
    .select("id, exam_id, status")
    .eq("id", attemptId)
    .eq("exam_id", examId)
    .maybeSingle();
  if (!attempt) throw new ToolError("not_found", "That attempt does not belong to this examination.");
  if (!["submitted", "auto_submitted", "marked"].includes(attempt.status as string)) {
    throw new ToolError("conflict", "The candidate has not submitted yet, so there is nothing to mark.");
  }

  const { data: answer } = await runtime.admin
    .from("exam_answers")
    .select("id, answer, points_awarded, marked_by")
    .eq("attempt_id", attemptId)
    .eq("question_id", questionId)
    .maybeSingle();
  if (!answer) throw new ToolError("not_found", "No response is saved for that question.");
  if (answer.marked_by) {
    throw new ToolError("conflict", "A teacher has already marked this response. AI proposals never overwrite a human mark.");
  }

  const { data: question } = await runtime.admin
    .from("questions")
    .select("id, prompt, points, type, organization_id")
    .eq("id", questionId)
    .eq("organization_id", runtime.scope.organizationId)
    .maybeSingle();
  if (!question) throw new ToolError("not_found", "That question does not belong to this organization.");
  if (question.type !== "open_ended") {
    throw new ToolError(
      "invalid_arguments",
      "Only constructed-response (open-ended) questions need marking proposals; objective questions are already scored by the platform.",
    );
  }

  const { data: quizQuestion } = await runtime.admin
    .from("quiz_questions")
    .select("id, points")
    .eq("quiz_id", (exam.quiz_id as string) ?? "")
    .eq("question_id", questionId)
    .maybeSingle();
  if (!quizQuestion) throw new ToolError("not_found", "That question is not part of this examination's paper.");
  const maxPoints = Number(quizQuestion.points ?? question.points ?? 0);

  // A rubric must be attached to this examination for the proposal to be
  // storable — the same precondition the marking screen enforces.
  const { data: link } = await runtime.admin
    .from("exam_rubric_links")
    .select("rubric_id")
    .eq("exam_id", examId)
    .or(`question_id.is.null,question_id.eq.${questionId}`)
    .limit(1)
    .maybeSingle();
  if (!link?.rubric_id) {
    throw new ToolError(
      "conflict",
      "This examination has no grading rubric attached, so a proposal could not be stored. Attach a rubric in the marking screen first. No mark was awarded.",
    );
  }
  const { data: criteria } = await runtime.admin
    .from("grading_rubric_criteria")
    .select("id, code, label, description, max_marks, position")
    .eq("rubric_id", link.rubric_id as string)
    .order("position");
  if (!criteria?.length) throw new ToolError("conflict", "The attached rubric has no criteria, so no proposal can be made.");

  const answerText = typeof (answer.answer as { text?: string } | null)?.text === "string"
    ? (answer.answer as { text: string }).text
    : "";
  let outcome;
  try {
    outcome = await suggestCriterionMarks(
      {
        question: String(question.prompt ?? "").slice(0, 4000),
        answer: answerText.slice(0, 8000),
        criteria: criteria.map((c) => ({
          id: c.id as string,
          code: (c.code as string | null) ?? null,
          label: c.label as string,
          description: (c.description as string | null) ?? null,
          maxMarks: Number(c.max_marks),
        })),
        maxPoints,
      },
      { env: runtime.env, transport: runtime.modelTransport },
    );
  } catch (error) {
    if (error instanceof AiMarkingError) {
      throw new ToolError(error.code === "unconfigured" ? "unconfigured" : "internal", error.message);
    }
    throw new ToolError("internal", "The model could not produce a proposal. No mark was changed.");
  }

  // A newer suggestion supersedes the old live ones; decided history is untouched.
  const { error: supersedeError } = await runtime.admin
    .from("ai_marking_proposals")
    .update({ status: "superseded" })
    .eq("answer_id", answer.id)
    .eq("status", "proposed");
  if (supersedeError) throw new ToolError("internal", "The existing proposals could not be replaced, so nothing was stored.");

  const { createHash } = await import("node:crypto");
  const answerDigest = createHash("sha256").update(answerText).digest("hex");
  const { error: insertError } = await runtime.admin.from("ai_marking_proposals").insert(
    outcome.suggestions.map((suggestion) => ({
      answer_id: answer.id,
      attempt_id: attemptId,
      exam_id: examId,
      organization_id: runtime.scope.organizationId,
      rubric_id: link.rubric_id,
      criterion_id: suggestion.criterionId,
      proposed_marks: suggestion.marks,
      rationale: suggestion.rationale,
      provider: outcome.provider,
      model: outcome.model,
      prompt_digest: outcome.promptDigest,
      answer_digest: answerDigest,
      status: "proposed",
      requested_by: runtime.actor.userId,
    })),
  );
  if (insertError) throw new ToolError("internal", "The proposal could not be stored, so no mark was awarded.");

  const total = Math.round(outcome.suggestions.reduce((sum, s) => sum + s.marks, 0) * 100) / 100;
  return {
    ok: true,
    data: {
      attempt_id: attemptId,
      question_id: questionId,
      proposals: outcome.suggestions.map((s) => ({ criterion_id: s.criterionId, marks: s.marks, rationale: s.rationale })),
      proposed_total: total,
      max: maxPoints,
      status: "proposed",
      provider: outcome.provider,
      model: outcome.model,
    },
    summary:
      `Proposed ${total}/${maxPoints} across ${outcome.suggestions.length} criterion(a). ` +
      "This is a PROPOSAL, not a mark: a teacher must accept or reject it before anything is awarded.",
    links: [{ label: "Review in the marking screen", href: `/dashboard/exams/${examId}` }],
  };
}

/* ─────────────────────────── adjustments & results ─────────────────────────── */

async function previewGradeAdjustment(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const examId = requireUuid(args.examination_id, "examination_id");
  const points = finiteNumber(args.points, "points", 0.01, 1000);
  const { loadExamScoreAdjustmentContext, previewScoreAdjustmentServer } = await import("../scoreAdjustmentsServer");
  const context = await loadExamScoreAdjustmentContext(runtime.admin, examId, { requiredOrganizationId: runtime.scope.organizationId });
  if (!context) throw new ToolError("not_found", "That examination does not belong to this organization.");
  const categoryKey = optionalString(args.category_key, 120) ?? context.categories[0]?.categoryKey ?? "";
  const categoryType = context.categories.find((c) => c.categoryKey === categoryKey)?.categoryType ?? "overall";
  if (!categoryKey) throw new ToolError("conflict", "This examination has no adjustable category, so no adjustment can be previewed.");
  const sessionCtx = await buildSessionContext(runtime);
  const result = await previewScoreAdjustmentServer(
    runtime.admin,
    sessionCtx,
    examId,
    "workspace",
    runtime.scope.organizationId,
    { categoryType, categoryKey, pointsRequested: points, scope: "all_eligible" },
  );
  if (!result.ok) throw new ToolError("conflict", result.error);
  const preview = result.preview;
  return {
    ok: true,
    data: {
      examination_id: examId,
      category: { type: preview.category.categoryType, key: preview.category.categoryKey, label: preview.category.categoryLabel },
      points_requested: preview.pointsRequested,
      applicable_rows: preview.applicableCount,
      capped_rows: preview.cappedCount,
      total_points_to_add: preview.totalPointsToAdd,
      can_confirm: preview.canConfirm,
      idempotency_key: result.idempotencyKey,
      sample: preview.applicableRows.slice(0, 20).map((r) => ({
        candidate: r.candidateName,
        before: r.originalExamScore,
        after: r.adjustedExamScore,
        applied: r.pointsApplied,
        capped: r.capped,
      })),
    },
    summary: `Previewed +${points} on ${preview.category.categoryLabel}: ${preview.applicableCount} candidate(s) would gain up to ${preview.totalPointsToAdd} total marks; ${preview.cappedCount} would be capped. Nothing was written.`,
    preview: {
      kind: "analysis",
      title: `Adjustment preview — ${preview.category.categoryLabel}`,
      sections: [
        {
          heading: "Impact",
          rows: preview.applicableRows.slice(0, 25).map((r) => ({
            label: r.candidateName,
            value: `${r.originalExamScore} → ${r.adjustedExamScore} (+${r.pointsApplied}${r.capped ? ", capped" : ""})`,
          })),
        },
        ...(preview.warnings.length ? [{ heading: "Warnings", bullets: preview.warnings }] : []),
      ],
    },
  };
}

async function applyGradeAdjustment(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const examId = requireUuid(args.examination_id, "examination_id");
  const points = finiteNumber(args.points, "points", 0.01, 1000);
  const reason = boundedString(args.reason, "reason", 500, 3);
  if (args.confirm !== true) throw new ToolError("invalid_arguments", "\"confirm\" must be true to apply an adjustment.");
  const { loadExamScoreAdjustmentContext, previewScoreAdjustmentServer, applyScoreAdjustmentServer } = await import("../scoreAdjustmentsServer");
  const context = await loadExamScoreAdjustmentContext(runtime.admin, examId, { requiredOrganizationId: runtime.scope.organizationId });
  if (!context) throw new ToolError("not_found", "That examination does not belong to this organization.");
  const categoryKey = optionalString(args.category_key, 120) ?? context.categories[0]?.categoryKey ?? "";
  const categoryType = context.categories.find((c) => c.categoryKey === categoryKey)?.categoryType ?? "overall";
  if (!categoryKey) throw new ToolError("conflict", "This examination has no adjustable category.");
  const sessionCtx = await buildSessionContext(runtime);

  // The ledger requires a preview token from a preview of the SAME request.
  const preview = await previewScoreAdjustmentServer(runtime.admin, sessionCtx, examId, "workspace", runtime.scope.organizationId, {
    categoryType,
    categoryKey,
    pointsRequested: points,
    scope: "all_eligible",
  });
  if (!preview.ok) throw new ToolError("conflict", preview.error);

  const applied = await applyScoreAdjustmentServer(runtime.admin, sessionCtx, examId, "workspace", runtime.scope.organizationId, {
    categoryType,
    categoryKey,
    pointsRequested: points,
    scope: "all_eligible",
    reason,
    idempotencyKey: preview.idempotencyKey,
  });
  if (!applied.ok) throw new ToolError("conflict", applied.error);
  return {
    ok: true,
    data: {
      examination_id: examId,
      adjustment_id: applied.adjustmentId,
      students_affected: applied.studentsAffected,
      capped_students: applied.cappedStudents,
      total_points_added: applied.totalPointsAdded,
      reason,
    },
    summary:
      `Applied +${points} to ${applied.studentsAffected} candidate(s) on ${preview.preview.category.categoryLabel} ` +
      `(${applied.totalPointsAdded} marks total; ${applied.cappedStudents} capped). Ledger entry ${applied.adjustmentId}.`,
    links: [{ label: "Open the adjustment ledger", href: `/dashboard/exams/${examId}/grade-adjustments` }],
  };
}

/**
 * Reconstructs the session shape the adjustment service expects.
 *
 * The services were written for a server action that has a full `SessionContext`
 * (profile + memberships). The AI core has the actor and the organization, so it
 * rebuilds the minimum this path reads: the profile status/role and the
 * membership for the target organization. A Super Admin is the only role for
 * which a synthetic membership is legitimate, and it is marked as such.
 */
async function buildSessionContext(runtime: ToolRuntime) {
  const { data: profile } = await runtime.admin
    .from("profiles")
    .select("id, email, full_name, platform_role, status")
    .eq("id", runtime.actor.userId)
    .maybeSingle();
  if (!profile) throw new ToolError("permission_denied", "The acting user's profile could not be resolved.");
  const { data: membership } = await runtime.admin
    .from("organization_members")
    .select("organization_id, role, organizations(id, name, slug, status)")
    .eq("user_id", runtime.actor.userId)
    .eq("organization_id", runtime.scope.organizationId)
    .eq("status", "active")
    .maybeSingle();
  const isSuper = profile.platform_role === "super_admin";
  if (!membership && !isSuper) {
    throw new ToolError("permission_denied", "The acting user is not an active member of this organization.");
  }
  return {
    user: { id: profile.id as string, email: (profile.email as string) ?? "" },
    profile,
    memberships: membership
      ? [membership as never]
      : [
          {
            organization_id: runtime.scope.organizationId,
            role: "owner" as const,
            organizations: { id: runtime.scope.organizationId, name: "Workspace", slug: "workspace", status: "active" },
          },
        ],
    tenantSlug: null,
    tenantDenied: false,
    workspaceSelected: true,
  };
}

async function getExamResults(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const examId = requireUuid(args.examination_id, "examination_id");
  const exam = await requireOwned<Record<string, unknown>>(runtime, "exams", examId, "id, title, settings, status");
  const settings = (exam.settings as Record<string, unknown> | null) ?? {};
  const { data: attempts, error } = await runtime.admin
    .from("exam_attempts")
    .select("id, status, score, max_score, submitted_at, exam_candidates(full_name)")
    .eq("exam_id", examId);
  if (error) throw new ToolError("internal", "The results could not be read.");
  const marked = (attempts ?? []).filter((a) => a.status === "marked" && a.score !== null);
  const submitted = (attempts ?? []).filter((a) => a.status === "submitted" || a.status === "auto_submitted" || a.status === "marked");
  const percents = marked.map((a) => (Number(a.max_score) > 0 ? (Number(a.score) / Number(a.max_score)) * 100 : 0));
  const passMark = Number(settings.pass_mark_percent ?? 50);
  const rows = (attempts ?? []).map((attempt) => {
    const candidate = (attempt as unknown as { exam_candidates?: { full_name?: string } | null }).exam_candidates;
    return {
      attempt_id: attempt.id as string,
      candidate_name: candidate?.full_name ?? "Unknown candidate",
      status: attempt.status as string,
      score: attempt.score === null ? null : Number(attempt.score),
      max_score: attempt.max_score === null ? null : Number(attempt.max_score),
      percent: attempt.score !== null && Number(attempt.max_score) > 0 ? Math.round((Number(attempt.score) / Number(attempt.max_score)) * 10000) / 100 : null,
    };
  });
  const data = {
    examination_id: examId,
    title: exam.title,
    results_published: Boolean(settings.results_published),
    results_validated: Boolean(settings.results_validated),
    pass_mark_percent: passMark,
    counts: {
      candidates: rows.length,
      submitted: submitted.length,
      marked: marked.length,
      unmarked: rows.length - marked.length,
    },
    average_percent: percents.length ? Math.round((percents.reduce((s, p) => s + p, 0) / percents.length) * 100) / 100 : null,
    pass_rate_percent: percents.length ? Math.round((percents.filter((p) => p >= passMark).length / percents.length) * 10000) / 100 : null,
    candidates: rows,
    note:
      marked.length === 0
        ? "No attempt has been marked yet, so no average can be reported. Nothing is estimated."
        : undefined,
  };
  return {
    ok: true,
    data,
    summary:
      marked.length === 0
        ? `"${exam.title as string}": ${rows.length} candidate(s), none marked yet — no statistics are available.`
        : `"${exam.title as string}": ${marked.length}/${rows.length} marked, average ${data.average_percent}%, pass rate ${data.pass_rate_percent}%. Results are ${data.results_published ? "published" : "not published"}.`,
    preview: {
      kind: "analysis",
      title: `Results — ${exam.title as string}`,
      sections: [
        {
          heading: "Summary",
          rows: [
            { label: "Candidates", value: String(rows.length) },
            { label: "Marked", value: String(marked.length) },
            { label: "Average", value: data.average_percent === null ? "not available" : `${data.average_percent}%` },
            { label: "Pass rate", value: data.pass_rate_percent === null ? "not available" : `${data.pass_rate_percent}%` },
            { label: "Publication", value: data.results_published ? "published" : "not published" },
          ],
        },
        {
          heading: "Candidates",
          rows: rows.slice(0, 40).map((r) => ({ label: r.candidate_name, value: r.percent === null ? r.status : `${r.percent}%` })),
        },
      ],
    },
  };
}

async function publishResults(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const examId = requireUuid(args.examination_id, "examination_id");
  const publish = args.publish === true;
  if (args.confirm !== true) throw new ToolError("invalid_arguments", "\"confirm\" must be true.");
  const exam = await requireOwned<Record<string, unknown>>(runtime, "exams", examId, "id, title, settings");
  const settings = { ...((exam.settings as Record<string, unknown> | null) ?? {}) };

  if (publish) {
    // The platform requires validation before publication (assessmentConfig).
    // The AI does not get a shortcut around it.
    const { count: unmarked } = await runtime.admin
      .from("exam_attempts")
      .select("id", { count: "exact", head: true })
      .eq("exam_id", examId)
      .in("status", ["in_progress"]);
    if (unmarked) throw new ToolError("conflict", `${unmarked} attempt(s) are still in progress, so results cannot be published.`);
    settings.results_validated = true;
  }
  settings.results_published = publish;
  settings.results_published_at = publish ? new Date().toISOString() : null;

  const { data, error } = await runtime.supabase
    .from("exams")
    .update({ settings })
    .eq("id", examId)
    .eq("organization_id", runtime.scope.organizationId)
    .select("id")
    .maybeSingle();
  if (error || !data) throw new ToolError("internal", "The publication flag could not be written; nothing was published.");
  return {
    ok: true,
    data: { examination_id: examId, results_published: publish },
    summary: publish
      ? `Published the results of "${exam.title as string}". Candidates can now see their marks.`
      : `Withdrew the published results of "${exam.title as string}".`,
    links: [{ label: "Open the examination", href: `/dashboard/exams/${examId}` }],
  };
}

/* ─────────────────────────── analytics ─────────────────────────── */

async function getClassStatistics(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const classId = requireUuid(args.class_id, "class_id");
  await requireOwned(runtime, "classes", classId, "id, name");
  const examId = optionalUuid(args.examination_id, "examination_id");

  let examQuery = runtime.admin
    .from("exams")
    .select("id, title, settings")
    .eq("organization_id", runtime.scope.organizationId);
  if (examId) examQuery = examQuery.eq("id", examId);
  const { data: exams } = await examQuery.limit(50);
  const examIds = (exams ?? []).map((e) => e.id as string);
  if (!examIds.length) {
    return { ok: true, data: { class_id: classId, examinations: 0, note: "No examination exists in this workspace yet." }, summary: "No examination data exists, so no statistics are reported." };
  }
  const { data: attempts } = await runtime.admin
    .from("exam_attempts")
    .select("id, exam_id, status, score, max_score, submitted_at, exam_candidates(full_name, class_id)")
    .in("exam_id", examIds);
  const classAttempts = (attempts ?? []).filter((a) => {
    const candidate = (a as unknown as { exam_candidates?: { class_id?: string | null } | null }).exam_candidates;
    return candidate?.class_id === classId;
  });
  const marked = classAttempts.filter((a) => a.status === "marked" && a.score !== null && Number(a.max_score) > 0);
  const percents = marked.map((a) => (Number(a.score) / Number(a.max_score)) * 100);
  const byExam = examIds
    .map((id) => {
      const rows = classAttempts.filter((a) => a.exam_id === id && a.status === "marked" && Number(a.max_score) > 0);
      if (!rows.length) return null;
      const ps = rows.map((a) => (Number(a.score) / Number(a.max_score)) * 100);
      return {
        examination_id: id,
        title: (exams ?? []).find((e) => e.id === id)?.title as string,
        candidates: rows.length,
        average_percent: Math.round((ps.reduce((s, p) => s + p, 0) / ps.length) * 100) / 100,
        lowest: Math.round(Math.min(...ps) * 100) / 100,
        highest: Math.round(Math.max(...ps) * 100) / 100,
      };
    })
    .filter(Boolean);
  return {
    ok: true,
    data: {
      class_id: classId,
      attempts: classAttempts.length,
      marked: marked.length,
      average_percent: percents.length ? Math.round((percents.reduce((s, p) => s + p, 0) / percents.length) * 100) / 100 : null,
      by_examination: byExam,
      note:
        classAttempts.length === 0
          ? "No attempt in this class is linked to those examinations, so there is nothing to average."
          : marked.length === 0
            ? "Attempts exist but none is marked yet; no average is reported."
            : undefined,
    },
    summary:
      marked.length === 0
        ? "No marked attempt exists for this class in those examinations; no statistics were produced."
        : `${marked.length} marked attempt(s), class average ${Math.round((percents.reduce((s, p) => s + p, 0) / percents.length) * 100) / 100}%.`,
  };
}

async function analyzeExamPerformance(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const reference = optionalString(args.reference, 400);
  const examId = args.examination_id !== undefined
    ? requireUuid(args.examination_id, "examination_id")
    : reference
      ? await resolveExaminationReference(runtime, reference)
      : (() => { throw new ToolError("invalid_arguments", "Which examination? Give an id or describe it."); })();
  const { exam, questions } = await loadExamPaper(runtime, examId);
  const { data: attempts } = await runtime.admin
    .from("exam_attempts")
    .select("id, status")
    .eq("exam_id", examId);
  const attemptIds = (attempts ?? []).filter((a) => a.status !== "in_progress").map((a) => a.id as string);
  if (!attemptIds.length) {
    return {
      ok: true,
      data: { examination_id: examId, attempts: 0, note: "No submitted attempt exists yet, so no analysis is possible." },
      summary: `"${exam.title as string}" has no submitted attempt: there is nothing to analyse.`,
    };
  }
  const { data: answers } = await runtime.admin
    .from("exam_answers")
    .select("attempt_id, question_id, is_correct, points_awarded, marked_by")
    .in("attempt_id", attemptIds);
  const byQuestion = new Map<string, { answered: number; correct: number; awarded: number; manual: number }>();
  for (const question of questions) byQuestion.set(question.id, { answered: 0, correct: 0, awarded: 0, manual: 0 });
  for (const answer of answers ?? []) {
    const entry = byQuestion.get(answer.question_id as string);
    if (!entry) continue;
    entry.answered++;
    if (answer.is_correct === true) entry.correct++;
    entry.awarded += Number(answer.points_awarded ?? 0);
    if (answer.marked_by) entry.manual++;
  }
  const perQuestion = questions.map((q) => {
    const entry = byQuestion.get(q.id)!;
    return {
      question_id: q.id,
      position: q.position + 1,
      points: q.points,
      section: q.section,
      topic: q.topic,
      answered: entry.answered,
      success_rate: entry.answered ? Math.round((entry.correct / entry.answered) * 10000) / 100 : null,
      average_points: entry.answered ? Math.round((entry.awarded / entry.answered) * 100) / 100 : null,
    };
  });
  const measured = perQuestion.filter((q) => q.success_rate !== null);
  const hardest = [...measured].sort((a, b) => (a.success_rate ?? 0) - (b.success_rate ?? 0)).slice(0, 5);
  const easiest = [...measured].sort((a, b) => (b.success_rate ?? 0) - (a.success_rate ?? 0)).slice(0, 5);
  const byTopic = new Map<string, { n: number; ok: number }>();
  for (const q of measured) {
    const key = q.topic ?? "untagged";
    const entry = byTopic.get(key) ?? { n: 0, ok: 0 };
    entry.n += q.answered;
    entry.ok += Math.round(((q.success_rate ?? 0) / 100) * q.answered);
    byTopic.set(key, entry);
  }
  return {
    ok: true,
    data: {
      examination_id: examId,
      attempts: attemptIds.length,
      questions_measured: measured.length,
      hardest,
      easiest,
      topics: [...byTopic.entries()].map(([topic, v]) => ({
        topic,
        answered: v.n,
        success_rate: v.n ? Math.round((v.ok / v.n) * 10000) / 100 : null,
      })),
      note:
        measured.length < questions.length
          ? `${questions.length - measured.length} question(s) have no marked response yet, so they are excluded rather than reported as zero.`
          : undefined,
    },
    summary: `Analysed ${attemptIds.length} submitted attempt(s) across ${measured.length}/${questions.length} question(s). Recommendations are based only on the measured success rates.`,
    preview: {
      kind: "analysis",
      title: `Performance — ${exam.title as string}`,
      sections: [
        { heading: "Hardest questions", rows: hardest.map((q) => ({ label: `Q${q.position}`, value: `${q.success_rate}% correct${q.topic ? ` · ${q.topic}` : ""}` })) },
        { heading: "Easiest questions", rows: easiest.map((q) => ({ label: `Q${q.position}`, value: `${q.success_rate}% correct${q.topic ? ` · ${q.topic}` : ""}` })) },
        { heading: "By topic", rows: [...byTopic.entries()].map(([topic, v]) => ({ label: topic, value: v.n ? `${Math.round((v.ok / v.n) * 10000) / 100}%` : "no data" })) },
      ],
    },
  };
}

/* ─────────────────────────── agents ─────────────────────────── */

async function listAiAgents(runtime: ToolRuntime): Promise<ToolResult> {
  const { data } = await runtime.admin
    .from("ai_agents")
    .select("id, name, client, status, scopes, created_at, approved_at, revoked_at, token_last_rotated_at")
    .eq("organization_id", runtime.scope.organizationId)
    .order("created_at", { ascending: false });
  const rows = (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    client: row.client as string,
    status: row.status as string,
    scopes: row.scopes ?? [],
    created_at: row.created_at as string,
    approved_at: (row.approved_at as string | null) ?? null,
    revoked_at: (row.revoked_at as string | null) ?? null,
  }));
  return {
    ok: true,
    data: { agents: rows, count: rows.length },
    summary: `${rows.length} external agent credential(s) registered; ${rows.filter((r) => r.status === "approved").length} approved.`,
  };
}

/**
 * Registers an external agent credential through the SAME infrastructure Agent
 * Management uses (`createAgent`), so the AI cannot invent a parallel, weaker
 * registration path.
 *
 * Least privilege is enforced here rather than trusted from the request:
 *   - the requested permissions are intersected with what the OWNER actually
 *     holds, so an agent can never be granted more than the person it acts for;
 *   - when nothing is requested the agent gets read-only discovery plus the
 *     ability to draft, which is the smallest set that is still useful;
 *   - approval is immediate only when the caller owns the credential, exactly
 *     as the dashboard requires.
 *
 * The token is returned once, in this response only. It is never written to the
 * activity journal, the preview block or any log.
 */
async function registerAiAgent(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const name = boundedString(args.name, "name", 120, 2);
  const client = String(args.client ?? "custom");
  if (!AGENT_CLIENTS.includes(client as (typeof AGENT_CLIENTS)[number])) {
    throw new ToolError("invalid_arguments", `"client" must be one of ${AGENT_CLIENTS.join(", ")}.`);
  }

  // The owner defaults to the caller. Naming someone else is allowed (a manager
  // onboarding a colleague) but that credential must wait for approval — the
  // same rule the dashboard applies.
  let ownerId = runtime.actor.userId;
  const ownerEmail = optionalString(args.owner_email, 320)?.toLowerCase();
  if (ownerEmail && ownerEmail !== (runtime.actor.userEmail ?? "").toLowerCase()) {
    const { data: membershipRows } = await runtime.admin
      .from("organization_members")
      .select("user_id, profile:profiles(email)")
      .eq("organization_id", runtime.scope.organizationId)
      .eq("status", "active");
    const match = ((membershipRows ?? []) as unknown as { user_id: string; profile: { email: string | null } | null }[]).find(
      (row) => (row.profile?.email ?? "").toLowerCase() === ownerEmail,
    );
    if (!match) {
      throw new ToolError(
        "invalid_arguments",
        `"${ownerEmail}" is not an active member of this organization, so a credential for them could never be used.`,
      );
    }
    ownerId = match.user_id;
  }

  // Ask the platform what the owner may do, then keep only requested keys the
  // owner really holds. A permission the owner lacks is dropped, not granted.
  // The engine always resolves this (falling back to the same hasPermission the
  // caller already proved), so a missing resolver is a wiring bug, not input.
  const checkPermission = runtime.hasPermissionFor ?? ((permission: string) => runtime.authorize!(permission));
  const requested = String(args.allowed_permissions ?? "")
    .split(/[\s,]+/)
    .map((key) => key.trim())
    .filter((key) => key && isKnownPermission(key));

  const held: string[] = [];
  for (const permission of requested.length ? requested : DEFAULT_AGENT_PERMISSIONS) {
    const allowed = await checkPermission(permission);
    if (allowed) held.push(permission);
  }
  const refused = requested.filter((permission) => !held.includes(permission));
  if (!held.length) {
    throw new ToolError(
      "permission_denied",
      "None of the requested permissions are held by the agent's owner, so the credential would be powerless. Ask an administrator to grant them first.",
    );
  }

  const autoApprove = ownerId === runtime.actor.userId;
  const created = await createAgent(runtime.admin, {
    organizationId: runtime.scope.organizationId,
    name,
    description: optionalString(args.description, 2000),
    client: client as (typeof AGENT_CLIENTS)[number],
    ownerId,
    allowedPermissions: held,
    // Everything else is denied explicitly, so a later role change cannot widen
    // an existing credential without someone editing it.
    deniedPermissions: refused,
    rateLimitPerMinute: optionalNumber(args.rate_limit_per_minute, "rate_limit_per_minute", 1, 600) ?? 60,
    dailyCallLimit: optionalNumber(args.daily_call_limit, "daily_call_limit", 1, 1_000_000) ?? 2000,
    autoApprove,
    createdBy: runtime.actor.userId,
  });

  const status = created.agent.status;
  return {
    ok: true,
    data: {
      agent_id: created.agent.id,
      name: created.agent.name,
      client: created.agent.client,
      status,
      allowed_permissions: held,
      denied_permissions: refused,
      owner_id: ownerId,
      token: created.token,
      token_shown_once: true,
      endpoints: {
        rest: `${runtime.publicBaseUrl ?? ""}/api/ai/v1`,
        mcp: `${runtime.publicBaseUrl ?? ""}/api/mcp`,
      },
    },
    summary:
      `Registered agent "${created.agent.name}" (${created.agent.client}) with ${held.length} permission(s); status: ${status}. ` +
      "Copy the token now — it is shown once and cannot be retrieved again.",
    preview: {
      kind: "agent",
      title: `Agent "${created.agent.name}"`,
      sections: [
        {
          heading: "Credential",
          rows: [
            { label: "Status", value: status },
            { label: "Client", value: created.agent.client },
            { label: "Token prefix", value: created.token.slice(0, 18) },
            { label: "Owner", value: ownerId === runtime.actor.userId ? "you" : ownerEmail ?? ownerId },
          ],
        },
        { heading: "Permitted permissions", bullets: held },
        ...(refused.length ? [{ heading: "Not granted (owner lacks them)", bullets: refused }] : []),
      ],
    },
    links: [{ label: "Open Agent Management", href: "/dashboard/ai/agents" }],
  } as ToolResult;
}

async function revokeAiAgent(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const agentId = requireUuid(args.agent_id, "agent_id");
  const reason = boundedString(args.reason, "reason", 500, 3);
  if (args.confirm !== true) throw new ToolError("invalid_arguments", "\"confirm\" must be true to revoke an agent.");
  const agent = await requireOwned<Record<string, unknown>>(runtime, "ai_agents", agentId, "id, name, status");
  if (agent.status === "revoked") throw new ToolError("conflict", "That agent is already revoked.");
  const { error } = await runtime.admin.rpc("ai_revoke_agent", { p_agent_id: agentId, p_reason: reason });
  if (error) throw new ToolError("internal", "The agent could not be revoked. Its credential may still be valid; check Agent Management.");
  return {
    ok: true,
    data: { agent_id: agentId, name: agent.name, status: "revoked", reason },
    summary: `Revoked "${agent.name as string}". Its credential stops working immediately.`,
  };
}

/* ─────────────────────── school management ─────────────────────── */

/**
 * The school's live structure.
 *
 * Read through `runtime.admin` deliberately. The caller is already
 * authenticated, the organization is resolved server-side from the agent or
 * session, and every query is scoped by it — reading through a policy-bound
 * client here would only hide rows the caller is entitled to see, and would
 * present a partial school as the whole one.
 */
async function getSchoolStructure(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const { loadSchoolStructure } = await import("../services/schoolStructure");
  const structure = await loadSchoolStructure(runtime.admin, runtime.scope.organizationId);
  const includeCounts = args.include_counts !== false;

  const summary = [
    `${structure.organization.name}: ${structure.classes.length} class(es), ${structure.subjects.length} subject(s), ${structure.teachers.length} teacher(s)`,
    includeCounts ? `${structure.counts.students} student(s)` : null,
    structure.notes.length ? "Some lists could not be read (see notes)." : null,
  ]
    .filter(Boolean)
    .join("; ");

  return {
    ok: true,
    data: {
      organization: structure.organization,
      years: structure.years,
      grades: structure.grades,
      classes: structure.classes,
      subjects: structure.subjects,
      teachers: structure.teachers,
      ...(includeCounts ? { counts: structure.counts } : {}),
      notes: structure.notes,
    },
    summary,
  };
}

async function listStudents(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const limit = optionalNumber(args.limit, "limit", 1, 200) ?? 50;
  const query = optionalString(args.query, 120);
  const status = typeof args.status === "string" ? args.status : null;
  const classId = typeof args.class_id === "string" ? args.class_id : null;

  // Filtering by class goes through the enrollment table rather than the student
  // row, because a student's placement is the enrollment, not a column.
  let studentIdsForClass: string[] | null = null;
  if (classId) {
    const { data, error } = await runtime.admin
      .from("student_enrollments")
      .select("student_id")
      .eq("organization_id", runtime.scope.organizationId)
      .eq("class_id", classId)
      .eq("status", "active");
    if (error) throw new ToolError("internal", `Students in that class could not be read: ${error.message}`);
    studentIdsForClass = (data ?? []).map((row) => (row as { student_id: string }).student_id);
    if (!studentIdsForClass.length) {
      return { ok: true, data: { students: [], count: 0 }, summary: "No students are enrolled in that class." };
    }
  }

  let builder = runtime.admin
    .from("students")
    .select("id, full_name, email, student_ref, status")
    .eq("organization_id", runtime.scope.organizationId)
    .order("full_name")
    .limit(limit);
  if (status) builder = builder.eq("status", status);
  if (studentIdsForClass) builder = builder.in("id", studentIdsForClass);
  if (query) builder = builder.or(`full_name.ilike.%${query}%,email.ilike.%${query}%,student_ref.ilike.%${query}%`);

  const { data, error } = await builder;
  if (error) throw new ToolError("internal", `Students could not be read: ${error.message}`);

  const students = (data ?? []) as Record<string, unknown>[];
  return {
    ok: true,
    data: { students, count: students.length },
    summary: students.length
      ? `${students.length} student(s) found${query ? ` matching "${query}"` : ""}.`
      : "No students matched.",
  };
}

async function getStudent(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const studentId = typeof args.student_id === "string" ? args.student_id : null;
  const reference = optionalString(args.reference, 60);
  if (!studentId && !reference) {
    throw new ToolError("invalid_arguments", "Give either student_id or reference.");
  }

  let builder = runtime.admin
    .from("students")
    .select("id, full_name, email, student_ref, gender, date_of_birth, phone, guardian_name, guardian_contact, status")
    .eq("organization_id", runtime.scope.organizationId);
  builder = studentId ? builder.eq("id", requireUuid(studentId, "student_id")) : builder.ilike("student_ref", reference as string);

  const { data, error } = await builder.maybeSingle();
  if (error) throw new ToolError("internal", `That student could not be read: ${error.message}`);
  if (!data) throw new ToolError("not_found", "No student with that id or reference exists in this school.");

  const { data: enrollment } = await runtime.admin
    .from("student_enrollments")
    .select("class_id, academic_year_id, status, classes(name)")
    .eq("organization_id", runtime.scope.organizationId)
    .eq("student_id", data.id as string)
    .eq("status", "active")
    .maybeSingle();
  const row = enrollment as { class_id: string | null; classes?: { name?: string } | null } | null;

  return {
    ok: true,
    data: {
      ...data,
      class_id: row?.class_id ?? null,
      class_name: row?.classes?.name ?? null,
    },
    summary: `${data.full_name as string}${row?.classes?.name ? ` — ${row.classes.name}` : ""} (${data.status as string}).`,
    links: [{ label: "Open the student", href: `/dashboard/students/${data.id as string}` }],
  };
}

/**
 * Registers a student through the SAME service the dashboard form uses.
 *
 * The service enforces `students.create`, checks the class belongs to this
 * school, protects duplicate references and emails, and rolls the insert back if
 * enrollment fails. Nothing about a student record is re-implemented here; this
 * handler only binds the agent's identity to that service.
 */
async function createStudent(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const fullName = boundedString(args.full_name, "full_name", 160);
  const { registerStudentForActor } = await import("../services/studentRegistration");
  const { sessionContextForUser } = await import("../auth");

  const session = await sessionContextForUser(runtime.admin, runtime.actor.userId, runtime.scope.organizationId);
  if (!session) throw new ToolError("permission_denied", "The acting user is not an active member of this organization.");

  const result = await registerStudentForActor(
    {
      full_name: fullName,
      email: optionalString(args.email, 200) ?? undefined,
      student_ref: optionalString(args.student_ref, 60) ?? undefined,
      gender: optionalString(args.gender, 40) ?? undefined,
      date_of_birth: optionalString(args.date_of_birth, 40) ?? undefined,
      phone: optionalString(args.phone, 40) ?? undefined,
      guardian_name: optionalString(args.guardian_name, 160) ?? undefined,
      guardian_contact: optionalString(args.guardian_contact, 120) ?? undefined,
      class_id: typeof args.class_id === "string" ? requireUuid(args.class_id, "class_id") : undefined,
    },
    {
      ctx: session,
      organizationId: runtime.scope.organizationId,
      supabase: runtime.admin,
      // No browser session exists on the agent path, so the permission question
      // is asked through the resolver the request already authenticated with.
      authorize: runtime.authorize,
    },
  );

  if (!result.ok || !result.student) {
    return {
      ok: false,
      error: { code: "invalid_arguments", message: result.error ?? "The student could not be registered." },
      data: {},
      summary: result.error ?? "The student could not be registered.",
    };
  }

  return {
    ok: true,
    data: { student_id: result.student.id, class_id: result.student.class_id ?? null },
    summary: `Registered ${result.student.full_name}${result.student.class_id ? " and enrolled them in the chosen class" : " (no class selected)"}.`,
    links: [{ label: "Open the student", href: `/dashboard/students/${result.student.id}` }],
  };
}

async function listTeachers(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const { loadSchoolStructure } = await import("../services/schoolStructure");
  const structure = await loadSchoolStructure(runtime.admin, runtime.scope.organizationId);
  const query = optionalString(args.query, 120)?.toLowerCase();
  const subjectId = typeof args.subject_id === "string" ? args.subject_id : null;

  let teachers = structure.teachers;
  if (query) {
    teachers = teachers.filter(
      (t) => t.fullName.toLowerCase().includes(query) || (t.email ?? "").toLowerCase().includes(query),
    );
  }
  if (subjectId) teachers = teachers.filter((t) => t.subjectIds.includes(subjectId));

  return {
    ok: true,
    data: { teachers, count: teachers.length, notes: structure.notes },
    summary: teachers.length
      ? `${teachers.length} teacher(s).${structure.notes.length ? " Some lists could not be read." : ""}`
      : "No teachers matched.",
  };
}

async function getTeacherResponsibilities(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const teacherId = requireUuid(args.teacher_id, "teacher_id");
  const { loadTeacherResponsibilities } = await import("../services/schoolStructure");
  const responsibilities = await loadTeacherResponsibilities(runtime.admin, runtime.scope.organizationId, teacherId);
  if (!responsibilities) {
    throw new ToolError("not_found", "No teacher with that id is an active member of this school.");
  }

  // The grandfathering branch is stated, not implied. Reporting "no subjects"
  // for a teacher with no assignments would claim a restriction that the
  // policies do not apply.
  const summary = responsibilities.configured
    ? `${responsibilities.fullName}: ${responsibilities.homeroom.length} homeroom class(es), ${responsibilities.subjects.length} subject responsibility(ies).`
    : `${responsibilities.fullName} has no teaching assignment recorded, so the current policy does not restrict them by subject. Record their responsibilities to change that.`;

  return {
    ok: true,
    data: { ...responsibilities },
    summary,
    links: [{ label: "Open teaching assignments", href: "/dashboard/teachers/assignments" }],
  };
}

/**
 * Adds or revokes ONE teaching responsibility.
 *
 * Deliberately one row at a time: "make this teacher a homeroom teacher of JSS
 * 1A" is a statement an administrator or an assistant can state and a reader can
 * check. A tool that replaced a teacher's whole set would let a single mistaken
 * call revoke every responsibility they hold, including ones it never mentioned.
 * The bulk form exists in the UI, where the whole set is on screen.
 */
async function manageTeachingAssignment(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  const action = String(args.action ?? "");
  if (!["add", "revoke"].includes(action)) {
    throw new ToolError("invalid_arguments", "\"action\" must be \"add\" or \"revoke\".");
  }
  if (args.confirm !== true) {
    throw new ToolError("invalid_arguments", "\"confirm\" must be true; state the change to a human first.");
  }
  const teacherId = requireUuid(args.teacher_id, "teacher_id");
  const role = String(args.role ?? "");
  if (!["class_teacher", "subject_teacher"].includes(role)) {
    throw new ToolError("invalid_arguments", "\"role\" must be \"class_teacher\" or \"subject_teacher\".");
  }
  const classId = typeof args.class_id === "string" ? requireUuid(args.class_id, "class_id") : null;
  const subjectId = typeof args.subject_id === "string" ? requireUuid(args.subject_id, "subject_id") : null;

  if (role === "class_teacher" && (!classId || subjectId)) {
    throw new ToolError("invalid_arguments", "A homeroom responsibility names a class and no subject.");
  }
  if (role === "subject_teacher" && !subjectId) {
    throw new ToolError("invalid_arguments", "A subject responsibility must name a subject.");
  }

  // The teacher must be an active member of THIS organization. A profile id from
  // another school is not enough, and the assignments table has no way to say so
  // on its own.
  const { data: membership } = await runtime.admin
    .from("organization_members")
    .select("user_id, role, status, profiles(full_name)")
    .eq("organization_id", runtime.scope.organizationId)
    .eq("user_id", teacherId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) throw new ToolError("not_found", "That person is not an active member of this school.");
  if (!["teacher", "admin", "owner", "organizer"].includes(membership.role as string)) {
    throw new ToolError("permission_denied", "That member's role cannot hold a teaching responsibility.");
  }
  const teacherName =
    ((membership.profiles as unknown as { full_name?: string } | null)?.full_name as string) ?? "the teacher";

  const { loadTeachingContext, setTeachingAssignments } = await import("../teachingAssignments");
  const { assignments } = await loadTeachingContext(runtime.admin, runtime.scope.organizationId, teacherId);
  const matches = (row: { classId: string | null; subjectId: string | null; role: string }) =>
    row.role === role && (row.classId ?? null) === classId && (row.subjectId ?? null) === subjectId;
  const existing = assignments.some(matches);

  if (action === "add" && existing) {
    return {
      ok: true,
      data: { changed: false, teacher_id: teacherId, role, class_id: classId, subject_id: subjectId },
      summary: `${teacherName} already holds that responsibility; nothing was changed.`,
    };
  }
  if (action === "revoke" && !existing) {
    return {
      ok: false,
      error: { code: "not_found", message: "That responsibility is not recorded for this teacher." },
      data: {},
      summary: "That responsibility is not recorded for this teacher, so there was nothing to revoke.",
    };
  }

  // The desired set is the existing set plus or minus this one row. Passing it
  // through `setTeachingAssignments` means the tenant checks, the one-homeroom
  // rule and the audit trail all apply exactly as they do in the admin UI.
  const desired = assignments
    .filter((row) => !(action === "revoke" && matches(row)))
    .map((row) => ({ classId: row.classId, subjectId: row.subjectId, role: row.role }));
  if (action === "add") desired.push({ classId, subjectId, role: role as "class_teacher" | "subject_teacher" });

  let outcome: { added: number; removed: number };
  try {
    outcome = await setTeachingAssignments(runtime.admin, {
      organizationId: runtime.scope.organizationId,
      teacherId,
      assignedBy: runtime.actor.userId,
      desired,
    });
  } catch (error) {
    // A conflicting homeroom teacher raises here. Passing the database's reason
    // through is the difference between "it failed" and "JSS 1A already has a
    // homeroom teacher".
    throw new ToolError("conflict", error instanceof Error ? error.message : "The assignment could not be saved.");
  }

  const { audit } = await import("../admin");
  const session = await (await import("../auth")).sessionContextForUser(
    runtime.admin,
    runtime.actor.userId,
    runtime.scope.organizationId,
  );
  if (session) {
    await audit(session, "teacher.assignments_saved", "teaching_assignments", teacherId, runtime.scope.organizationId, {
      via: "ai_core",
      action,
      role,
      class_id: classId,
      subject_id: subjectId,
      added: outcome.added,
      removed: outcome.removed,
    });
  }

  return {
    ok: true,
    data: { changed: true, teacher_id: teacherId, role, class_id: classId, subject_id: subjectId, ...outcome },
    summary:
      action === "add"
        ? `Recorded ${role === "class_teacher" ? "a homeroom responsibility" : "a subject responsibility"} for ${teacherName}.`
        : `Revoked that responsibility from ${teacherName}.`,
    links: [{ label: "Open teaching assignments", href: "/dashboard/teachers/assignments" }],
  };
}

/**
 * What the acting user may actually do, and why.
 *
 * Two different questions are answered together because a refusal is only
 * useful when both are known: the permission (`questions.create`) and the
 * subject scope (which subjects that permission actually covers). A teacher who
 * holds `questions.create` but is assigned Mathematics cannot author Literature,
 * and an assistant that says only "you lack questions.create" would be lying.
 */
async function getEffectivePermissions(runtime: ToolRuntime, args: Record<string, unknown>): Promise<ToolResult> {
  void args;
  const { loadTeachingContext } = await import("../teachingAssignments");

  const { data: membership } = await runtime.admin
    .from("organization_members")
    .select("role, status")
    .eq("organization_id", runtime.scope.organizationId)
    .eq("user_id", runtime.actor.userId)
    .maybeSingle();

  // Read from the registry rather than a copied list: a tool added later is
  // covered without anyone remembering to add its permission here.
  const { TOOLS } = await import("./tools");
  const permissions: string[] = [];
  for (const permission of [...new Set(TOOLS.map((tool) => tool.risk.permission))].sort()) {
    const allowed = runtime.hasPermissionFor
      ? await runtime.hasPermissionFor(permission)
      : runtime.authorize
        ? await runtime.authorize(permission)
        : false;
    if (allowed) permissions.push(permission);
  }

  const { configured, assignments } = await loadTeachingContext(
    runtime.admin,
    runtime.scope.organizationId,
    runtime.actor.userId,
  );
  const subjectIds = [...new Set(assignments.filter((a) => a.role === "subject_teacher" && a.subjectId).map((a) => a.subjectId as string))];

  return {
    ok: true,
    data: {
      organization_id: runtime.scope.organizationId,
      member_role: (membership?.role as string) ?? null,
      member_status: (membership?.status as string) ?? null,
      actor_kind: runtime.actor.kind,
      permissions,
      teaching: {
        configured,
        subject_ids: subjectIds,
        homeroom_class_ids: assignments.filter((a) => a.role === "class_teacher").map((a) => a.classId),
        note: configured
          ? "Content authorship is limited to the subjects above."
          : "No teaching assignment is recorded, so subject scope does not currently restrict this account.",
      },
    },
    summary: configured
      ? `${permissions.length} permission(s); content authorship limited to ${subjectIds.length} subject(s).`
      : `${permissions.length} permission(s); no teaching assignment recorded.`,
  };
}

/* ─────────────────────────── dispatch ─────────────────────────── */

const HANDLERS: Record<string, (runtime: ToolRuntime, args: Record<string, unknown>) => Promise<ToolResult>> = {
  get_org_context: (r) => getOrgContext(r),
  list_examinations: listExaminations,
  get_examination: getExamination,
  create_examination: createExamination,
  validate_examination: validateExamination,
  update_examination: updateExamination,
  duplicate_examination: duplicateExamination,
  publish_examination: publishExamination,
  compare_examinations: compareExaminations,
  get_question_bank: getQuestionBank,
  create_question: createQuestion,
  generate_question: generateQuestion,
  list_quizzes: listQuizzes,
  get_quiz: getQuiz,
  create_quiz: createQuiz,
  update_quiz: updateQuiz,
  get_marking_scheme: getMarkingScheme,
  get_student_responses: getStudentResponses,
  mark_responses: markResponses,
  preview_grade_adjustment: previewGradeAdjustment,
  apply_grade_adjustment: applyGradeAdjustment,
  get_exam_results: getExamResults,
  publish_results: publishResults,
  get_class_statistics: getClassStatistics,
  analyze_exam_performance: analyzeExamPerformance,
  list_ai_agents: (r) => listAiAgents(r),
  register_ai_agent: registerAiAgent,
  revoke_ai_agent: revokeAiAgent,
  get_school_structure: getSchoolStructure,
  list_students: listStudents,
  get_student: getStudent,
  create_student: createStudent,
  list_teachers: listTeachers,
  get_teacher_responsibilities: getTeacherResponsibilities,
  manage_teaching_assignment: manageTeachingAssignment,
  get_effective_permissions: getEffectivePermissions,
};

export async function runTool(name: string, args: Record<string, unknown>, runtime: ToolRuntime): Promise<ToolResult> {
  const handler = HANDLERS[name];
  if (!handler) throw new ToolError("unsupported", `There is no handler for "${name}".`);
  return handler(runtime, args);
}

/** Exported for tests: the scorer is the same one candidates are marked with. */
export { scoreAnswer };
