/**
 * The reusable formula library and the per-examination formula sheet.
 *
 * Two layers, one direction of flow:
 *   1. `formula_library` rows — the teacher's organized library, grouped by
 *      subject, topic and chapter (database table, org-scoped, RLS).
 *   2. `exams.settings.formula_sheet` — the exact snapshot attached to ONE
 *      examination (see examFormulas.ts for the candidate-facing parse).
 *
 * A sheet stores `source` ids of the library rows it was built from so a
 * later library edit never silently changes a published paper: the snapshot
 * is authoritative for candidates, the library for future papers.
 *
 * Every field is validated here before it reaches the database; there is no
 * answer, hint or worked-solution field — by design (exam integrity).
 */

export interface FormulaLibraryEntry {
  id: string;
  organization_id: string;
  subject_id: string | null;
  topic: string;
  chapter: string | null;
  title: string;
  latex: string;
  note: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export const FORMULA_LIMITS = {
  maxTopics: 60,
  maxEntries: 500,
  topic: 120,
  chapter: 120,
  title: 160,
  latex: 300,
  note: 240,
  maxSheetGroups: 8,
  maxSheetItems: 12,
} as const;

function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!text || text.length > max) return null;
  return text;
}

/** Strip one pair of surrounding `$…$` delimiters; the renderer adds its own. */
export function unwrapMathDelimiters(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length > 2 &&
    trimmed.startsWith("$") &&
    trimmed.endsWith("$") &&
    !trimmed.slice(1, -1).includes("$")
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/** Validate one library row before insert/update. Returns the clean row or a reason. */
export function validateFormulaInput(raw: Record<string, unknown>):
  | { ok: true; value: Pick<FormulaLibraryEntry, "topic" | "chapter" | "title" | "latex" | "note"> & { subject_id: string | null } }
  | { ok: false; error: string } {
  const topic = clean(raw.topic, FORMULA_LIMITS.topic);
  if (!topic) return { ok: false, error: "topic" };
  const chapterRaw = raw.chapter;
  const chapter =
    chapterRaw === undefined || chapterRaw === null || String(chapterRaw).trim() === ""
      ? null
      : clean(chapterRaw, FORMULA_LIMITS.chapter);
  if (chapterRaw !== undefined && chapterRaw !== null && String(chapterRaw).trim() !== "" && !chapter) {
    return { ok: false, error: "chapter" };
  }
  const title = clean(raw.title, FORMULA_LIMITS.title);
  if (!title) return { ok: false, error: "title" };
  const latexRaw = clean(raw.latex, FORMULA_LIMITS.latex);
  if (!latexRaw) return { ok: false, error: "latex" };
  const latex = unwrapMathDelimiters(latexRaw);
  if (!latex) return { ok: false, error: "latex" };
  const noteRaw = raw.note;
  const note =
    noteRaw === undefined || noteRaw === null || String(noteRaw).trim() === ""
      ? null
      : clean(noteRaw, FORMULA_LIMITS.note);
  if (noteRaw !== undefined && noteRaw !== null && String(noteRaw).trim() !== "" && !note) {
    return { ok: false, error: "note" };
  }
  const subjectRaw = raw.subject_id;
  const subjectId =
    typeof subjectRaw === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subjectRaw)
      ? subjectRaw
      : null;
  if (subjectRaw !== undefined && subjectRaw !== null && subjectRaw !== "" && !subjectId) {
    return { ok: false, error: "subject" };
  }
  return { ok: true, value: { topic, chapter, title, latex, note, subject_id: subjectId } };
}

export interface FormulaGroupDraft {
  title: string;
  items: { latex: string; note?: string; source?: string }[];
}

/**
 * Validate a per-exam sheet draft built from library selections (or typed
 * directly). Returns the cleaned groups or the first offending path.
 */
export function validateSheetDraft(raw: unknown):
  | { ok: true; groups: FormulaGroupDraft[] }
  | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "empty" };
  if (raw.length > FORMULA_LIMITS.maxSheetGroups) return { ok: false, error: "too_many_groups" };
  const groups: FormulaGroupDraft[] = [];
  for (const g of raw) {
    if (!g || typeof g !== "object" || Array.isArray(g)) return { ok: false, error: "group" };
    const obj = g as Record<string, unknown>;
    const title = clean(obj.title, FORMULA_LIMITS.topic);
    if (!title) return { ok: false, error: "group_title" };
    if (!Array.isArray(obj.items) || obj.items.length === 0) return { ok: false, error: "group_items" };
    if (obj.items.length > FORMULA_LIMITS.maxSheetItems) return { ok: false, error: "group_items" };
    const items: FormulaGroupDraft["items"] = [];
    for (const it of obj.items) {
      if (!it || typeof it !== "object" || Array.isArray(it)) return { ok: false, error: "item" };
      const io = it as Record<string, unknown>;
      const latexRaw = clean(io.latex, FORMULA_LIMITS.latex);
      if (!latexRaw) return { ok: false, error: "item_latex" };
      const note =
        io.note === undefined || io.note === null || String(io.note).trim() === ""
          ? undefined
          : clean(io.note, FORMULA_LIMITS.note);
      if (io.note !== undefined && io.note !== null && String(io.note).trim() !== "" && !note) {
        return { ok: false, error: "item_note" };
      }
      const source = typeof io.source === "string" && io.source.length <= 64 ? io.source : undefined;
      items.push({ latex: unwrapMathDelimiters(latexRaw), ...(note ? { note } : {}), ...(source ? { source } : {}) });
    }
    groups.push({ title, items });
  }
  return { ok: true, groups };
}

/** Topic → chapter → entries, ready for the library browser. */
export function groupLibraryEntries(entries: FormulaLibraryEntry[]): {
  topic: string;
  chapters: { chapter: string | null; entries: FormulaLibraryEntry[] }[];
}[] {
  const byTopic = new Map<string, Map<string | null, FormulaLibraryEntry[]>>();
  for (const entry of entries) {
    const chapters = byTopic.get(entry.topic) ?? new Map<string | null, FormulaLibraryEntry[]>();
    const list = chapters.get(entry.chapter) ?? [];
    list.push(entry);
    chapters.set(entry.chapter, list);
    byTopic.set(entry.topic, chapters);
  }
  return [...byTopic.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([topic, chapters]) => ({
      topic,
      chapters: [...chapters.entries()]
        .sort(([a], [b]) => (a ?? "").localeCompare(b ?? "") || (a === null ? -1 : 1))
        .map(([chapter, list]) => ({
          chapter,
          entries: list.sort((x, y) => x.title.localeCompare(y.title)),
        })),
    }));
}
