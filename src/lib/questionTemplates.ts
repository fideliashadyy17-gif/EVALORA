import "server-only";

/**
 * Question Studio templates.
 *
 * A template is a saved authoring starting point: a question type, a prompt and
 * explanation skeleton, the response/marking configuration and the appearance
 * tokens. Applying one COPIES that payload into the editor, so:
 *
 *   • editing a template afterwards never changes a question already created
 *     from it, and therefore never changes an examination that is scheduled,
 *     open or published;
 *   • `usage_count` records how many questions started from it, which is what an
 *     administrator needs before archiving one.
 *
 * ISOLATION RULE
 * --------------
 * `organization_id IS NULL` means a platform-wide template every tenant may use.
 * A template created FROM an existing question always inherits that question's
 * organization and can never be promoted to platform-wide: that would copy one
 * school's authored content into a payload readable by every other tenant.
 * Platform-wide templates are authored from scratch by Super Admin.
 */
import { QUESTION_TYPES } from "@/lib/brand";
import { normalizeQuestionDesign } from "@/lib/questionDesign";
import { createAdminClient } from "@/lib/supabase/server";

export const TEMPLATE_STATUSES = ["active", "archived"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

/** Hard limits, enforced again by the database constraints. */
export const TEMPLATE_LIMITS = {
  name: 160,
  description: 600,
  subject: 80,
  gradeLabel: 40,
  curriculum: 80,
  topic: 120,
  difficulty: 40,
  tags: 12,
  tagLength: 32,
  /** Serialized `content` payload ceiling, in characters. */
  content: 400_000,
} as const;

export interface QuestionTemplateRow {
  id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  question_type: string;
  subject: string | null;
  grade_label: string | null;
  curriculum: string | null;
  topic: string | null;
  difficulty: string | null;
  content: Record<string, unknown>;
  design: Record<string, unknown>;
  tags: string[];
  status: TemplateStatus;
  usage_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function cleanText(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** A question type the examination engine can actually render. */
export function knownQuestionType(value: unknown): string | null {
  const v = cleanText(value, 40);
  return QUESTION_TYPES.some((t) => t.value === v) ? v : null;
}

/** Trim, de-duplicate and bound a tag list. */
export function normalizeTags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n]/)
      : [];
  const out: string[] = [];
  for (const entry of raw) {
    const tag = cleanText(entry, TEMPLATE_LIMITS.tagLength);
    if (!tag) continue;
    if (!out.some((existing) => existing.toLowerCase() === tag.toLowerCase())) out.push(tag);
    if (out.length >= TEMPLATE_LIMITS.tags) break;
  }
  return out;
}

/** A UUID, or null. Rejecting anything else keeps every scope filter explicit. */
export function uuidOrNull(value: unknown): string | null {
  const v = String(value ?? "").trim();
  return /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}

export function normalizeTemplateStatus(value: unknown): TemplateStatus {
  return cleanText(value, 12) === "archived" ? "archived" : "active";
}

/**
 * The authoring payload a template pre-fills. Only keys the question editor
 * understands survive, so a hand-edited row cannot smuggle fields into a
 * question, and an `id` can never turn "create" into "overwrite".
 */
const ALLOWED_CONTENT_KEYS = [
  "type",
  "prompt",
  "prompt_doc",
  "explanation",
  "explanation_doc",
  "points",
  "difficulty",
  "topic",
  "status",
  "curriculum",
  "curriculum_course",
  "subtopic",
  "source_reference",
  "source_url",
  "config",
  "options",
] as const;

export function templateContentForEditor(row: {
  content?: unknown;
  design?: unknown;
  question_type?: unknown;
  difficulty?: unknown;
  topic?: unknown;
}): Record<string, unknown> {
  const content = row.content && typeof row.content === "object" && !Array.isArray(row.content)
    ? (row.content as Record<string, unknown>)
    : {};
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_CONTENT_KEYS) {
    if (content[key] !== undefined) out[key] = content[key];
  }
  // Never carry an identity: a template creates a NEW question.
  delete out.id;
  delete out.organization_id;

  const type = knownQuestionType(out.type ?? row.question_type);
  if (type) out.type = type;
  if (typeof out.difficulty !== "string" && typeof row.difficulty === "string") out.difficulty = row.difficulty;
  if (typeof out.topic !== "string" && typeof row.topic === "string") out.topic = row.topic;
  // A new question always starts as a draft, whatever the template was made from.
  out.status = "draft";

  const config = out.config && typeof out.config === "object" && !Array.isArray(out.config)
    ? { ...(out.config as Record<string, unknown>) }
    : {};
  // The template's design tokens become this question's own snapshot, so a later
  // template edit cannot restyle the question that was already created.
  config.design = normalizeQuestionDesign({ ...(config.design ?? {}), ...(row.design ?? {}) });
  out.config = config;

  if (!Array.isArray(out.options)) delete out.options;
  return out;
}

/** Strip a question row down to the payload a template may store. */
export function questionToTemplateContent(
  question: Record<string, unknown>,
): { content: Record<string, unknown>; design: Record<string, unknown> } {
  const content: Record<string, unknown> = {};
  for (const key of ALLOWED_CONTENT_KEYS) {
    if (question[key] !== undefined && question[key] !== null) content[key] = question[key];
  }
  delete content.id;
  delete content.organization_id;
  content.status = "draft";
  const config = content.config && typeof content.config === "object" && !Array.isArray(content.config)
    ? { ...(content.config as Record<string, unknown>) }
    : {};
  // A template stores its design tokens in the dedicated column, not twice.
  const design = normalizeQuestionDesign(config.design ?? {}) as unknown as Record<string, unknown>;
  delete config.design;
  content.config = config;
  return { content, design };
}

/** True when the serialized payload is within the stored limits. */
export function templatePayloadWithinLimits(content: unknown, design: unknown): boolean {
  try {
    return JSON.stringify({ content, design }).length <= TEMPLATE_LIMITS.content;
  } catch {
    return false;
  }
}


/* ─────────────────────────── server-side reads ───────────────────────────
 *
 * Reads only. Every caller has already passed `requireSuperAdmin()` (or an
 * organization-scoped permission check); these helpers add no authority of their
 * own and never widen a filter supplied by the caller.
 */

export interface TemplateListFilter {
  /**
   * Scope filter. `undefined` = every scope (Super Admin overview); `null` =
   * platform-wide rows only; a UUID = that organization's rows exactly.
   */
  organizationId?: string | null;
  /**
   * With a UUID scope, also include the platform-wide templates that
   * organization may use. This is what makes a tenant's view match the Postgres
   * policy `question_templates_select`; it is never combined with a UUID filter
   * in the Super Admin console, where the scope filter means exactly that scope.
   */
  includePlatformWide?: boolean;
  status?: TemplateStatus | "any";
  questionType?: string | null;
  search?: string | null;
  limit?: number;
}

const TEMPLATE_COLUMNS =
  "id, organization_id, name, description, question_type, subject, grade_label, curriculum, topic, difficulty, content, design, tags, status, usage_count, created_at, updated_at";

/**
 * List templates the administrator is allowed to see.
 *
 * Fails soft: an unreachable store returns an empty list rather than breaking the
 * authoring surface — the page then shows its empty state, which is honest
 * because nothing can be applied.
 */
export async function listQuestionTemplates(filter: TemplateListFilter = {}): Promise<QuestionTemplateRow[]> {
  const admin = createAdminClient();
  let query = admin.from("question_templates").select(TEMPLATE_COLUMNS, { count: "exact" });

  if (typeof filter.organizationId === "string" && !uuidOrNull(filter.organizationId)) {
    // A malformed scope must not silently widen to every template.
    return [];
  }
  const scopeId =
    typeof filter.organizationId === "string"
      ? uuidOrNull(filter.organizationId)
      : filter.organizationId === null
        ? null
        : undefined;
  if (scopeId === null) {
    query = query.is("organization_id", null);
  } else if (typeof scopeId === "string") {
    query = filter.includePlatformWide
      ? // A tenant sees its own templates and the platform-wide ones it may use,
        // never another school's. Mirrors policy `question_templates_select`.
        query.or(`organization_id.eq.${scopeId},organization_id.is.null`)
      : query.eq("organization_id", scopeId);
  }
  // `undefined` = no scope filter: the Super Admin overview of every template.

  const status = filter.status && filter.status !== "any" ? normalizeTemplateStatus(filter.status) : null;
  if (status) query = query.eq("status", status);

  const type = knownQuestionType(filter.questionType);
  if (type) query = query.eq("question_type", type);

  const search = cleanText(filter.search ?? "", 80);
  if (search) {
    const escaped = search.replace(/[%_,]/g, " ").trim();
    if (escaped) query = query.ilike("name", `%${escaped}%`);
  }

  const limit = Math.min(Math.max(Math.trunc(filter.limit ?? 100), 1), 200);
  const { data, error } = await query.order("name").limit(limit);
  if (error || !data) return [];
  return (data as unknown as QuestionTemplateRow[]).map((row) => ({
    ...row,
    tags: normalizeTags(row.tags),
    content: row.content && typeof row.content === "object" ? (row.content as Record<string, unknown>) : {},
    design: row.design && typeof row.design === "object" ? (row.design as Record<string, unknown>) : {},
    usage_count: Number.isFinite(row.usage_count) ? row.usage_count : 0,
  }));
}

/** One template by id, or null. `organizationId` narrows the read when given. */
export async function getQuestionTemplate(
  templateId: string,
  organizationId?: string | null,
): Promise<QuestionTemplateRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(String(templateId ?? "").trim())) return null;
  const admin = createAdminClient();
  let query = admin.from("question_templates").select(TEMPLATE_COLUMNS).eq("id", String(templateId).trim());
  if (typeof organizationId === "string") {
    query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
  } else if (organizationId === null) {
    query = query.is("organization_id", null);
  }
  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as QuestionTemplateRow;
  return {
    ...row,
    tags: normalizeTags(row.tags),
    content: row.content && typeof row.content === "object" ? (row.content as Record<string, unknown>) : {},
    design: row.design && typeof row.design === "object" ? (row.design as Record<string, unknown>) : {},
  };
}

/**
 * Count one real use: a question was created from this template.
 *
 * Atomic in Postgres (`question_templates_record_use`) so two authors starting
 * from the same template at the same time cannot lose a count. The return value
 * is deliberately ignored by callers — a template counter must never be able to
 * fail a question save.
 */
export async function recordTemplateUse(templateId: string): Promise<number> {
  if (!/^[0-9a-f-]{36}$/i.test(String(templateId ?? "").trim())) return 0;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("question_templates_record_use", { p_template_id: String(templateId).trim() });
  if (error) return 0;
  const count = Number(data);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

/** Human scope label for the templates table. */
export function describeTemplateScope(row: { organization_id: string | null }): "platform" | "organization" {
  return row.organization_id ? "organization" : "platform";
}

/**
 * The templates an organization's authors may start from: its own plus the
 * platform-wide library, active only. Archived templates are never offered,
 * while questions already created from them are untouched.
 */
export async function listTemplatesForOrganization(organizationId: string): Promise<QuestionTemplateRow[]> {
  const orgId = uuidOrNull(organizationId);
  if (!orgId) return [];
  return listQuestionTemplates({ organizationId: orgId, includePlatformWide: true, status: "active", limit: 200 });
}
