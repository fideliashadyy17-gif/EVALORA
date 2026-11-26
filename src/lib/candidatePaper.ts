import type { SupabaseClient } from "@supabase/supabase-js";
import { loadMypResult } from "./mypResults";
import { answerIsPresent } from "./answerPresence";
import { assessDiagramSummary, type AssessDiagramSpec } from "./assessDiagram";
import { assessPartsFromConfig, publicAssessParts } from "./assessParts";
import { docIsEmpty, docToPlainText, textToDoc, type RichDoc, type RichNode } from "./content";
import { dataTableHasWork, normaliseDataTableSpec, type DataTableSpec } from "./dataTableSpec";
import { attemptRows } from "./exam";
import { parseExamPaperTemplate, parsePaperSections, resolveExamPaperHeader } from "./examPaper";
import { geometrySpecHasWork, normaliseGeometrySpec, type GeometrySpec } from "./geometrySpec";
import { graphSpecHasWork, normaliseGraphSpec, type GraphSpec } from "./graphSpec";
import { publicQuestion, type SessionQuestionRow } from "./live";
import { normaliseProbabilityTreeSpec, probabilityTreeHasWork, type ProbabilityTreeSpec } from "./probabilityTreeSpec";
import { normaliseStatsSpec, statsSpecHasWork, type StatsSpec } from "./statsSpec";
import { normaliseStemLeafSpec, stemLeafHasWork, type StemLeafSpec } from "./stemLeafSpec";
import { normaliseVennSpec, vennSpecHasWork, type VennSpec } from "./vennSpec";

/**
 * Candidate-safe examination paper assembler (ManageBac evidence PDF).
 *
 * Strictly read-only and structurally incapable of leaking answer keys,
 * model answers, marking schemes, hidden grading rubrics, hints, proctoring
 * incidents, Lockdown Browser logs, internal flags, admin override notes, or
 * raw database identifiers.
 *
 * Every question and option list is reconstructed in the exact order presented
 * to the specific candidate attempt (`attemptRows` + `publicQuestion`).
 */

export const ELIGIBLE_PAPER_STATUSES = new Set(["submitted", "auto_submitted", "marked"]);

export function isAttemptEligibleForPaperPdf(status: unknown): boolean {
  return typeof status === "string" && ELIGIBLE_PAPER_STATUSES.has(status);
}

export interface CandidatePaperHeader {
  schoolName: string;
  organizationLogoUrl: string | null;
  candidateFirstName: string | null;
  candidateLastName: string | null;
  candidateFullName: string;
  className: string | null;
  gradeLabel: string | null;
  examTitle: string;
  subject: string | null;
  examVersion: string | null;
  examDateIso: string | null;
  submittedAtIso: string | null;
  startedAtIso: string | null;
  submissionStatus: string;
  submissionStatusLabel: string;
  attemptNumber: number;
  durationMinutes: number | null;
  totalMarks: number;
  questionCount: number;
  answeredCount: number;
  resultsPublished: boolean;
  /** Populated ONLY when `resultsPublished === true`. */
  score: number | null;
  /** Populated ONLY when `resultsPublished === true`. */
  maxScore: number | null;
  /** Populated ONLY when `resultsPublished === true`. */
  percentage: number | null;
  passMarkPercent: number | null;
  /**
   * Criterion-level breakdown of the validated result.
   *
   * Populated ONLY when `resultsPublished === true`, and only for criteria the
   * examination's marking records actually cover (an MYP paper reports the
   * criteria its questions are mapped to). Values come from the single
   * authoritative results engine (`buildMypResult`), which folds in any applied
   * verified criterion-level mark corrections — the PDF never recomputes marks
   * of its own.
   *
   * Candidates are never shown an MYP achievement level here: levels are
   * school-internal and the award is expressed in marks in the paper record.
   */
  criteria: CandidatePaperCriterion[];
}

/** One criterion line in the candidate's validated results summary. */
export interface CandidatePaperCriterion {
  /** Criterion letter, e.g. "A". */
  code: string;
  /** Official criterion title, e.g. "Knowing and understanding". */
  title: string;
  /** Marks the candidate earned on this criterion's questions. */
  marksAwarded: number;
  /** Marks available for this criterion on this paper. */
  marksMax: number;
  /** Percentage of the criterion's marks, or null when none were available. */
  percent: number | null;
}

export interface CandidatePaperOption {
  letter: string;
  label: string;
  contentDoc: RichDoc | null;
  selectedByCandidate: boolean;
}

export interface CandidatePaperPartWorking {
  text: string | null;
  richDoc: RichDoc | null;
  structuredWork: CandidatePaperStructuredWork;
}

export interface CandidatePaperAssessPart {
  label: string;
  prompt: string;
  kind: "numeric" | "text" | "expression";
  points: number;
  unit: string | null;
  strand: string | null;
  candidateResponse: string | null;
  working?: CandidatePaperPartWorking | null;
}

export interface CandidatePaperMatchingItem {
  left: string;
  candidateRight: string | null;
}

export interface CandidatePaperStructuredWork {
  graph?: GraphSpec;
  geometry?: GeometrySpec;
  statistics?: StatsSpec;
  dataTable?: DataTableSpec;
  stemLeaf?: StemLeafSpec;
  venn?: VennSpec;
  probabilityTree?: ProbabilityTreeSpec;
}

export interface CandidatePaperAnswer {
  answered: boolean;
  /** Single/multi-choice selected option labels in candidate's order. */
  selectedOptions: { letter: string; label: string }[];
  /** Primary plain-text or numeric response (numeric, short_answer, open_ended). */
  textResponse: string | null;
  /** Rich document response when the candidate used the structured editor. */
  richDocResponse: RichDoc | null;
  /** Typed working / explanation entered alongside parts or constructions. */
  workingText: string | null;
  /** Multi-part responses aligned 1:1 with the question's public parts. */
  parts: CandidatePaperAssessPart[];
  /** Candidate's matched pairs for `matching` questions. */
  matchingPairs: CandidatePaperMatchingItem[];
  /** Candidate's submitted sequence for `ordering` questions. */
  orderedItems: string[];
  /** Any visual/mathematical constructions submitted by the candidate. */
  structuredWork: CandidatePaperStructuredWork;
  /** Fallback description for any non-standard payload keys (never silently dropped). */
  fallbackNotes: string[];
}

export interface CandidatePaperQuestion {
  number: number;
  printedLabel: string | null;
  sectionId: string | null;
  type: string;
  marks: number;
  criterionLabel: string | null;
  prompt: string;
  promptDoc: RichDoc | null;
  /** Reconstructed in the exact order presented to this candidate; never carries `is_correct`. */
  options: CandidatePaperOption[];
  /** Unpaired left prompts & shuffled right choices for `matching` questions (no keys). */
  matchingChoices: {
    mode: "match" | "sort" | "letters";
    leftItems: string[];
    rightItems: string[];
    rows?: { label: string; criterion: string | null; left: string }[];
  } | null;
  /** Candidate's actual submitted response (or `answered: false`). */
  answer: CandidatePaperAnswer;
  /** Populated ONLY when `resultsPublished === true`. */
  awardedMarks: number | null;
  /** Populated ONLY when `resultsPublished === true` and genuine teacher feedback exists. */
  teacherFeedback: string | null;
}

export interface CandidatePaperSection {
  id: string | null;
  title: string | null;
  instructions: string | null;
  marks: number | null;
  questions: CandidatePaperQuestion[];
}

export interface CandidatePaperData {
  header: CandidatePaperHeader;
  sections: CandidatePaperSection[];
  questions: CandidatePaperQuestion[];
  filename: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

function cleanStr(v: unknown, max = 400): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function finiteNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function formatSubmissionStatus(status: string): string {
  switch (status) {
    case "submitted":
      return "Submitted";
    case "auto_submitted":
      return "Auto-submitted (time expired)";
    case "marked":
      return "Submitted & Marked";
    default:
      return status.replace(/_/g, " ");
  }
}

export function extractExamVersion(
  examTitle: string,
  examSettings: Record<string, unknown>,
  quizSettings: Record<string, unknown>,
): string | null {
  for (const key of ["exam_version", "version_label", "paper_version"]) {
    const explicit = cleanStr(examSettings[key], 40) ?? cleanStr(quizSettings[key], 40);
    if (explicit) return explicit;
  }
  const parenMatch = examTitle.match(/\(\s*(Version\s+[A-Za-z0-9._-]+)\s*\)/i);
  if (parenMatch) return parenMatch[1].replace(/\s+/g, " ").trim();
  const dashMatch = examTitle.match(/(?:—|-|·)\s*(Version\s+[A-Za-z0-9._-]+)/i);
  if (dashMatch) return dashMatch[1].replace(/\s+/g, " ").trim();
  const wordMatch = examTitle.match(/\b(Version\s+[A-Za-z0-9._-]+)\b/i);
  if (wordMatch) return wordMatch[1].replace(/\s+/g, " ").trim();
  return null;
}

export function inferSubjectFromTitle(title: string): string | null {
  const known = [
    "Mathematics",
    "Mathématiques",
    "Physics",
    "Chemistry",
    "Biology",
    "Sciences",
    "Science",
    "English",
    "French",
    "Spanish",
    "History",
    "Geography",
    "Economics",
    "Computer Science",
    "Design",
    "Individuals and Societies",
  ];
  for (const subject of known) {
    if (new RegExp(`\\b${subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(title)) {
      return subject;
    }
  }
  return null;
}

function optionLetter(index: number): string {
  if (index < 26) return String.fromCharCode(65 + index);
  const first = Math.floor(index / 26) - 1;
  const second = index % 26;
  return `${String.fromCharCode(65 + first)}${String.fromCharCode(65 + second)}`;
}

function safeToken(input: string | null | undefined, maxLen = 40): string {
  if (!input) return "";
  const ascii = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return ascii.slice(0, maxLen).replace(/_+$/g, "");
}

function extractCompactGradeToken(
  className: string | null,
  gradeLabel: string | null,
  examTitle: string,
): string {
  const sources = [className, gradeLabel, examTitle].filter((s): s is string => Boolean(s));
  for (const src of sources) {
    const myp = src.match(/\bMYP\s*([1-5])\b/i);
    if (myp) return `MYP${myp[1]}`;
  }
  for (const src of sources) {
    const dp = src.match(/\b(?:IB\s*)?DP\s*([1-2])\b/i);
    if (dp) return `DP${dp[1]}`;
  }
  for (const src of sources) {
    const grade = src.match(/\bGrade\s*(\d{1,2})\b/i);
    if (grade) return `Grade${grade[1]}`;
  }
  const fallback = safeToken(gradeLabel ?? className ?? "", 18);
  return fallback;
}

/**
 * Sanitized filename for ManageBac evidence uploads, e.g.:
 * `EVALORA_MYP4_Mathematics_Melina_OUSSOU_Exam.pdf`
 */
export function buildCandidatePaperFilename(meta: {
  className?: string | null;
  gradeLabel?: string | null;
  examTitle: string;
  subject?: string | null;
  candidateFullName: string;
}): string {
  const grade = extractCompactGradeToken(meta.className ?? null, meta.gradeLabel ?? null, meta.examTitle);
  const subject = safeToken(meta.subject ?? inferSubjectFromTitle(meta.examTitle) ?? "", 24);
  const student = safeToken(meta.candidateFullName, 36) || "Candidate";
  const parts = ["EVALORA", grade, subject, student, "Exam"].filter(Boolean);
  const stem = parts.join("_").slice(0, 112).replace(/_+$/g, "");
  return `${stem || "EVALORA_Candidate_Exam"}.pdf`;
}

function stemLeafMatchesStarter(spec: StemLeafSpec, starter: StemLeafSpec | null): boolean {
  if (!starter) return false;
  const hasAnyLeaf = spec.rows.some(
    (r) => r.leaves.trim() || (r.leftLeaves ?? "").trim() || (r.rightLeaves ?? "").trim(),
  );
  if (hasAnyLeaf) return false;
  if (spec.rows.length !== starter.rows.length) return false;
  return spec.rows.every(
    (row, i) =>
      row.stem.trim() === (starter.rows[i]?.stem ?? "").trim() &&
      row.leaves.trim() === (starter.rows[i]?.leaves ?? "").trim() &&
      (row.leftLeaves ?? "").trim() === (starter.rows[i]?.leftLeaves ?? "").trim() &&
      (row.rightLeaves ?? "").trim() === (starter.rows[i]?.rightLeaves ?? "").trim(),
  );
}

function extractStructuredWorkFromPayload(
  payload: Record<string, unknown>,
  starterStemLeaf: StemLeafSpec | null = null,
): CandidatePaperStructuredWork {
  const work: CandidatePaperStructuredWork = {};
  if (payload.graph) {
    const spec = normaliseGraphSpec(payload.graph);
    if (graphSpecHasWork(spec)) work.graph = spec;
  }
  if (payload.geometry) {
    const spec = normaliseGeometrySpec(payload.geometry);
    if (geometrySpecHasWork(spec)) work.geometry = spec;
  }
  if (payload.statistics) {
    const spec = normaliseStatsSpec(payload.statistics);
    if (statsSpecHasWork(spec)) work.statistics = spec;
  }
  if (payload.data_table) {
    const spec = normaliseDataTableSpec(payload.data_table);
    if (dataTableHasWork(spec)) work.dataTable = spec;
  }
  if (payload.stem_leaf) {
    const spec = normaliseStemLeafSpec(payload.stem_leaf);
    if (stemLeafHasWork(spec) && !stemLeafMatchesStarter(spec, starterStemLeaf)) {
      work.stemLeaf = spec;
    }
  }
  if (payload.venn) {
    const spec = normaliseVennSpec(payload.venn);
    if (vennSpecHasWork(spec)) work.venn = spec;
  }
  if (payload.probability_tree) {
    const spec = normaliseProbabilityTreeSpec(payload.probability_tree);
    if (probabilityTreeHasWork(spec)) work.probabilityTree = spec;
  }
  return work;
}

function hasAnyStructuredWork(work: CandidatePaperStructuredWork): boolean {
  return Boolean(
    work.graph ||
    work.geometry ||
    work.statistics ||
    work.dataTable ||
    work.stemLeaf ||
    work.venn ||
    work.probabilityTree,
  );
}

/**
 * Extract per-part working payload (which in EVALORA can be a plain string, a
 * bare TipTap RichDoc, or a full nested response workspace object carrying
 * `{ text, doc, data_table, graph, statistics, stem_leaf, venn, probability_tree, geometry }`).
 * Returns `null` when only empty starter scaffolding is present.
 */
function extractPartWorking(
  payload: unknown,
  starterStemLeaf: StemLeafSpec | null = null,
): CandidatePaperPartWorking | null {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed ? { text: trimmed, richDoc: null, structuredWork: {} } : null;
  }
  if (!isRecord(payload)) return null;

  // Bare TipTap RichDoc
  if (payload.type === "doc") {
    const doc = payload as unknown as RichDoc;
    if (docIsEmpty(doc)) return null;
    const plain = docToPlainText(doc).trim();
    return { text: plain || null, richDoc: doc, structuredWork: {} };
  }

  // Full nested workspace payload (`AnswerResponseView` shape)
  let text: string | null = null;
  if (payload.value !== undefined && payload.value !== null && String(payload.value).trim() !== "") {
    text = String(payload.value).trim();
  }
  if (typeof payload.text === "string" && payload.text.trim()) {
    text = text ? `${text}\n${payload.text.trim()}` : payload.text.trim();
  }
  let richDoc: RichDoc | null = null;
  if (isRecord(payload.doc) && payload.doc.type === "doc" && !docIsEmpty(payload.doc as unknown as RichDoc)) {
    richDoc = payload.doc as unknown as RichDoc;
    if (!text) {
      const plain = docToPlainText(richDoc).trim();
      if (plain) text = plain;
    }
  }
  const structuredWork = extractStructuredWorkFromPayload(payload, starterStemLeaf);
  if (!text && !richDoc && !hasAnyStructuredWork(structuredWork)) {
    return null;
  }
  return { text, richDoc, structuredWork };
}

/**
 * Extract readable text from an arbitrary saved answer payload while preserving
 * structured workspaces so nothing submitted by the candidate is lost.
 */
function buildCandidateAnswer(args: {
  questionType: string;
  config: Record<string, unknown>;
  publicOptions: { letter: string; id: string; label: string }[];
  rawAnswer: Record<string, unknown> | null;
}): CandidatePaperAnswer {
  const { questionType, config, publicOptions, rawAnswer } = args;

  const selectedOptions: { letter: string; label: string }[] = [];
  let textResponse: string | null = null;
  let richDocResponse: RichDoc | null = null;
  let workingText: string | null = null;
  const matchingPairs: CandidatePaperMatchingItem[] = [];
  const orderedItems: string[] = [];
  let structuredWork: CandidatePaperStructuredWork = {};
  const fallbackNotes: string[] = [];

  // Multi-part questions: ALWAYS expose the question's public parts (labels,
  // prompts, marks, units — NEVER answer keys or hints) aligned with the
  // candidate's typed responses and optional per-part working workspaces.
  const pubParts = questionType === "assess_parts"
    ? publicAssessParts(assessPartsFromConfig(config))
    : [];
  const rawPartsMap = rawAnswer && isRecord(rawAnswer.parts) ? rawAnswer.parts : {};
  const rawWorkingMap = rawAnswer && isRecord(rawAnswer.working) ? rawAnswer.working : {};

  const starterStemLeaf =
    isRecord(config.response_stem_leaf) && isRecord(config.response_stem_leaf.starter)
      ? normaliseStemLeafSpec(config.response_stem_leaf.starter)
      : null;

  const parts: CandidatePaperAssessPart[] = pubParts.map((part) => {
    const val = rawPartsMap[part.id];
    let resp: string | null = null;
    if (typeof val === "string" && val.trim()) resp = val.trim();
    else if (typeof val === "number" && Number.isFinite(val)) resp = String(val);
    const partWorking = extractPartWorking(rawWorkingMap[part.id], starterStemLeaf);
    return {
      label: part.label,
      prompt: part.prompt,
      kind: part.kind,
      points: part.points,
      unit: part.unit ?? null,
      strand: part.strand ?? null,
      candidateResponse: resp,
      ...(partWorking ? { working: partWorking } : {}),
    };
  });

  // Also preserve any unexpected extra part or working keys submitted by the
  // candidate that are not in `pubParts` (defensive against older question revisions).
  const knownPartIds = new Set(pubParts.map((p) => p.id));
  const extraPartIds = [
    ...Object.keys(rawPartsMap),
    ...(questionType === "assess_parts" ? Object.keys(rawWorkingMap) : []),
  ].filter((id, idx, arr) => !knownPartIds.has(id) && arr.indexOf(id) === idx);
  for (const k of extraPartIds) {
    const v = rawPartsMap[k];
    const strVal = typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
    const partWorking = questionType === "assess_parts" ? extractPartWorking(rawWorkingMap[k], starterStemLeaf) : null;
    if (strVal || partWorking) {
      parts.push({
        label: `(${k})`,
        prompt: "",
        kind: "text",
        points: 0,
        unit: null,
        strand: null,
        candidateResponse: strVal || null,
        ...(partWorking ? { working: partWorking } : {}),
      });
    }
  }

  const hasPartEvidence = parts.some((p) => Boolean(p.candidateResponse || p.working));
  const answered = answerIsPresent(rawAnswer) || hasPartEvidence;

  if (!answered || !rawAnswer) {
    return {
      answered: false,
      selectedOptions,
      textResponse,
      richDocResponse,
      workingText,
      parts,
      matchingPairs,
      orderedItems,
      structuredWork,
      fallbackNotes,
    };
  }

  // Single choice / true_false / poll
  if (typeof rawAnswer.option_id === "string" && rawAnswer.option_id.trim()) {
    const opt = publicOptions.find((o) => o.id === rawAnswer.option_id);
    if (opt) {
      selectedOptions.push({ letter: opt.letter, label: opt.label });
    } else {
      fallbackNotes.push("Selected option recorded (option no longer on current template).");
    }
  }

  // Multiple select
  if (Array.isArray(rawAnswer.option_ids)) {
    const chosenSet = new Set(
      rawAnswer.option_ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0),
    );
    // Preserve candidate's presented option order
    for (const opt of publicOptions) {
      if (chosenSet.has(opt.id)) {
        selectedOptions.push({ letter: opt.letter, label: opt.label });
      }
    }
  }

  // Numeric
  if (rawAnswer.value !== undefined && rawAnswer.value !== null && String(rawAnswer.value).trim() !== "") {
    textResponse = String(rawAnswer.value).trim();
  }

  // Short answer / open ended text
  if (typeof rawAnswer.text === "string" && rawAnswer.text.trim()) {
    textResponse = textResponse ? `${textResponse}\n${rawAnswer.text.trim()}` : rawAnswer.text.trim();
  }

  // Rich document response (TipTap JSON)
  if (isRecord(rawAnswer.doc) && rawAnswer.doc.type === "doc" && !docIsEmpty(rawAnswer.doc as unknown as RichDoc)) {
    richDocResponse = rawAnswer.doc as unknown as RichDoc;
    if (!textResponse) {
      const plain = docToPlainText(richDocResponse);
      if (plain) textResponse = plain;
    }
  }

  // Top-level working / showing steps (flat string, or non-assess_parts map)
  if (typeof rawAnswer.working === "string" && rawAnswer.working.trim()) {
    workingText = rawAnswer.working.trim();
  } else if (questionType !== "assess_parts" && isRecord(rawAnswer.working)) {
    const workingEntries: string[] = [];
    for (const [k, v] of Object.entries(rawAnswer.working)) {
      const extracted = extractPartWorking(v);
      if (extracted?.text) {
        workingEntries.push(`(${k}) ${extracted.text}`);
      }
    }
    if (workingEntries.length) {
      workingText = workingEntries.join("\n");
    }
  }

  // Matching pairs
  if (Array.isArray(rawAnswer.pairs)) {
    for (const entry of rawAnswer.pairs) {
      if (!isRecord(entry)) continue;
      const left = typeof entry.left === "string" ? entry.left.trim() : "";
      const right = typeof entry.right === "string" ? entry.right.trim() : "";
      if (left || right) {
        matchingPairs.push({ left, candidateRight: right || null });
      }
    }
  }

  // Ordering
  if (Array.isArray(rawAnswer.order)) {
    for (const item of rawAnswer.order) {
      if (typeof item === "string" && item.trim()) orderedItems.push(item.trim());
    }
  }

  // Structured mathematical constructions submitted at the top level
  structuredWork = extractStructuredWorkFromPayload(rawAnswer, starterStemLeaf);

  // Defensive check: if `answered` is true but none of the structured fields above
  // captured content, serialize any remaining non-metadata keys so we NEVER
  // silently drop a candidate's submitted work.
  const hasStructured = hasAnyStructuredWork(structuredWork);
  const hasPartWork = hasPartEvidence;
  if (
    !selectedOptions.length &&
    !textResponse &&
    !richDocResponse &&
    !workingText &&
    !hasPartWork &&
    !matchingPairs.length &&
    !orderedItems.length &&
    !hasStructured &&
    !fallbackNotes.length
  ) {
    const ignored = new Set(["version", "id", "title", "updated_at", "saved_at", "parts", "option_id", "option_ids"]);
    for (const [key, value] of Object.entries(rawAnswer)) {
      if (ignored.has(key) || value === null || value === undefined) continue;
      if (typeof value === "string" && value.trim()) {
        fallbackNotes.push(`${key}: ${value.trim()}`);
      } else if (typeof value === "number" || typeof value === "boolean") {
        fallbackNotes.push(`${key}: ${String(value)}`);
      }
    }
  }

  return {
    answered: true,
    selectedOptions,
    textResponse,
    richDocResponse,
    workingText,
    parts,
    matchingPairs,
    orderedItems,
    structuredWork,
    fallbackNotes,
  };
}

/**
 * Pure candidate paper data builder (used by the server loader and directly
 * unit-tested with synthetic & realistic exam fixtures).
 */
export function buildCandidatePaperData(input: {
  attempt: {
    id: string;
    status: string;
    started_at?: string | null;
    submitted_at?: string | null;
    score?: number | string | null;
    max_score?: number | string | null;
    attempt_number?: number | null;
    first_name?: string | null;
    last_name?: string | null;
  };
  exam: {
    title: string;
    instructions?: string | null;
    duration_minutes?: number | null;
    settings?: Record<string, unknown> | null;
  };
  candidate: {
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  };
  organization: {
    name?: string | null;
    logo_url?: string | null;
  } | null;
  quizSettings?: Record<string, unknown> | null;
  templateRow?: unknown;
  className?: string | null;
  orderedRows: SessionQuestionRow[];
  savedAnswers: {
    question_id: string;
    answer?: unknown;
    points_awarded?: number | string | null;
    marker_note?: string | null;
    grading_note?: string | null;
  }[];
  /**
   * The attempt's result as computed by the single authoritative MYP results
   * engine (`buildMypResult`), when the caller has loaded it.
   *
   * Criterion marks are NEVER recomputed here. Passing the engine's own output
   * means the PDF can never disagree with the Results screens, and applied
   * verified criterion mark corrections are inherited, never re-implemented.
   */
  result?: {
    published: boolean;
    criteria: { code: string; title: string; marksAwarded: number; marksMax: number; percent: number | null }[];
  } | null;
}): CandidatePaperData {
  const { attempt, exam, candidate, organization, orderedRows, savedAnswers } = input;
  const examSettings = (exam.settings ?? {}) as Record<string, unknown>;
  const quizSettings = (input.quizSettings ?? {}) as Record<string, unknown>;
  // A result is published when EITHER the explicit setting is on OR the results
  // engine reports it published. The Results screens treat `grades_published_at`
  // (and a published attempt) as publication too, so reading only the setting
  // could print "Pending publication (withheld)" on a paper whose marks the
  // school had already released. The engine is the single source of truth.
  const resultsPublished = examSettings.results_published === true || input.result?.published === true;
  const randomizeOptions = Boolean(examSettings.randomize_options);

  const firstName = cleanStr(attempt.first_name, 80) ?? cleanStr(candidate.first_name, 80);
  const lastName = cleanStr(attempt.last_name, 80) ?? cleanStr(candidate.last_name, 80);
  const combinedName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const fullName = cleanStr(candidate.full_name, 160) ?? (combinedName || "Candidate");

  const totalPaperMarks = Math.round(
    orderedRows.reduce((sum, row) => sum + Math.max(0, finiteNum(row.points ?? row.questions.points) ?? 0), 0) * 100,
  ) / 100;

  const paperHeader = resolveExamPaperHeader({
    organizationName: cleanStr(organization?.name, 160) ?? "EVALORA",
    organizationLogoUrl: cleanStr(organization?.logo_url, 400),
    examTitle: exam.title,
    examInstructions: exam.instructions ?? null,
    examDurationMinutes: exam.duration_minutes ?? null,
    examSettings,
    quizSettings,
    template: parseExamPaperTemplate(input.templateRow ?? null),
    totalMarks: totalPaperMarks,
    candidateName: fullName,
    candidateRef: null,
  });

  const savedByQuestion = new Map(savedAnswers.map((row) => [row.question_id, row]));

  let answeredCount = 0;
  const questions: CandidatePaperQuestion[] = orderedRows.map((row, index) => {
    const q = row.questions;
    const cfg = (q.config ?? {}) as Record<string, unknown>;
    const marks = Math.max(0, finiteNum(row.points ?? q.points) ?? 0);

    // Reconstruct the EXACT candidate-safe question & option order presented
    // to this candidate attempt (uses attempt.id seed just like /api/exam/state).
    const pub = publicQuestion(row, {
      randomizeOptions,
      seed: attempt.id,
      calculatorByDefault: examSettings.calculator === true,
    });

    const saved = savedByQuestion.get(q.id);
    const rawAnswer = saved && isRecord(saved.answer) ? saved.answer : null;
    const selectedSet = new Set<string>();
    if (rawAnswer) {
      if (typeof rawAnswer.option_id === "string") selectedSet.add(rawAnswer.option_id);
      if (Array.isArray(rawAnswer.option_ids)) {
        for (const id of rawAnswer.option_ids) {
          if (typeof id === "string") selectedSet.add(id);
        }
      }
    }

    const rawPublicOpts = (Array.isArray(pub.options) ? pub.options : []) as {
      id: string;
      label: string;
      content_doc?: RichDoc | null;
    }[];

    const publicOptionsWithLetter = rawPublicOpts.map((opt, optIdx) => {
      // Many authored papers store the letter ("A", "B", "C", "D") in `opt.label`
      // and the actual option prose/math in `opt.content_doc`. Prefer `content_doc`
      // text so randomized options never read "Selected: B. C" or "A. A".
      const docText = opt.content_doc && !docIsEmpty(opt.content_doc) ? docToPlainText(opt.content_doc).trim() : "";
      const displayLabel = docText || opt.label;
      return {
        id: opt.id,
        letter: optionLetter(optIdx),
        label: displayLabel,
        contentDoc: opt.content_doc ?? null,
        selectedByCandidate: selectedSet.has(opt.id),
      };
    });

    const options: CandidatePaperOption[] = publicOptionsWithLetter.map(({ letter, label, contentDoc, selectedByCandidate }) => ({
      letter,
      label,
      contentDoc,
      selectedByCandidate,
    }));

    const matchingChoices =
      q.type === "matching" && Array.isArray(pub.matching_lefts)
        ? {
            mode:
              pub.match_mode === "sort"
                ? ("sort" as const)
                : pub.match_mode === "letters"
                  ? ("letters" as const)
                  : ("match" as const),
            leftItems: (pub.matching_lefts as unknown[]).filter((x): x is string => typeof x === "string"),
            rightItems: Array.isArray(pub.matching_rights)
              ? (pub.matching_rights as unknown[]).filter((x): x is string => typeof x === "string")
              : [],
            rows: Array.isArray(pub.matching_rows)
              ? (pub.matching_rows as { label?: unknown; criterion?: unknown; left?: unknown }[]).map((r, i) => ({
                  label: typeof r.label === "string" ? r.label : String(i + 1),
                  criterion: typeof r.criterion === "string" ? r.criterion : null,
                  left: typeof r.left === "string" ? r.left : "",
                }))
              : undefined,
          }
        : null;

    const answer = buildCandidateAnswer({
      questionType: q.type,
      config: cfg,
      publicOptions: publicOptionsWithLetter.map(({ id, letter, label }) => ({ id, letter, label })),
      rawAnswer,
    });

    // Align matching pairs cleanly with the question's presented left items so
    // any unmatched rows are also visible as unanswered.
    if (matchingChoices && matchingChoices.leftItems.length && answer.answered) {
      const byLeft = new Map(answer.matchingPairs.map((p) => [p.left.trim().toLowerCase(), p.candidateRight]));
      const aligned: CandidatePaperMatchingItem[] = matchingChoices.leftItems.map((left) => ({
        left,
        candidateRight: byLeft.get(left.trim().toLowerCase()) ?? null,
      }));
      // Preserve any extra candidate-submitted pairs not in leftItems
      const known = new Set(matchingChoices.leftItems.map((l) => l.trim().toLowerCase()));
      for (const extra of answer.matchingPairs) {
        if (!known.has(extra.left.trim().toLowerCase())) aligned.push(extra);
      }
      answer.matchingPairs = aligned;
    }

    if (answer.answered) answeredCount += 1;

    // Published results information ONLY when officially published
    let awardedMarks: number | null = null;
    let teacherFeedback: string | null = null;
    if (resultsPublished) {
      const parsedAwarded = finiteNum(saved?.points_awarded);
      if (parsedAwarded !== null) {
        awardedMarks = Math.round(parsedAwarded * 100) / 100;
      } else if (!answer.answered) {
        awardedMarks = 0;
      }
      // Include genuine teacher feedback only; exclude internal grading/override notes
      const note = cleanStr(saved?.marker_note, 1000);
      const internalNote = cleanStr(saved?.grading_note, 1000);
      if (note && note !== internalNote) {
        teacherFeedback = note;
      }
    }

    const printedLabel =
      cleanStr(cfg.question_label, 32) ??
      (finiteNum(cfg.question_number) !== null ? String(finiteNum(cfg.question_number)) : null);
    const criterionRaw = cleanStr(cfg.myp_criterion, 8);
    const criterionLabel = criterionRaw ? `Criterion ${criterionRaw.toUpperCase()}` : null;
    const sectionId = cleanStr(cfg.paper_section, 32);

    const promptDoc = q.prompt_doc && !docIsEmpty(q.prompt_doc) ? q.prompt_doc : textToDoc(q.prompt);

    return {
      number: index + 1,
      printedLabel,
      sectionId,
      type: q.type,
      marks,
      criterionLabel,
      prompt: q.prompt,
      promptDoc,
      options,
      matchingChoices,
      answer,
      awardedMarks,
      teacherFeedback,
    };
  });

  // Group into sections preserving the candidate's exact question order
  const configuredSections = parsePaperSections(examSettings.sections ?? quizSettings.sections);
  const sectionById = new Map(configuredSections.map((s) => [s.id, s]));
  const sections: CandidatePaperSection[] = [];
  for (const question of questions) {
    const key = question.sectionId ?? null;
    const last = sections[sections.length - 1];
    if (last && last.id === key) {
      last.questions.push(question);
    } else {
      const meta = key ? sectionById.get(key) ?? null : null;
      sections.push({
        id: key,
        title: meta?.title ?? (key ? `SECTION ${key}` : null),
        instructions: meta?.instructions ?? null,
        marks: meta?.marks ?? null,
        questions: [question],
      });
    }
  }

  const subject = paperHeader.subject ?? inferSubjectFromTitle(exam.title);
  const gradeLabel =
    cleanStr(input.className, 120) ??
    paperHeader.gradeLabel ??
    cleanStr(quizSettings.curriculum, 60) ??
    cleanStr(quizSettings.grade_level, 60);
  const examVersion = extractExamVersion(exam.title, examSettings, quizSettings);

  const score = resultsPublished ? finiteNum(attempt.score) : null;
  const maxScore = resultsPublished ? (finiteNum(attempt.max_score) ?? totalPaperMarks) : null;
  const percentage =
    resultsPublished && score !== null && maxScore !== null && maxScore > 0
      ? Math.round((score / maxScore) * 1000) / 10
      : null;

  const header: CandidatePaperHeader = {
    schoolName: paperHeader.organizationName,
    organizationLogoUrl: paperHeader.showLogo ? paperHeader.organizationLogoUrl : null,
    candidateFirstName: firstName,
    candidateLastName: lastName,
    candidateFullName: fullName,
    className: cleanStr(input.className, 120),
    gradeLabel,
    examTitle: exam.title,
    subject,
    examVersion,
    examDateIso: attempt.submitted_at ?? attempt.started_at ?? null,
    submittedAtIso: attempt.submitted_at ?? null,
    startedAtIso: attempt.started_at ?? null,
    submissionStatus: attempt.status,
    submissionStatusLabel: formatSubmissionStatus(attempt.status),
    attemptNumber: Math.max(1, Math.floor(finiteNum(attempt.attempt_number) ?? 1)),
    durationMinutes: paperHeader.durationMinutes,
    totalMarks: totalPaperMarks,
    questionCount: questions.length,
    answeredCount,
    resultsPublished,
    score,
    maxScore,
    percentage,
    passMarkPercent: resultsPublished ? (finiteNum(examSettings.pass_mark_percent) ?? 50) : null,
    criteria: buildCandidatePaperCriteria(resultsPublished ? input.result?.criteria : null),
  };

  const filename = buildCandidatePaperFilename({
    className: header.className,
    gradeLabel: header.gradeLabel,
    examTitle: header.examTitle,
    subject: header.subject,
    candidateFullName: header.candidateFullName,
  });

  return { header, sections, questions, filename };
}

/**
 * Map the results engine's criteria to the printable summary.
 *
 * Only criteria that carry marks on this paper are rendered: an MYP paper is
 * reported against the criteria its questions are mapped to, and printing an
 * "—/0" line for an unused criterion would misrepresent the examination. Values
 * are rounded to 2dp and the percentage to 1dp, matching the marks screens.
 */
export function buildCandidatePaperCriteria(
  criteria:
    | { code: string; title: string; marksAwarded: number; marksMax: number; percent: number | null }[]
    | null
    | undefined,
): CandidatePaperCriterion[] {
  if (!Array.isArray(criteria)) return [];
  const out: CandidatePaperCriterion[] = [];
  for (const criterion of criteria) {
    const code = cleanStr(criterion?.code, 4);
    if (!code) continue;
    const marksMax = finiteNum(criterion.marksMax);
    const marksAwarded = finiteNum(criterion.marksAwarded);
    if (marksMax === null || marksAwarded === null || marksMax <= 0) continue;
    const percent =
      criterion.percent !== null && criterion.percent !== undefined && Number.isFinite(Number(criterion.percent))
        ? Math.round(Number(criterion.percent) * 10) / 10
        : Math.round((marksAwarded / marksMax) * 1000) / 10;
    out.push({
      code: code.toUpperCase(),
      title: cleanStr(criterion.title, 120) ?? `Criterion ${code.toUpperCase()}`,
      marksAwarded: Math.round(marksAwarded * 100) / 100,
      marksMax: Math.round(marksMax * 100) / 100,
      percent,
    });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

export type CandidatePaperLoadError =
  | "not_found"
  | "not_submitted"
  | "archived"
  | "paper_unavailable";

export type CandidatePaperLoadResult =
  | { ok: true; data: CandidatePaperData; organizationId: string; examId: string; attemptId: string }
  | { ok: false; reason: CandidatePaperLoadError };

/**
 * Strictly read-only server loader for ONE candidate attempt's paper.
 * Callers MUST perform authorization before or via the verified lookup criteria.
 */
export async function loadCandidatePaperForAttempt(
  admin: SupabaseClient,
  attemptRow: Record<string, unknown>,
): Promise<CandidatePaperLoadResult> {
  const attemptId = String(attemptRow.id ?? "");
  const examId = String(attemptRow.exam_id ?? "");
  const candidateId = String(attemptRow.candidate_id ?? "");
  if (!attemptId || !examId || !candidateId) return { ok: false, reason: "not_found" };

  if (!isAttemptEligibleForPaperPdf(attemptRow.status)) {
    return { ok: false, reason: "not_submitted" };
  }

  // Fetch only the single exam & single candidate row (PK index lookups)
  const [{ data: exam }, { data: candidate }] = await Promise.all([
    admin
      .from("exams")
      .select("id, organization_id, quiz_id, title, instructions, duration_minutes, settings, deleted_at")
      .eq("id", examId)
      .maybeSingle(),
    admin
      .from("exam_candidates")
      .select("id, exam_id, full_name, first_name, last_name, class_id")
      .eq("id", candidateId)
      .eq("exam_id", examId)
      .maybeSingle(),
  ]);

  if (!exam || !candidate) return { ok: false, reason: "not_found" };
  const examSettings = (exam.settings ?? {}) as Record<string, unknown>;
  if (exam.deleted_at || examSettings.archived === true) {
    return { ok: false, reason: "archived" };
  }

  const classId = (attemptRow.class_id as string | null | undefined) ?? (candidate.class_id as string | null | undefined) ?? null;
  const templateId =
    typeof examSettings.exam_paper_template_id === "string" && examSettings.exam_paper_template_id
      ? examSettings.exam_paper_template_id
      : null;

  // Minimal targeted parallel queries — NEVER scans entire question bank or other candidates
  let orderedRows: SessionQuestionRow[];
  try {
    orderedRows = await attemptRows(
      admin,
      { quiz_id: (exam.quiz_id as string | null) ?? null, settings: examSettings },
      { id: attemptId, question_order: attemptRow.question_order },
    );
  } catch {
    return { ok: false, reason: "paper_unavailable" };
  }

  const [answersRes, orgRes, quizRes, classRes, tplRes] = await Promise.all([
    admin
      .from("exam_answers")
      .select("question_id, answer, points_awarded, marker_note, grading_note")
      .eq("attempt_id", attemptId),
    admin
      .from("organizations")
      .select("name, logo_url")
      .eq("id", exam.organization_id as string)
      .maybeSingle(),
    exam.quiz_id
      ? admin.from("quizzes").select("settings").eq("id", exam.quiz_id as string).maybeSingle()
      : Promise.resolve({ data: null }),
    classId
      ? admin.from("classes").select("name").eq("id", classId).maybeSingle()
      : Promise.resolve({ data: null }),
    templateId
      ? admin
          .from("exam_paper_templates")
          .select("*")
          .eq("id", templateId)
          .eq("organization_id", exam.organization_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (answersRes.error) {
    return { ok: false, reason: "paper_unavailable" };
  }

  // Criterion-level results come from the SAME engine that powers the Results
  // screens, so the PDF cannot disagree with them and inherits applied criterion
  // mark corrections instead of re-deriving marks. It is strictly a read.
  // A failure here must never block the paper: the paper is the evidence, the
  // breakdown is an addition, so fall back to no summary rather than 500.
  let result: Awaited<ReturnType<typeof loadMypResult>> = null;
  try {
    result = await loadMypResult(admin, {
      attemptId,
      organizationIds: [String(exam.organization_id)],
      includeUnpublished: true,
    });
  } catch {
    result = null;
  }

  const data = buildCandidatePaperData({
    attempt: {
      id: attemptId,
      status: String(attemptRow.status),
      started_at: (attemptRow.started_at as string | null) ?? null,
      submitted_at: (attemptRow.submitted_at as string | null) ?? null,
      score: attemptRow.score as number | string | null,
      max_score: attemptRow.max_score as number | string | null,
      attempt_number: (attemptRow.attempt_number as number | null) ?? 1,
      first_name: (attemptRow.first_name as string | null) ?? null,
      last_name: (attemptRow.last_name as string | null) ?? null,
    },
    exam: {
      title: String(exam.title ?? "Examination"),
      instructions: (exam.instructions as string | null) ?? null,
      duration_minutes: (exam.duration_minutes as number | null) ?? null,
      settings: examSettings,
    },
    candidate: {
      full_name: (candidate.full_name as string | null) ?? null,
      first_name: (candidate.first_name as string | null) ?? null,
      last_name: (candidate.last_name as string | null) ?? null,
    },
    organization: (orgRes.data as { name?: string | null; logo_url?: string | null } | null) ?? null,
    quizSettings: ((quizRes.data as { settings?: Record<string, unknown> | null } | null)?.settings ?? null),
    templateRow: tplRes.data ?? null,
    className: (classRes.data as { name?: string | null } | null)?.name ?? null,
    orderedRows,
    result: result
      ? {
          published: result.published,
          criteria: result.criteria.map((criterion) => ({
            code: criterion.code,
            title: criterion.title,
            marksAwarded: criterion.marksAwarded,
            marksMax: criterion.marksMax,
            percent: criterion.percent,
          })),
        }
      : null,
    savedAnswers: (answersRes.data ?? []) as {
      question_id: string;
      answer?: unknown;
      points_awarded?: number | string | null;
      marker_note?: string | null;
      grading_note?: string | null;
    }[],
  });

  return {
    ok: true,
    data,
    organizationId: String(exam.organization_id),
    examId,
    attemptId,
  };
}

/**
 * Helper to summarize an assessDiagram node for plain fallback/text previews.
 */
export function describeAssessDiagram(spec: AssessDiagramSpec): string {
  return assessDiagramSummary(spec);
}

/**
 * Extract plain readable text from any RichNode tree for table cells / inline rendering.
 */
export function richNodeToText(node: RichNode | null | undefined): string {
  if (!node) return "";
  if (node.type === "doc") return docToPlainText(node);
  return docToPlainText({ type: "doc", content: [node] });
}
