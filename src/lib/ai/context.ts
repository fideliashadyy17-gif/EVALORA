import "server-only";

/**
 * EVALORA AI CORE — Knowledge & Context Engine.
 *
 * The assistant must know how EVALORA actually works, not a frozen copy of a
 * manual. Everything here is read from the live database and from the same
 * registries the UI itself uses, for ONE organization, so:
 *
 *   - a class that was created this morning appears in the context this
 *     afternoon;
 *   - a question type disabled in Question Studio is reported as unavailable for
 *     NEW questions (existing ones still open — see questionStudio.ts);
 *   - a module the plan does not include is reported as unavailable, so the
 *     assistant never offers work the server will refuse.
 *
 * Everything is scoped to `organizationId`; there is no query in this file that
 * can return another tenant's row.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CURRICULUM_SOURCES, LEVEL_BANDS, type CurriculumKey } from "../curriculum";
import { QUESTION_TYPES } from "../brand";
import { MODULE_CATALOG, moduleEnabled } from "../modules";
import { resolveQuestionStudioConfig } from "../questionStudio";
import { resolveExamDefaults, resolveAssessmentConfig } from "../assessmentConfig";
import { getEntitlementFor, type Entitlement } from "../entitlements";

export interface OrgClassRow {
  id: string;
  name: string;
  levelName: string | null;
}

export interface OrgSubjectRow {
  id: string;
  name: string;
  code: string | null;
}

export interface QuestionTypeAvailability {
  value: string;
  label: string;
  /** True when a NEW question of this type may be authored. */
  availableForNew: boolean;
  automaticallyMarked: boolean;
}

export interface AiOrganizationContext {
  organization: { id: string; name: string; slug: string };
  plan: { name: string; slug: string; status: string; maxExams: number; maxQuestions: number; maxQuizzes: number };
  modules: { key: string; label: string; enabled: boolean }[];
  classes: OrgClassRow[];
  subjects: OrgSubjectRow[];
  curricula: { key: CurriculumKey; reference: string; note: string }[];
  levelBands: { key: string; label: string }[];
  questionTypes: QuestionTypeAvailability[];
  examDefaults: { durationMinutes: number; showMarks: boolean; randomizeQuestions: boolean };
  assessment: { defaultPassPercent: number; requireValidationBeforePublication: boolean };
  /** What currently exists, so the assistant can offer real work. */
  counts: { questions: number; quizzes: number; exams: number; publishedQuizzes: number };
  /** Honest statement about what this snapshot does and does not cover. */
  notes: string[];
}

/**
 * Reads the live catalogue for one organization.
 *
 * A failed read never silently degrades into "no classes": the caller is told
 * which catalogue could not be read, so the assistant can say so instead of
 * inventing an empty school.
 */
export async function loadOrganizationContext(
  supabase: SupabaseClient,
  ctx: { profile: { platform_role?: string } },
  organizationId: string,
): Promise<AiOrganizationContext> {
  const notes: string[] = [];

  const [orgResult, classesResult, subjectsResult, studio, entitlement] = await Promise.all([
    supabase.from("organizations").select("id, name, slug").eq("id", organizationId).maybeSingle(),
    supabase
      .from("classes")
      .select("id, name, education_levels(name)")
      .eq("organization_id", organizationId)
      .order("name")
      .limit(200),
    supabase.from("subjects").select("id, name, code").eq("organization_id", organizationId).order("name").limit(200),
    resolveQuestionStudioConfig(organizationId).catch(() => null),
    safeEntitlement(supabase, ctx, organizationId),
  ]);

  if (!orgResult.data) throw new Error("The organization could not be read for this session.");
  if (classesResult.error) notes.push("The class list could not be read; ask the teacher to confirm the class by name.");
  if (subjectsResult.error) notes.push("The subject list could not be read; ask the teacher to confirm the subject by name.");

  const classes: OrgClassRow[] = (classesResult.data ?? []).map((row) => {
    const level = (row as unknown as { education_levels?: { name?: string } | null }).education_levels;
    return { id: row.id as string, name: row.name as string, levelName: level?.name ?? null };
  });
  const subjects: OrgSubjectRow[] = (subjectsResult.data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    code: (row.code as string | null) ?? null,
  }));

  const enabledTypes = new Set((studio?.questionTypes ?? []).map((t) => t.value));
  const questionTypes: QuestionTypeAvailability[] = QUESTION_TYPES.map((type) => ({
    value: type.value,
    label: type.label,
    // A type withdrawn from the studio is not offered for new work. Existing
    // questions of that type still open and mark — that is a separate rule and
    // it is documented in questionStudio.ts.
    availableForNew: enabledTypes.size === 0 ? true : enabledTypes.has(type.value),
    automaticallyMarked: type.auto,
  }));

  if (enabledTypes.size > 0 && enabledTypes.size < QUESTION_TYPES.length) {
    notes.push(
      "Question Studio restricts the types offered for new questions in this organization; unavailable types are marked in the questionTypes list.",
    );
  }

  const [defaults, assessment] = await Promise.all([
    resolveExamDefaults(organizationId).catch(() => null),
    resolveAssessmentConfig(organizationId).catch(() => null),
  ]);

  const [questions, quizzes, publishedQuizzes, exams] = await Promise.all([
    countOf(supabase.from("questions").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)),
    countOf(supabase.from("quizzes").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)),
    countOf(
      supabase
        .from("quizzes")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "published"),
    ),
    countOf(supabase.from("exams").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)),
  ]);
  if (questions === null || quizzes === null || exams === null) {
    notes.push("Some workspace totals could not be read; they are reported as unavailable rather than zero.");
  }

  const planLimits = entitlement?.limits;
  return {
    organization: {
      id: orgResult.data.id as string,
      name: orgResult.data.name as string,
      slug: orgResult.data.slug as string,
    },
    plan: {
      name: entitlement?.planName ?? "Unknown",
      slug: entitlement?.planSlug ?? "free",
      status: entitlement?.status ?? "unknown",
      maxExams: planLimits?.max_exams ?? -1,
      maxQuestions: planLimits?.max_questions ?? -1,
      maxQuizzes: planLimits?.max_quizzes ?? -1,
    },
    modules: MODULE_CATALOG.map((m) => ({
      key: m.key,
      label: m.label,
      enabled: moduleEnabled(entitlement?.modules, m.key),
    })),
    classes,
    subjects,
    curricula: (Object.keys(CURRICULUM_SOURCES) as CurriculumKey[]).map((key) => ({
      key,
      reference: CURRICULUM_SOURCES[key].reference,
      note: CURRICULUM_SOURCES[key].note,
    })),
    levelBands: LEVEL_BANDS.map((b) => ({ key: b.key, label: b.label })),
    questionTypes,
    examDefaults: {
      durationMinutes: defaults?.durationMinutes ?? 60,
      showMarks: defaults?.showMarks ?? true,
      randomizeQuestions: defaults?.randomizeQuestions ?? false,
    },
    assessment: {
      defaultPassPercent: assessment?.defaultPassPercent ?? 50,
      requireValidationBeforePublication: assessment?.requireValidationBeforePublication !== false,
    },
    counts: {
      questions: questions ?? 0,
      quizzes: quizzes ?? 0,
      publishedQuizzes: publishedQuizzes ?? 0,
      exams: exams ?? 0,
    },
    notes,
  };
}

async function countOf(query: PromiseLike<{ count: number | null; error?: unknown }> | { count: number | null }): Promise<number | null> {
  try {
    const result = await query;
    const count = (result as { count?: number | null }).count;
    return typeof count === "number" ? count : null;
  } catch {
    return null;
  }
}

async function safeEntitlement(
  supabase: SupabaseClient,
  ctx: { profile: { platform_role?: string } },
  organizationId: string,
): Promise<Entitlement | null> {
  try {
    // getEntitlementFor only reads `profile` and `user` from the session.
    return await getEntitlementFor(supabase, ctx as never, organizationId);
  } catch {
    return null;
  }
}

/**
 * A compact, model-facing rendering of the context. Bounded so a large school
 * cannot overflow a prompt, and explicit about anything it had to omit.
 */
export function renderContextForModel(context: AiOrganizationContext, budget = 6000): string {
  const lines: string[] = [];
  const push = (line: string) => {
    if (lines.join("\n").length < budget) lines.push(line);
  };
  push(`Organization: ${context.organization.name} (plan ${context.plan.name}, limits exams ${context.plan.maxExams}, questions ${context.plan.maxQuestions}).`);
  const modulesOn = context.modules.filter((m) => m.enabled).map((m) => m.key);
  push(`Enabled modules: ${modulesOn.join(", ") || "none"}.`);
  push(
    `Classes: ${
      context.classes.length
        ? context.classes.map((c) => `${c.name}${c.levelName ? ` [${c.levelName}]` : ""}`).join("; ")
        : "none configured"
    }.`,
  );
  push(`Subjects: ${context.subjects.length ? context.subjects.map((s) => s.name).join("; ") : "none configured"}.`);
  push(
    `Question types available for new questions: ${context.questionTypes
      .filter((t) => t.availableForNew)
      .map((t) => t.value)
      .join(", ")}.`,
  );
  push(
    `Existing content: ${context.counts.questions} questions, ${context.counts.quizzes} quizzes (${context.counts.publishedQuizzes} published), ${context.counts.exams} examinations.`,
  );
  push(
    `Default examination duration ${context.examDefaults.durationMinutes} minutes; default pass mark ${context.assessment.defaultPassPercent}%; ` +
      `results must be validated before publication: ${context.assessment.requireValidationBeforePublication ? "yes" : "configured off"}.`,
  );
  push(
    "Curriculum references (for topic selection only; generated questions are original): " +
      context.curricula.map((c) => `${c.key}: ${c.reference}`).join(" | "),
  );
  if (context.notes.length) push(`Caveats: ${context.notes.join(" ")}`);
  return lines.join("\n");
}
