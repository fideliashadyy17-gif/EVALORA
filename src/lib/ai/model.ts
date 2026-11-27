import "server-only";

/**
 * EVALORA AI CORE — model-driven examination authoring.
 *
 * Used only when a model credential exists. Two rules make this safe:
 *
 *   1. The model returns a PROPOSAL in a fixed JSON shape. Nothing it says is
 *      trusted: `parseModelPlan` re-types every field, drops anything unknown,
 *      and computes the marks from the declared per-question values rather than
 *      from the totals the model claims.
 *
 *   2. The result goes through the SAME validator as a deterministic paper. The
 *      prompting layer cannot grant an exception the template layer must obey.
 *
 * The prompt states that the answer key must be internally consistent; the
 * validator then *runs the real scorer* against it, so an inconsistent key is
 * rejected before anything is written.
 */

import { callModel, extractJsonObject, CoreModelError, resolveCoreProvider } from "./provider";
import type { MarkingTransport } from "../ai-marking";
import type { AiOrganizationContext } from "./context";
import type { PlanSpec } from "./generator";
import { topicLabel } from "./generator";
import type { ProposedExam, ProposedQuestion, ProposedSection } from "./validation";

export interface ModelPlanResult {
  plan: ProposedExam;
  provider: string;
  model: string;
  promptDigestNote: string;
}

const MAX_QUESTIONS = 40;

export function buildExamPrompt(spec: PlanSpec, context: AiOrganizationContext): { system: string; user: string } {
  const system = [
    "You are an experienced examiner authoring an original school examination for EVALORA.",
    "Return JSON ONLY, of this exact shape:",
    '{"title":string,"description":string,"instructions":string,"questions":[{"ref":string,"type":string,"prompt":string,' +
      '"points":number,"difficulty":"easy"|"medium"|"hard","topic":string,"subtopic":string,"explanation":string,' +
      '"options":[{"label":string,"is_correct":boolean}],"config":object,"parts":array,"marking_criteria":string}],' +
      '"sections":[{"id":string,"title":string,"instructions":string,"refs":[string]}]}',
    "Allowed question types: single_choice, multiple_select, true_false, short_answer, numeric, open_ended, assess_parts.",
    "Rules you must obey:",
    "1. Every question must be answerable and markable from the data you return.",
    "2. single_choice and true_false: exactly one option with is_correct true, at least two options.",
    "3. multiple_select: at least one correct option and at least three options.",
    "4. short_answer: put every accepted answer in options with is_correct true.",
    "5. numeric: return config.numeric_answer as a number and config.tolerance as a number (0 when exact).",
    "6. assess_parts: return parts[] with {id,label,prompt,kind:'numeric'|'text'|'expression',points,answer OR accepted[],hints:[string,string]}; the part points MUST sum to the question points.",
    "7. open_ended: return marking_criteria as a precise rubric.",
    "8. Mathematics uses LaTeX inside $$ ... $$ delimiters, balanced, KaTeX-compatible. Never use a single $.",
    "9. Every question belongs to exactly one section through sections[].refs.",
    "10. The sum of question points must equal the requested total when one is given.",
    "11. Never reuse the same wording twice. Never copy a published examination.",
    "Do not include any commentary outside the JSON object.",
  ].join("\n");

  const topics = spec.topics.map((t) => `${t} (${topicLabel(t)})`).join(", ");
  const user = [
    `Organization: ${context.organization.name}`,
    `Level / class: ${spec.gradeLabel ?? "not specified"}`,
    `Subject: ${spec.subject ?? "Mathematics"}`,
    `Curriculum: ${spec.curriculum ?? "not specified"}`,
    `Topics to cover: ${topics || "as appropriate for the level"}`,
    `Number of questions: exactly ${spec.questionCount}, distributed across ${spec.sections?.length ?? 2} section(s).`,
    spec.totalMarks ? `Total marks: exactly ${spec.totalMarks}.` : "Choose sensible marks.",
    `Duration: ${spec.durationMinutes} minutes.`,
    spec.difficultyMix
      ? `Difficulty mix: about ${Math.round(spec.difficultyMix.easy * 100)}% easy, ${Math.round(spec.difficultyMix.medium * 100)}% medium, ${Math.round(spec.difficultyMix.hard * 100)}% hard.`
      : "",
    spec.sections?.length
      ? `Sections: ${spec.sections.map((s) => `${s.id}. ${s.title}`).join(" | ")}.`
      : "Use a Section A (short answer / multiple choice) and a Section B (structured questions).",
    "Write the complete paper now, including the worked solution for every question.",
  ]
    .filter(Boolean)
    .join("\n");
  return { system, user };
}

const num = (value: unknown, fallback = 0): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const text = (value: unknown, max: number): string => (typeof value === "string" ? value.trim().slice(0, max) : "");

const QUESTION_TYPES = new Set([
  "single_choice",
  "multiple_select",
  "true_false",
  "short_answer",
  "numeric",
  "open_ended",
  "assess_parts",
]);

/**
 * Strict parse of a model reply.
 *
 * Anything malformed is DROPPED, not repaired into a plausible question: a
 * silently fixed question is a question nobody reviewed.
 */
export function parseModelPlan(raw: unknown, spec: PlanSpec): { plan: ProposedExam; dropped: string[] } {
  const body = raw as Record<string, unknown>;
  const questionsRaw = Array.isArray(body?.questions) ? body.questions : [];
  const dropped: string[] = [];
  const questions: ProposedQuestion[] = [];
  const seenRefs = new Set<string>();

  for (const entry of questionsRaw.slice(0, MAX_QUESTIONS)) {
    const row = entry as Record<string, unknown>;
    const type = text(row.type, 40);
    const prompt = text(row.prompt, 8000);
    const points = num(row.points, 0);
    if (!QUESTION_TYPES.has(type) || !prompt || points <= 0) {
      dropped.push(prompt ? `"${prompt.slice(0, 60)}…" (invalid type or marks)` : "an empty question");
      continue;
    }
    let ref = text(row.ref, 20) || `q${questions.length + 1}`;
    if (!/^[a-z0-9_-]{1,20}$/i.test(ref) || seenRefs.has(ref)) ref = `q${questions.length + 1}`;
    while (seenRefs.has(ref)) ref = `${ref}x`;
    seenRefs.add(ref);

    const options = Array.isArray(row.options)
      ? row.options
          .slice(0, 12)
          .map((o) => ({ label: text((o as Record<string, unknown>)?.label, 2000), is_correct: (o as Record<string, unknown>)?.is_correct === true }))
          .filter((o) => o.label)
      : [];
    const config: Record<string, unknown> =
      row.config && typeof row.config === "object" && !Array.isArray(row.config)
        ? { ...(row.config as Record<string, unknown>) }
        : {};
    if (type === "numeric") {
      if (!Number.isFinite(Number(config.numeric_answer))) {
        dropped.push(`"${prompt.slice(0, 60)}…" (numeric question without a numeric answer)`);
        continue;
      }
      config.numeric_answer = Number(config.numeric_answer);
      config.tolerance = Number.isFinite(Number(config.tolerance)) ? Math.max(0, Number(config.tolerance)) : 0;
    }
    const parts = type === "assess_parts" && Array.isArray(row.parts)
      ? row.parts.slice(0, 12).map((p, index) => {
          const part = (p ?? {}) as Record<string, unknown>;
          const kind = text(part.kind, 12);
          const hints = Array.isArray(part.hints) ? part.hints.map((h) => text(h, 400)) : [];
          return {
            id: text(part.id, 12) || String.fromCharCode(97 + index),
            label: text(part.label, 12) || `(${String.fromCharCode(97 + index)})`,
            prompt: text(part.prompt, 2000),
            kind: (kind === "numeric" || kind === "text" || kind === "expression" ? kind : "text") as "numeric" | "text" | "expression",
            points: num(part.points, 0),
            unit: text(part.unit, 20) || undefined,
            answer: kind === "numeric" ? num(part.answer, NaN) : undefined,
            tolerance: kind === "numeric" ? Math.max(0, num(part.tolerance, 0)) : undefined,
            accepted: Array.isArray(part.accepted) ? part.accepted.map((a) => text(a, 2000)).filter(Boolean) : undefined,
            hints: [hints[0] ?? "", hints[1] ?? ""] as [string, string],
            strand: text(part.strand, 20) || undefined,
          };
        })
      : undefined;

    questions.push({
      ref,
      type: type as ProposedQuestion["type"],
      prompt,
      points,
      difficulty: (["easy", "medium", "hard", "competition"].includes(String(row.difficulty))
        ? row.difficulty
        : "medium") as ProposedQuestion["difficulty"],
      topic: text(row.topic, 120) || undefined,
      subtopic: text(row.subtopic, 160) || undefined,
      explanation: text(row.explanation, 8000) || undefined,
      options,
      config,
      parts,
      markingCriteria: text(row.marking_criteria, 4000) || undefined,
    });
  }

  // Sections: keep only references that exist, and only one section per ref.
  const refs = new Set(questions.map((q) => q.ref));
  const used = new Set<string>();
  const sectionsRaw = Array.isArray(body?.sections) ? body.sections : [];
  const sections: ProposedSection[] = [];
  for (const entry of sectionsRaw.slice(0, 12)) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const id = text(row.id, 8) || String.fromCharCode(65 + sections.length);
    const refsIn = Array.isArray(row.refs) ? row.refs.map((r) => text(r, 20)).filter((r) => refs.has(r) && !used.has(r)) : [];
    if (!refsIn.length) continue;
    refsIn.forEach((r) => used.add(r));
    sections.push({
      id,
      title: text(row.title, 200) || `Section ${id}`,
      instructions: text(row.instructions, 1000) || undefined,
      refs: refsIn,
    });
  }
  const unsectioned = questions.filter((q) => !used.has(q.ref)).map((q) => q.ref);
  if (unsectioned.length) {
    const last = sections[sections.length - 1];
    if (last) last.refs.push(...unsectioned);
    else sections.push({ id: "A", title: "All questions", refs: unsectioned });
  }

  // The declared total is carried through for the validator to check against
  // the questions' own marks; the model's stated total is never trusted.
  return {
    plan: {
      title: text(body?.title, 160) || spec.title,
      description: text(body?.description, 1000) || spec.description,
      instructions: text(body?.instructions, 4000) || spec.instructions,
      durationMinutes: spec.durationMinutes,
      gradeLabel: spec.gradeLabel,
      subject: spec.subject,
      curriculum: spec.curriculum,
      passMarkPercent: spec.passMarkPercent,
      sections,
      questions,
      ...(spec.totalMarks ? { declaredTotalMarks: spec.totalMarks } : {}),
    } as ProposedExam,
    dropped,
  };
}

/**
 * Asks the configured model to author the paper, then parses and returns it.
 * Throws `CoreModelError` when no credential exists — the caller decides whether
 * to fall back to the deterministic generator and says which engine was used.
 */
export async function modelExamPlan(
  spec: PlanSpec,
  context: AiOrganizationContext,
  options: {
    env?: NodeJS.ProcessEnv;
    preferred?: { provider?: string | null; model?: string | null } | null;
    transport?: MarkingTransport;
  } = {},
): Promise<ModelPlanResult> {
  const env = options.env ?? process.env;
  if (!resolveCoreProvider(env, options.preferred ?? null)) {
    throw new CoreModelError(
      "unconfigured",
      "No model credential is configured, so the model cannot author this paper.",
    );
  }
  const { system, user } = buildExamPrompt(spec, context);
  const reply = await callModel({ system, user }, { env, preferred: options.preferred, transport: options.transport, maxChars: 200_000 });
  const raw = extractJsonObject(reply.text);
  const { plan, dropped } = parseModelPlan(raw, spec);
  if (plan.questions.length < Math.max(2, Math.ceil(spec.questionCount * 0.6))) {
    throw new CoreModelError(
      "invalid_response",
      `The model returned only ${plan.questions.length} usable question(s) out of ${spec.questionCount} requested` +
        (dropped.length ? ` (${dropped.length} were rejected as malformed)` : "") +
        ", so the paper was not used.",
    );
  }
  return {
    plan,
    provider: reply.provider,
    model: reply.model,
    promptDigestNote: "Model-authored; every key re-verified by the platform scorer before saving.",
  };
}
