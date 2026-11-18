/** Server-side objective scoring for examinations and live quizzes. */
export type AnswerPayload = Record<string, unknown>;

export interface ScorableOption {
  id: string;
  label: string;
  is_correct: boolean;
}

export interface ScorableQuestion {
  type: string;
  points: number;
  config: Record<string, unknown> | null;
}

export interface ScoreResult {
  isCorrect: boolean | null; // null → manual / not scorable
  points: number;
}

/** Invalid keys or stale/invalid answers must never silently become marks. */
export class ScoringError extends Error {
  constructor() { super("The answer or marking key cannot be verified."); this.name = "ScoringError"; }
}

import { assessPartsFromConfig, canonicalExpression, parseStudentNumber, scoreAssessParts, textAnswersMatch } from "./assessParts";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const validNumber = (v: unknown): number | null => {
  if (typeof v !== "number" && (typeof v !== "string" || !v.trim())) return null;
  const number = Number(v);
  return Number.isFinite(number) ? number : null;
};
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((item) => typeof item === "string");
const isPair = (v: unknown): v is {left: string; right: string} =>
  !!v && typeof v === "object" && typeof (v as Record<string, unknown>).left === "string" && typeof (v as Record<string, unknown>).right === "string";

export function scoreAnswer(
  question: ScorableQuestion,
  options: ScorableOption[],
  answer: AnswerPayload,
  pointsOverride?: number | null,
): ScoreResult {
  const max = validNumber(pointsOverride ?? question.points);
  if (max === null || max < 0) throw new ScoringError();
  const cfg = question.config ?? {};
  switch (question.type) {
    case "single_choice":
    case "true_false": {
      if (options.filter((o) => o.is_correct).length !== 1 || typeof answer.option_id !== "string") throw new ScoringError();
      const chosen = options.find((o) => o.id === answer.option_id);
      // This includes a saved option whose ID disappeared after a paper edit.
      if (!chosen) throw new ScoringError();
      return { isCorrect: chosen.is_correct, points: chosen.is_correct ? max : 0 };
    }
    case "multiple_select": {
      if (!isStringArray(answer.option_ids)) throw new ScoringError();
      const picked = new Set(answer.option_ids);
      const all = new Set(options.map((o) => o.id));
      const correct = new Set(options.filter((o) => o.is_correct).map((o) => o.id));
      if (!correct.size || [...picked].some((id) => !all.has(id))) throw new ScoringError();
      let hits = 0, wrong = 0;
      picked.forEach((id) => (correct.has(id) ? hits++ : wrong++));
      const ratio = Math.max(0, (hits - wrong) / correct.size);
      return { isCorrect: ratio === 1, points: Math.round(ratio * max * 100) / 100 };
    }
    case "short_answer": {
      const accepted = options.filter((o) => o.is_correct && typeof o.label === "string" && norm(o.label)).map((o) => norm(o.label));
      if (!accepted.length || typeof answer.text !== "string") throw new ScoringError();
      // Expression questions accept equivalent algebraic forms (4n-1, 4n - 1,
      // a_n = 4n - 1). Every written answer also tolerates numeric equivalence
      // (1/2 = 0.5 = 50%), a leading label, a listed equivalent, and one typo
      // in a single-word answer ("solvant" for "solvent").
      const expression = cfg.normalize_expression === true;
      const ok = accepted.some((a) => expression
        ? canonicalExpression(a) === canonicalExpression(answer.text as string)
        : textAnswersMatch(answer.text as string, a, { expression }));
      return { isCorrect: ok, points: ok ? max : 0 };
    }
    case "assess_parts": {
      const parts = assessPartsFromConfig(cfg);
      if (!parts.length) throw new ScoringError();
      // Typed parts and structured constructions (a plotted graph, a drawn
      // histogram, a stem-and-leaf diagram) are marked together. Each keeps its
      // own partial credit; the paper's maximum still governs the total.
      const typed = scoreAssessParts(parts, answer, null);
      const structured = scoreStructuredMarks(cfg.structured_marks, answer);
      const typedMax = typed.perPart.reduce((sum, part) => sum + part.max, 0);
      const structuredMax = structured.reduce((sum, rule) => sum + rule.points, 0);
      const totalMax = typedMax + structuredMax;
      if (totalMax <= 0) throw new ScoringError();
      const earned = typed.points + structured.reduce((sum, rule) => sum + rule.earned, 0);
      const scale = max / totalMax;
      return {
        isCorrect: earned >= totalMax - 1e-9,
        points: Math.round(earned * scale * 100) / 100,
      };
    }
    case "numeric": {
      // Numeric entry accepts currency/unit text, comma decimals, fractions,
      // percentages and a final line of worked arithmetic ("18+6=24").
      const expected = parseStudentNumber(cfg.numeric_answer);
      const tolerance = cfg.tolerance == null || cfg.tolerance === "" ? 0 : validNumber(cfg.tolerance);
      const got = parseStudentNumber(answer.value);
      if (expected === null || tolerance === null || tolerance < 0 || got === null) throw new ScoringError();
      const ok = Math.abs(got - expected) <= tolerance;
      return { isCorrect: ok, points: ok ? max : 0 };
    }
    case "ordering": {
      if (!options.length || options.some((o) => typeof o.label !== "string" || !norm(o.label)) || !isStringArray(answer.order)) throw new ScoringError();
      const authored = options.map((o) => norm(o.label));
      const given = answer.order.map(norm);
      const ok = authored.length === given.length && authored.every((v, i) => v === given[i]);
      return { isCorrect: ok, points: ok ? max : 0 };
    }
    case "matching": {
      if (!Array.isArray(cfg.pairs) || !cfg.pairs.length || !cfg.pairs.every(isPair) ||
          cfg.pairs.some((p) => !norm(p.left) || !norm(p.right)) ||
          new Set(cfg.pairs.map((p) => norm(p.left))).size !== cfg.pairs.length ||
          !Array.isArray(answer.pairs) || !answer.pairs.every(isPair)) throw new ScoringError();
      const given = answer.pairs;
      if (new Set(given.map((p) => norm(p.left))).size !== given.length) throw new ScoringError();
      const map = new Map(given.map((p) => [norm(p.left), norm(p.right)]));
      let hits = 0;
      cfg.pairs.forEach((p) => { if (map.get(norm(p.left)) === norm(p.right)) hits++; });
      const ratio = hits / cfg.pairs.length;
      return { isCorrect: ratio === 1, points: Math.round(ratio * max * 100) / 100 };
    }
    case "open_ended": {
      // A constructed-response question with an explicit structured marking
      // rule is automatically gradeable; without one it remains for a human.
      const structured = scoreStructuredMarks(cfg.structured_marks, answer);
      if (!structured.length) return { isCorrect: null, points: 0 };
      const total = structured.reduce((sum, rule) => sum + rule.points, 0);
      const earned = structured.reduce((sum, rule) => sum + rule.earned, 0);
      if (total <= 0) throw new ScoringError();
      const scale = max / total;
      return {
        isCorrect: earned >= total - 1e-9,
        points: Math.round(earned * scale * 100) / 100,
      };
    }
    case "poll":
    case "slide":
      return { isCorrect: null, points: 0 };
    default:
      // Unknown types are not safe to mark as a zero or manual by default.
      throw new ScoringError();
  }
}


/** Per-part and per-construction evidence for the marking script. */
export interface AnswerScoreDetail extends ScoreResult {
  perPart: { id: string; earned: number; max: number; correct: boolean }[];
  structured: StructuredMarkResult[];
}

/**
 * Score one answer and return the marking evidence as well as the totals.
 * This is the only place a script review gets part-level marks, so the review
 * and the stored total can never disagree about the same attempt.
 */
export function scoreAnswerDetailed(
  question: ScorableQuestion,
  options: ScorableOption[],
  answer: AnswerPayload,
  pointsOverride?: number | null,
): AnswerScoreDetail {
  const result = scoreAnswer(question, options, answer, pointsOverride);
  const cfg = question.config ?? {};
  const perPart = question.type === "assess_parts"
    ? scoreAssessParts(assessPartsFromConfig(cfg), answer, null).perPart
    : [];
  const structured = ["assess_parts", "open_ended"].includes(question.type)
    ? scoreStructuredMarks(cfg.structured_marks, answer)
    : [];
  return { ...result, perPart, structured };
}

export type StructuredTool = "graph" | "statistics" | "stem_leaf" | "data_table" | "text";

export interface StructuredMarkRule {
  id: string;
  label: string;
  tool: StructuredTool;
  points: number;
  /** For assess_parts questions: the part whose working holds the construction. */
  part?: string;
  /** graph_points | graph_segments | statistics | stem_leaf | data_table */
  mode: string;
  expected: Record<string, unknown>;
  tolerance?: number;
}

export interface StructuredMarkResult {
  id: string;
  label: string;
  tool: StructuredTool;
  mode: string;
  points: number;
  earned: number;
  status: "awarded" | "partial" | "not_awarded" | "missing";
  detail: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const finite = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = parseStudentNumber(value);
  return parsed !== null && Number.isFinite(parsed) ? parsed : null;
};

const round = (value: number) => Math.round(value * 100) / 100;
const text = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : "");

export function normaliseStructuredRules(raw: unknown): StructuredMarkRule[] {
  if (!Array.isArray(raw)) return [];
  const out: StructuredMarkRule[] = [];
  for (const entry of raw.slice(0, 24)) {
    if (!isRecord(entry)) continue;
    const id = typeof entry.id === "string" ? entry.id.trim().slice(0, 60) : "";
    const tool = entry.tool;
    const points = finite(entry.points);
    if (!id || !["graph", "statistics", "stem_leaf", "data_table", "text"].includes(String(tool))) continue;
    if (points === null || points <= 0) continue;
    if (!isRecord(entry.expected)) continue;
    out.push({
      id,
      label: typeof entry.label === "string" && entry.label.trim() ? entry.label.trim().slice(0, 120) : id,
      tool: tool as StructuredTool,
      points,
      mode: typeof entry.mode === "string" ? entry.mode : defaultMode(tool as StructuredTool),
      expected: entry.expected,
      tolerance: finite(entry.tolerance) ?? 0.01,
      ...(typeof entry.part === "string" && entry.part.trim() ? { part: entry.part.trim() } : {}),
    });
  }
  return out;
}

function defaultMode(tool: StructuredTool): string {
  if (tool === "graph") return "graph_points";
  if (tool === "statistics") return "statistics";
  if (tool === "stem_leaf") return "stem_leaf";
  if (tool === "text") return "keyword_match";
  return "data_table";
}

/** The construction payload a rule inspects: a part's working, or the answer itself. */
function payloadFor(answer: Record<string, unknown>, rule: StructuredMarkRule): Record<string, unknown> | null {
  if (!rule.part) return answer;
  const working = isRecord(answer.working) ? answer.working[rule.part] : null;
  return isRecord(working) ? working : null;
}

function graphPoints(spec: unknown): { x: number; y: number }[] {
  if (!isRecord(spec) || !Array.isArray(spec.points)) return [];
  return spec.points
    .filter(isRecord)
    .filter((point) => point.visible !== false)
    .map((point) => ({ x: finite(point.x) ?? NaN, y: finite(point.y) ?? NaN }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function graphSegments(spec: unknown): { x1: number; y1: number; x2: number; y2: number }[] {
  if (!isRecord(spec) || !Array.isArray(spec.segments)) return [];
  return spec.segments
    .filter(isRecord)
    .filter((segment) => segment.visible !== false)
    .map((segment) => ({
      x1: finite(segment.x1) ?? NaN,
      y1: finite(segment.y1) ?? NaN,
      x2: finite(segment.x2) ?? NaN,
      y2: finite(segment.y2) ?? NaN,
    }))
    .filter((segment) => Object.values(segment).every(Number.isFinite));
}

function scoreGraphPoints(expected: Record<string, unknown>, spec: unknown, tolerance: number) {
  const wanted = Array.isArray(expected.points) ? expected.points.filter(isRecord) : [];
  const given = graphPoints(spec);
  const used = new Set<number>();
  let matched = 0;
  for (const wantedPoint of wanted) {
    const x = finite(wantedPoint.x);
    const y = finite(wantedPoint.y);
    if (x === null || y === null) continue;
    const index = given.findIndex((point, i) =>
      !used.has(i) && Math.abs(point.x - x) <= tolerance && Math.abs(point.y - y) <= tolerance);
    if (index >= 0) {
      used.add(index);
      matched++;
    }
  }
  return {
    checks: wanted.length,
    matched,
    detail: wanted.length
      ? `${matched} of ${wanted.length} required point${wanted.length === 1 ? "" : "s"} plotted within ±${tolerance}.`
      : "No expected points were configured.",
  };
}

function scoreGraphSegments(expected: Record<string, unknown>, spec: unknown, tolerance: number) {
  const wanted = Array.isArray(expected.segments) ? expected.segments.filter(isRecord) : [];
  const given = graphSegments(spec);
  const used = new Set<number>();
  let matched = 0;
  for (const segment of wanted) {
    const values = ["x1", "y1", "x2", "y2"].map((key) => finite(segment[key]));
    if (values.some((value) => value === null)) continue;
    const [x1, y1, x2, y2] = values.map(Number);
    const index = given.findIndex((candidate, i) => {
      if (used.has(i)) return false;
      const forward = Math.abs(candidate.x1 - x1) <= tolerance &&
        Math.abs(candidate.y1 - y1) <= tolerance &&
        Math.abs(candidate.x2 - x2) <= tolerance &&
        Math.abs(candidate.y2 - y2) <= tolerance;
      const reverse = Math.abs(candidate.x1 - x2) <= tolerance &&
        Math.abs(candidate.y1 - y2) <= tolerance &&
        Math.abs(candidate.x2 - x1) <= tolerance &&
        Math.abs(candidate.y2 - y1) <= tolerance;
      return forward || reverse;
    });
    if (index >= 0) {
      used.add(index);
      matched++;
    }
  }
  return {
    checks: wanted.length,
    matched,
    detail: wanted.length
      ? `${matched} of ${wanted.length} required line segment${wanted.length === 1 ? "" : "s"} drawn within ±${tolerance}.`
      : "No expected segments were configured.",
  };
}

function scoreStatistics(expected: Record<string, unknown>, payload: Record<string, unknown>) {
  const spec = payload.statistics;
  if (!isRecord(spec)) {
    return { checks: 1, matched: 0, detail: "No statistics chart was submitted." };
  }
  let checks = 0;
  let matched = 0;
  const notes: string[] = [];
  const wantedChart = text(expected.chart);
  if (wantedChart) {
    checks++;
    const actualChart = text(spec.chart);
    if (actualChart === wantedChart) matched++;
    notes.push(actualChart === wantedChart ? `Chart type ${actualChart} is correct.` : `Chart type should be ${wantedChart}, not ${actualChart || "empty"}.`);
  }
  const wantedGroups = Array.isArray(expected.groups) ? expected.groups.filter(isRecord) : [];
  const groups = Array.isArray(spec.groups) ? spec.groups.filter(isRecord) : [];
  const used = new Set<number>();
  for (const wanted of wantedGroups) {
    const from = finite(wanted.from);
    const to = finite(wanted.to);
    const frequency = finite(wanted.frequency);
    if (from === null || to === null || frequency === null) continue;
    checks++;
    const index = groups.findIndex((group, i) =>
      !used.has(i) && finite(group.from) === from && finite(group.to) === to && Math.abs((finite(group.frequency) ?? NaN) - frequency) < 1e-9);
    if (index >= 0) {
      used.add(index);
      matched++;
    } else {
      notes.push(`Class ${from}–${to} should have frequency ${frequency}.`);
    }
  }
  if (!checks) return { checks: 1, matched: 0, detail: "No statistics checks were configured." };
  return { checks, matched, detail: notes.slice(0, 4).join(" ") || `${matched} of ${checks} statistics checks correct.` };
}

function leafTokens(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value.trim().split(/[\s,]+/).filter(Boolean);
}

function sameTokens(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((token, index) => token === b[index]);
}

function scoreStemLeaf(expected: Record<string, unknown>, payload: Record<string, unknown>) {
  const spec = payload.stem_leaf;
  if (!isRecord(spec)) return { checks: 1, matched: 0, detail: "No stem-and-leaf diagram was submitted." };
  const backToBack = text(spec.layout) === "back_to_back";
  const wantedRows = Array.isArray(expected.rows) ? expected.rows.filter(isRecord) : [];
  const rows = Array.isArray(spec.rows) ? spec.rows.filter(isRecord) : [];
  const used = new Set<number>();
  let checks = 0;
  let matched = 0;
  const notes: string[] = [];
  for (const wanted of wantedRows) {
    const stem = text(wanted.stem);
    if (!stem) continue;
    const index = rows.findIndex((row, i) => !used.has(i) && text(row.stem) === stem);
    if (index < 0) {
      checks += backToBack ? 3 : 1;
      notes.push(`Stem ${stem} is missing.`);
      continue;
    }
    used.add(index);
    const row = rows[index];
    if (backToBack) {
      checks += 2;
      const leftOk = sameTokens(leafTokens(row.leftLeaves ?? row.leaves), Array.isArray(wanted.left) ? wanted.left.map(String) : []);
      const rightOk = sameTokens(leafTokens(row.rightLeaves ?? row.leaves), Array.isArray(wanted.right) ? wanted.right.map(String) : []);
      if (leftOk) matched++;
      if (rightOk) matched++;
      if (!leftOk) notes.push(`Left-hand leaves for stem ${stem} are not in the required order.`);
      if (!rightOk) notes.push(`Right-hand leaves for stem ${stem} are not in the required order.`);
    } else {
      checks++;
      const ok = sameTokens(leafTokens(row.leaves), Array.isArray(wanted.leaves) ? wanted.leaves.map(String) : []);
      if (ok) matched++;
      else notes.push(`Leaves for stem ${stem} are not in the required order.`);
    }
  }
  if (!checks) return { checks: 1, matched: 0, detail: "No stem-and-leaf rows were configured." };
  return { checks, matched, detail: notes.slice(0, 4).join(" ") || "Stem-and-leaf rows and leaf order are correct." };
}

function scoreDataTable(expected: Record<string, unknown>, payload: Record<string, unknown>) {
  const spec = payload.data_table;
  if (!isRecord(spec)) return { checks: 1, matched: 0, detail: "No data table was submitted." };
  const wantedCells = Array.isArray(expected.cells) ? expected.cells.filter(isRecord) : [];
  const rows = Array.isArray(spec.rows) ? spec.rows : [];
  let matched = 0;
  const notes: string[] = [];
  for (const cell of wantedCells) {
    const row = finite(cell.row);
    const column = finite(cell.column);
    if (row === null || column === null) continue;
    const rowValues = Array.isArray(rows[row]) ? (rows[row] as unknown[]) : [];
    const actual = String(rowValues[column] ?? "").trim();
    if (actual === String(cell.value ?? "").trim()) matched++;
    else notes.push(`Cell R${row + 1}C${column + 1} should read “${String(cell.value ?? "")}”.`);
  }
  return {
    checks: wantedCells.length,
    matched,
    detail: notes.slice(0, 4).join(" ") || `${matched} of ${wantedCells.length} table cells correct.`,
  };
}

/** Keyword-based scoring for written/theoretical answers. */
function scoreText(expected: Record<string, unknown>, payload: Record<string, unknown>) {
  let raw = "";
  if (typeof payload.text === "string") raw = payload.text;
  else if (typeof payload.answer === "string") raw = payload.answer;
  else if (payload.value && typeof payload.value === "string") raw = payload.value;
  const normalized = normText(raw);
  const groups = Array.isArray(expected.keyword_groups)
    ? expected.keyword_groups.filter((g): g is string[] => Array.isArray(g)).map((g) => g.map(String).map(normText))
    : [];
  const minGroups = typeof expected.min_keyword_groups === "number" ? expected.min_keyword_groups : groups.length;
  const accepted = Array.isArray(expected.accepted_answers)
    ? expected.accepted_answers.filter((a): a is string => typeof a === "string").map((a) => normText(a))
    : [];

  let matchedGroups = 0;
  const matchedGroupNotes: string[] = [];
  for (const group of groups) {
    const hit = group.some((kw) => normalized.includes(kw));
    if (hit) matchedGroups++;
    else matchedGroupNotes.push(`Missing keyword group: ${group.join(", ")}.`);
  }

  const exactMatch = accepted.length > 0 && normalized.length > 0 && accepted.some((a) => textAnswersMatch(normalized, a));
  const keywordMatch = groups.length > 0 && matchedGroups >= minGroups;
  // Partial credit: fraction of keyword groups matched (capped at 1).
  const matched = groups.length > 0 ? matchedGroups / groups.length : (exactMatch || keywordMatch ? 1 : 0);
  const checks = 1;

  let detail = "";
  if (exactMatch) detail = "Answer matches an accepted response.";
  else if (groups.length > 0) detail = `Matched ${matchedGroups} of ${groups.length} required concept group(s).`;
  else if (groups.length === 0 && accepted.length === 0) detail = "No text grading criteria were configured.";
  else {
    const missing = matchedGroupNotes.slice(0, 3).join(" ");
    detail = `Answer did not match the required concepts. ${missing}`;
  }

  return { checks, matched, detail };
}

/** Score every configured structured construction. Missing work scores zero, never full marks. */
export function scoreStructuredMarks(
  rawRules: unknown,
  answer: Record<string, unknown> | null | undefined,
): StructuredMarkResult[] {
  const rules = normaliseStructuredRules(rawRules);
  if (!rules.length) return [];
  const payload = isRecord(answer) ? answer : {};
  return rules.map((rule) => {
    const source = payloadFor(payload, rule);
    if (!source) {
      return {
        id: rule.id,
        label: rule.label,
        tool: rule.tool,
        mode: rule.mode,
        points: rule.points,
        earned: 0,
        status: "missing" as const,
        detail: rule.part ? `No construction was saved for part ${rule.part}.` : "No construction was saved.",
      };
    }
    const checked = rule.mode === "graph_segments"
      ? scoreGraphSegments(rule.expected, source.graph, rule.tolerance ?? 0.01)
      : rule.tool === "graph"
        ? scoreGraphPoints(rule.expected, source.graph, rule.tolerance ?? 0.01)
        : rule.tool === "statistics"
          ? scoreStatistics(rule.expected, source)
          : rule.tool === "stem_leaf"
            ? scoreStemLeaf(rule.expected, source)
            : rule.tool === "text"
              ? scoreText(rule.expected, source)
              : scoreDataTable(rule.expected, source);
    const ratio = checked.checks > 0 ? checked.matched / checked.checks : 0;
    const earned = round(rule.points * Math.max(0, Math.min(1, ratio)));
    return {
      id: rule.id,
      label: rule.label,
      tool: rule.tool,
      mode: rule.mode,
      points: rule.points,
      earned,
      status: earned === rule.points ? "awarded" as const : earned > 0 ? "partial" as const : "not_awarded" as const,
      detail: checked.detail,
    };
  });
}

/** Expected construction, rendered in the marking script without exposing it earlier. */
export function structuredExpectedSummary(rule: StructuredMarkRule): string {
  const expected = rule.expected;
  if (rule.tool === "graph" && Array.isArray(expected.points)) {
    return expected.points
      .filter(isRecord)
      .map((point) => `(${String(point.x)}, ${String(point.y)})`)
      .join(", ");
  }
  if (rule.tool === "statistics" && Array.isArray(expected.groups)) {
    return expected.groups
      .filter(isRecord)
      .map((group) => `${String(group.from)}–${String(group.to)}: f = ${String(group.frequency)}`)
      .join("; ");
  }
  if (rule.tool === "stem_leaf" && Array.isArray(expected.rows)) {
    return expected.rows
      .filter(isRecord)
      .map((row) => `${(Array.isArray(row.left) ? row.left : []).join(" ")} | ${String(row.stem)} | ${(Array.isArray(row.right) ? row.right : []).join(" ")}`)
      .join("; ");
  }
  if (rule.tool === "data_table") return rule.label;
  if (rule.tool === "text") {
    const parts: string[] = [];
    if (Array.isArray(rule.expected.keyword_groups)) {
      parts.push("Keywords: " + rule.expected.keyword_groups.map((g: unknown) => Array.isArray(g) ? g.join(" / ") : String(g)).join("; "));
    }
    if (Array.isArray(rule.expected.accepted_answers)) {
      parts.push("Accepted: " + rule.expected.accepted_answers.join(" / "));
    }
    return parts.length ? parts.join(" | ") : rule.label;
  }
  return rule.label;
}
