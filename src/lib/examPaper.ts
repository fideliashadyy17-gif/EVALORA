/**
 * Official examination paper presentation.
 *
 * One resolver turns an examination + its paper (quiz) + its organization +
 * its chosen template into the header every surface renders identically:
 * the printable paper, the candidate screen and the teacher preview.
 * Nothing here is hardcoded to a single school — every field comes from
 * the examination, the paper settings, the template or the organization.
 */

export interface ExamPaperTemplate {
  id: string;
  organization_id: string;
  name: string;
  period: string | null;
  academic_year: string | null;
  grade_label: string | null;
  subject: string | null;
  instructions: string | null;
  show_logo: boolean;
  is_default: boolean;
}

export interface ExamPaperHeader {
  organizationName: string;
  organizationLogoUrl: string | null;
  showLogo: boolean;
  title: string;
  period: string | null;
  academicYear: string | null;
  gradeLabel: string | null;
  subject: string | null;
  durationMinutes: number | null;
  totalMarks: number | null;
  instructions: string | null;
  candidateName: string | null;
  candidateRef: string | null;
}

export interface ExamPaperSection {
  id: string;
  title: string;
  instructions: string | null;
  questionCount: number;
  marks: number;
}

export const DEFAULT_SECTION_A_TITLE = "SECTION A — MULTIPLE CHOICE QUESTIONS";
export const DEFAULT_SECTION_B_TITLE = "SECTION B — THEORY QUESTIONS";

export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || !Number.isFinite(minutes) || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0 && m > 0) return `${h} hour${h === 1 ? "" : "s"} ${m} minute${m === 1 ? "" : "s"}`;
  if (h > 0) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${m} minute${m === 1 ? "" : "s"}`;
}

function str(value: unknown, max = 300): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Parse a stored template row; returns null when the row is unusable. */
export function parseExamPaperTemplate(row: unknown): ExamPaperTemplate | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.organization_id !== "string" || typeof r.name !== "string") return null;
  return {
    id: r.id,
    organization_id: r.organization_id,
    name: r.name.slice(0, 160),
    period: str(r.period, 120),
    academic_year: str(r.academic_year, 40),
    grade_label: str(r.grade_label, 80),
    subject: str(r.subject, 120),
    instructions: typeof r.instructions === "string" ? r.instructions.slice(0, 4000) : null,
    show_logo: r.show_logo !== false,
    is_default: r.is_default === true,
  };
}

/** Parse the sections array stored in quiz/exam settings. */
export function parsePaperSections(value: unknown): ExamPaperSection[] {
  if (!Array.isArray(value)) return [];
  const out: ExamPaperSection[] = [];
  for (const raw of value.slice(0, 12)) {
    if (!raw || typeof raw !== "object") continue;
    const s = raw as Record<string, unknown>;
    const id = typeof s.id === "string" ? s.id : "";
    const title = typeof s.title === "string" ? s.title.trim() : "";
    if (!id || !title) continue;
    out.push({
      id,
      title: title.slice(0, 200),
      instructions: typeof s.instructions === "string" ? s.instructions.slice(0, 1000) : null,
      questionCount: Math.max(0, Math.floor(Number(s.questions) || 0)),
      marks: Math.max(0, Number(s.marks) || 0),
    });
  }
  return out;
}

/**
 * Resolve the official header. Precedence per field:
 *   exam settings override → template → paper (quiz) settings → organization.
 * The organization identity (name/logo) always comes from the organization
 * row, never from a template, so one school's branding can never leak into
 * another school's paper.
 */
export function resolveExamPaperHeader(input: {
  organizationName: string;
  organizationLogoUrl?: string | null;
  examTitle: string;
  examInstructions?: string | null;
  examDurationMinutes?: number | null;
  examSettings?: Record<string, unknown> | null;
  quizSettings?: Record<string, unknown> | null;
  template?: ExamPaperTemplate | null;
  totalMarks?: number | null;
  candidateName?: string | null;
  candidateRef?: string | null;
}): ExamPaperHeader {
  const exam = input.examSettings ?? {};
  const quiz = input.quizSettings ?? {};
  const tpl = input.template ?? null;
  const pick = (examKey: string, quizKey: string, tplValue: string | null | undefined): string | null =>
    str(exam[examKey]) ?? str(quiz[quizKey]) ?? (tplValue ?? null);
  return {
    organizationName: input.organizationName,
    organizationLogoUrl: input.organizationLogoUrl ?? null,
    showLogo: tpl ? tpl.show_logo : true,
    title: input.examTitle,
    period: pick("exam_period", "exam_period", tpl?.period),
    academicYear: pick("academic_year", "academic_year", tpl?.academic_year),
    gradeLabel: pick("grade_label", "grade_label", tpl?.grade_label),
    subject: pick("subject", "subject", tpl?.subject),
    durationMinutes: num(exam.duration_minutes) ?? num(quiz.duration_minutes) ?? input.examDurationMinutes ?? null,
    totalMarks: num(exam.total_marks) ?? num(quiz.total_marks) ?? input.totalMarks ?? null,
    instructions:
      str(exam.instructions, 4000) ?? str(quiz.instructions, 4000) ?? tpl?.instructions ?? input.examInstructions ?? null,
    candidateName: input.candidateName ?? null,
    candidateRef: input.candidateRef ?? null,
  };
}

/**
 * Group ordered paper rows into sections by `config.paper_section`.
 * Section order is first-appearance order, so SECTION A always precedes
 * SECTION B when the paper is authored that way. Questions without a
 * section keep their position in a single unsectioned group.
 */
export function groupRowsBySection<T extends { questions?: { config?: unknown } | null; points?: number | null }>(
  rows: T[],
  sections: ExamPaperSection[],
): { section: ExamPaperSection | null; rows: T[] }[] {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const groups = new Map<string, { section: ExamPaperSection | null; rows: T[] }>();
  const order: string[] = [];
  for (const row of rows) {
    const cfg = (row.questions?.config ?? {}) as Record<string, unknown>;
    const key = typeof cfg.paper_section === "string" ? cfg.paper_section : "__none__";
    if (!groups.has(key)) {
      groups.set(key, { section: byId.get(key) ?? null, rows: [] });
      order.push(key);
    }
    groups.get(key)!.rows.push(row);
  }
  return order.map((k) => groups.get(k)!);
}

/** Cache-busted logo URL so a replaced logo refreshes everywhere at once. */
export function logoUrlWithVersion(url: string | null | undefined, version?: string | number | null): string | null {
  if (!url) return null;
  if (!version) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${encodeURIComponent(String(version))}`;
}
