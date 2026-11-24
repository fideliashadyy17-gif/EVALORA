/**
 * The formula sheet that belongs to ONE examination.
 *
 * The sheet lives in `exams.settings.formula_sheet`; it is never selected by
 * grade, title or a shared lookup in the candidate page. `exam_id` is stored in
 * the sheet itself and checked against the examination that is being read, so a
 * sheet copied to the wrong examination is ignored rather than shown.
 *
 * Only a title, a short note and a LaTeX formula are allowed. There is no
 * field for an answer, a worked solution or a hint, by design.
 */
export interface FormulaItem {
  latex: string;
  note?: string;
}

export interface FormulaGroup {
  title: string;
  items: FormulaItem[];
}

export interface FormulaSheet {
  version: 1;
  exam_id: string;
  title: string;
  groups: FormulaGroup[];
}

const MAX_GROUPS = 8;
const MAX_ITEMS_PER_GROUP = 12;
const MAX_TITLE = 80;
const MAX_LATEX = 300;
const MAX_NOTE = 240;

function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  // Collapse whitespace so a pasted sheet cannot inject line breaks or tabs
  // into the dialog, and drop control characters outright.
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!text || text.length > max) return null;
  return text;
}

/** Remove one pair of `$…$` delimiters; the renderer adds its own. */
function unwrapMath(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length > 2 && trimmed.startsWith("$") && trimmed.endsWith("$") && !trimmed.slice(1, -1).includes("$")) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * Validate a stored sheet for a specific examination.
 * Returns null when the sheet is missing, malformed, empty or belongs to a
 * different examination — the caller then renders no button at all.
 */
export function parseFormulaSheet(value: unknown, examId: string): FormulaSheet | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== undefined && raw.version !== 1) return null;
  if (typeof raw.exam_id !== "string" || raw.exam_id !== examId) return null;
  // Per-examination switch: a disabled sheet keeps its groups in settings so
  // the teacher can re-enable it, but the candidate never receives it.
  if (raw.enabled === false) return null;
  const title = clean(raw.title, MAX_TITLE) ?? "Formulas for this paper";
  if (!Array.isArray(raw.groups) || raw.groups.length === 0 || raw.groups.length > MAX_GROUPS) return null;

  const groups: FormulaGroup[] = [];
  for (const group of raw.groups) {
    if (!group || typeof group !== "object" || Array.isArray(group)) return null;
    const g = group as Record<string, unknown>;
    const groupTitle = clean(g.title, MAX_TITLE);
    if (!groupTitle || !Array.isArray(g.items) || g.items.length === 0 || g.items.length > MAX_ITEMS_PER_GROUP) return null;
    const items: FormulaItem[] = [];
    for (const item of g.items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const entry = item as Record<string, unknown>;
      const latex = clean(entry.latex, MAX_LATEX);
      if (!latex) return null;
      const note = entry.note === undefined || entry.note === null ? undefined : clean(entry.note, MAX_NOTE);
      if (entry.note !== undefined && entry.note !== null && !note) return null;
      items.push({ latex: unwrapMath(latex), ...(note ? { note } : {}) });
    }
    groups.push({ title: groupTitle, items });
  }
  return { version: 1, exam_id: examId, title, groups };
}
