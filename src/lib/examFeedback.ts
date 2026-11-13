/**
 * Question-level pedagogical feedback and the personalised result summary.
 *
 * Two rules govern everything here:
 *
 *  1. Nothing is revealed before the existing release conditions are met. These
 *     functions are pure and are only called with a published result; the gate
 *     lives in `/api/exam/state` (`submitted && resultsPublished`) and is not
 *     re-implemented or relaxed here.
 *  2. The summary describes evidence, not flattery. A score above the pass mark
 *     does not assert mastery of a topic the candidate lost marks on, and a
 *     score below it never humiliates — it names the topics to revise.
 */
export const DEFAULT_PASS_PERCENT = 50;

export interface FeedbackInput {
  /** Topic as authored on the question. */
  topic?: string | null;
  /** MYP criterion letter, when the paper is criterion-mapped. */
  criterion?: string | null;
  /** Stored marking scheme (teacher-facing text, shown after release). */
  markingCriteria?: string | null;
  /** Stored "what to do next time" line. */
  nextTimeHint?: string | null;
  /** The published explanation / worked solution. */
  explanation?: string | null;
}

export interface QuestionFeedback {
  /** What the question was assessing. */
  assessed: string | null;
  /** The marking scheme, when the paper published one. */
  scheme: string | null;
  /** How to approach the same idea next time. */
  improve: string | null;
  /** True when at least one field has content. */
  any: boolean;
}

const clean = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

/**
 * Assemble the four-part feedback block for a released question. Fields the
 * paper did not author are omitted rather than filled with generic advice —
 * "revise the topic" is not feedback.
 */
export function questionFeedback(input: FeedbackInput): QuestionFeedback {
  const assessedParts: string[] = [];
  const topic = clean(input.topic);
  if (topic) assessedParts.push(topic);
  if (clean(input.criterion)) assessedParts.push(`MYP Criterion ${input.criterion}`);
  const assessed = assessedParts.length ? assessedParts.join(" · ") : null;
  const scheme = clean(input.markingCriteria);
  const improve = clean(input.nextTimeHint);
  return { assessed, scheme, improve, any: Boolean(assessed || scheme || improve) };
}

export interface TopicScore {
  topic: string;
  awarded: number;
  max: number;
  percent: number;
  band: "Strong" | "Developing" | "Needs work";
}

export interface CriterionScore {
  criterion: string;
  awarded: number;
  max: number;
  percent: number;
  band: "Strong" | "Developing" | "Needs work";
  /** Indicative MYP level band, only for criterion-mapped papers. */
  level: string | null;
}

export interface ResultSummary {
  awarded: number;
  max: number;
  percent: number;
  passPercent: number;
  passed: boolean;
  /** Objective (auto-marked) questions. */
  objective: { awarded: number; max: number; percent: number; count: number };
  /** Structured / constructed-response questions (auto or manual). */
  structured: { awarded: number; max: number; percent: number; count: number };
  topics: TopicScore[];
  criteria: CriterionScore[];
  strongTopics: string[];
  weakTopics: string[];
  /** True when some structured answers still await a human mark. */
  pendingManual: boolean;
  /** Number of questions whose result is not final. */
  pendingCount: number;
  message: string;
}

/**
 * Only what the summary needs. Keeping this structural (rather than importing
 * the full published result) means the summary works identically for the
 * candidate screen, a teacher report and a print export without dragging the
 * rendered-explanation payload through every caller.
 */
export interface ResultQuestion {
  type: string;
  topic?: string | null;
  criterion?: string | null;
  points: number;
  result: { points_awarded?: number | null; is_correct?: boolean | null } | null;
}

const OBJECTIVE_TYPES = new Set([
  "single_choice", "multiple_choice", "multiple_select", "true_false", "numeric",
  "short_answer", "ordering", "matching", "poll",
]);

/** Question types whose mark is decided by a human, not by the scorer. */
export const isManualType = (type: string) => type === "open_ended";

function band(percent: number): "Strong" | "Developing" | "Needs work" {
  return percent >= 70 ? "Strong" : percent >= 40 ? "Developing" : "Needs work";
}

function levelBand(percent: number): string {
  return percent >= 85 ? "7–8" : percent >= 65 ? "5–6" : percent >= 40 ? "3–4" : "1–2";
}

function pct(awarded: number, max: number): number {
  return max > 0 ? Math.round((awarded / max) * 1000) / 10 : 0;
}

/**
 * Build the complete result summary from the questions the candidate received.
 * Unanswered questions count as zero (they are part of the paper), and an
 * unmarked structured answer is excluded from the totals but reported as
 * pending so a provisional percentage is never presented as final.
 */
export function resultSummary(questions: ResultQuestion[], passPercent = DEFAULT_PASS_PERCENT): ResultSummary {
  let awarded = 0;
  let max = 0;
  let pendingCount = 0;
  const objective = { awarded: 0, max: 0, count: 0 };
  const structured = { awarded: 0, max: 0, count: 0 };
  const topicMap = new Map<string, { awarded: number; max: number }>();
  const criterionMap = new Map<string, { awarded: number; max: number }>();

  for (const question of questions) {
    const points = Number(question.points) || 0;
    const result = question.result;
    const isObjective = OBJECTIVE_TYPES.has(question.type);
    const manualPending = isManualType(question.type) && (!result || result.points_awarded === null);
    if (manualPending) { pendingCount += 1; continue; }

    const got = Math.max(0, Math.min(points, Number(result?.points_awarded ?? 0)));
    awarded += got;
    max += points;

    const bucket = isObjective ? objective : structured;
    bucket.awarded += got;
    bucket.max += points;
    bucket.count += 1;

    const topic = (question.topic ?? "General").trim() || "General";
    const t = topicMap.get(topic) ?? { awarded: 0, max: 0 };
    t.awarded += got; t.max += points; topicMap.set(topic, t);

    if (question.criterion) {
      const key = String(question.criterion).toUpperCase();
      const c = criterionMap.get(key) ?? { awarded: 0, max: 0 };
      c.awarded += got; c.max += points; criterionMap.set(key, c);
    }
  }

  const topics: TopicScore[] = [...topicMap.entries()]
    .map(([topic, value]) => ({ topic, awarded: round(value.awarded), max: round(value.max), percent: pct(value.awarded, value.max), band: band(pct(value.awarded, value.max)) }))
    .sort((a, b) => b.max - a.max || a.topic.localeCompare(b.topic));

  const criteria: CriterionScore[] = [...criterionMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([criterion, value]) => {
      const percentage = pct(value.awarded, value.max);
      return {
        criterion,
        awarded: round(value.awarded),
        max: round(value.max),
        percent: percentage,
        band: band(percentage),
        level: levelBand(percentage),
      };
    });

  const percent = pct(awarded, max);
  const passed = percent >= passPercent;
  const strongTopics = topics.filter((topic) => topic.band === "Strong").map((topic) => topic.topic);
  const weakTopics = topics.filter((topic) => topic.band === "Needs work").map((topic) => topic.topic);

  return {
    awarded: round(awarded),
    max: round(max),
    percent,
    passPercent,
    passed,
    objective: { awarded: round(objective.awarded), max: round(objective.max), percent: pct(objective.awarded, objective.max), count: objective.count },
    structured: { awarded: round(structured.awarded), max: round(structured.max), percent: pct(structured.awarded, structured.max), count: structured.count },
    topics,
    criteria,
    strongTopics,
    weakTopics,
    pendingManual: pendingCount > 0,
    pendingCount,
    message: passed
      ? passMessage({ percent, passPercent, strongTopics, weakTopics, criteria, pendingCount })
      : belowPassMessage({ percent, passPercent, strongTopics, weakTopics, topics, pendingCount }),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function list(names: string[], limit = 3): string {
  const shown = names.slice(0, limit);
  if (!shown.length) return "";
  if (shown.length === 1) return shown[0];
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

export interface MessageInput {
  percent: number;
  passPercent: number;
  strongTopics: string[];
  weakTopics: string[];
  topics?: TopicScore[];
  /** Criterion bands (MYP criterion letters) when the paper is criterion-mapped. */
  criteria?: CriterionScore[];
  pendingCount: number;
}

/**
 * Formal result message for a candidate at or above the pass mark — the
 * wording of a recorded e-assessment result, not of a celebration postcard.
 * It never claims mastery the evidence does not support: any topic below
 * "Strong" is named as still to strengthen, the criterion bands are reported
 * plainly, and a pending manual mark is disclosed.
 */
function criterionNarrative(criteria: CriterionScore[]): string {
  const word = (letters: string[]) =>
    letters.length === 1 ? `Criterion ${letters[0]}` : `Criteria ${list(letters, 4)}`;
  const strong = criteria.filter((entry) => entry.band === "Strong").map((entry) => entry.criterion);
  const developing = criteria.filter((entry) => entry.band === "Developing").map((entry) => entry.criterion);
  const weak = criteria.filter((entry) => entry.band === "Needs work").map((entry) => entry.criterion);
  if (weak.length && strong.length)
    return ` Reported bands: ${word(strong)} ${strong.length === 1 ? "is" : "are"} Strong; ${word(weak)} still not secure — read the examiner's feedback for ${weak.length === 1 ? "that criterion" : "those criteria"} before relying on this result.`;
  if (weak.length)
    return ` Note, however, that ${word(weak)} ${weak.length === 1 ? "is" : "are"} not yet secure despite the pass mark; read the feedback for ${weak.length === 1 ? "that criterion" : "those criteria"}.`;
  if (strong.length)
    return ` No criterion is in the lowest band; ${word(strong)} ${strong.length === 1 ? "is" : "are"} reported Strong${developing.length ? `, with the remainder at Developing (${developing.join(", ")})` : ""}.`;
  return " All criteria are at Developing level; consistent timed practice is what moves them into Strong.";
}

export function passMessage(input: MessageInput): string {
  const base = `Formal result — MYP e-assessment: you have met the pass requirement, with ${input.percent}% against a pass mark of ${input.passPercent}%. This records that, on this occasion, your work satisfied the standard for this paper. The result is reported alongside the criterion bands, the marking scheme and the question-level feedback below.`;
  const criteriaLine = input.criteria?.length ? criterionNarrative(input.criteria) : "";
  const strengthen = input.weakTopics.length
    ? ` This is not a certification of mastery in every topic: ${list(input.weakTopics)} still ${input.weakTopics.length === 1 ? "needs" : "need"} work. Revise those areas before your next formal assessment.`
    : input.topics?.some((topic) => topic.band === "Developing")
      ? ` The pass mark is a floor, not a ceiling — keep strengthening the topics marked “Developing”.`
      : " Sustain this standard under timed, exam-room conditions.";
  const pending = input.pendingCount
    ? ` ${input.pendingCount} structured answer${input.pendingCount === 1 ? " is" : "s are"} still awaiting your examiner's mark, so this percentage may change.`
    : "";
  return `${base}${criteriaLine}${strengthen}${pending}`;
}

/**
 * Constructive message for a candidate below the pass mark. It names the
 * topics to revise and points at the method rather than at the candidate.
 */
export function belowPassMessage(input: MessageInput): string {
  const focus = input.weakTopics.length
    ? input.weakTopics
    : (input.topics ?? []).filter((topic) => topic.band === "Developing").map((topic) => topic.topic);
  const target = focus.length ? ` Start with ${list(focus)}: those are the topics where you lost the most marks.` : "";
  const pending = input.pendingCount
    ? ` ${input.pendingCount} structured answer${input.pendingCount === 1 ? " is" : "s are"} still awaiting marking, so this percentage may rise.`
    : "";
  return `You have not yet met the pass requirement (${input.percent}% against a pass mark of ${input.passPercent}%), but this is an opportunity to improve before your next formal assessment.${target} Review the feedback underneath each question, study the marking scheme carefully and practise similar problems. Focus on understanding the mathematical methods rather than memorising answers: the worked solutions show the reasoning a marker is looking for. With consistent practice, you can improve your performance.${pending} Keep working hard!`;
}
