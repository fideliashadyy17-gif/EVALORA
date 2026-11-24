/**
 * MYP criteria & strand selection for ONE examination (§ MYP grading
 * configuration).
 *
 * The selection is a SNAPSHOT copied into `exams.settings.myp_grading`:
 * criterion and strand titles/descriptions are stored with it, so later
 * changes to the reference library can never silently alter the grading
 * criteria of an examination that has already been used. Marking screens
 * render the snapshot, never the live library.
 *
 * Pure functions only — server actions call these and tests exercise them
 * directly under Node.
 */

import { MYP_SUBJECT_GROUP_REFERENCE, type MypSubjectGroupReference } from "./mypReference.ts";

export const MYP_EXAM_CONFIG_VERSION = 1;
/** Label of the reference-library revision captured in new snapshots. */
export const MYP_REFERENCE_SNAPSHOT = "mypReference-2026-11";

export interface MypSnapshotStrand {
  code: string;
  title: string;
  description: string;
}

export interface MypSnapshotCriterion {
  code: string;
  title: string;
  description: string;
  /** Explicitly selected strands (empty = criterion assessed as a whole). */
  strands: MypSnapshotStrand[];
  /** Optional weighting between selected criteria (percent share). */
  weight: number | null;
  /** Optional mark allocation for this criterion. */
  marks: number | null;
}

export interface MypExamGradingConfig {
  version: number;
  reference: string;
  saved_at: string;
  subject_group: string;
  subject_group_label: string;
  source: string;
  sourceUrl: string;
  criteria: MypSnapshotCriterion[];
}

/** Minimal FormData surface so tests can pass a plain stub. */
export interface FormLike {
  getAll(key: string): unknown[];
  get(key: string): unknown;
}

export type BuildResult =
  | { ok: true; config: MypExamGradingConfig }
  | { ok: false; error: string };

export function mypReferenceGroup(key: string): MypSubjectGroupReference | null {
  return MYP_SUBJECT_GROUP_REFERENCE.find((group) => group.key === key) ?? null;
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function optionalNumber(value: unknown, min: number, max: number): number | null {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * 1000) / 1000;
}

/**
 * Structural parse of a stored snapshot. Deliberately does NOT validate
 * against the live reference: a historical examination must keep loading even
 * if the reference library has since changed.
 */
export function parseMypExamConfig(value: unknown): MypExamGradingConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== MYP_EXAM_CONFIG_VERSION) return null;
  const group = cleanText(raw.subject_group, 80);
  const label = cleanText(raw.subject_group_label, 120);
  if (!group || !label) return null;
  if (!Array.isArray(raw.criteria) || raw.criteria.length === 0 || raw.criteria.length > 4) return null;

  const criteria: MypSnapshotCriterion[] = [];
  for (const entry of raw.criteria) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const c = entry as Record<string, unknown>;
    const code = cleanText(c.code, 4);
    const title = cleanText(c.title, 200);
    if (!code || !title) return null;
    const strands: MypSnapshotStrand[] = [];
    if (c.strands !== undefined && c.strands !== null) {
      if (!Array.isArray(c.strands)) return null;
      for (const s of c.strands) {
        if (!s || typeof s !== "object" || Array.isArray(s)) return null;
        const strand = s as Record<string, unknown>;
        const strandCode = cleanText(strand.code, 16);
        const strandTitle = cleanText(strand.title, 200);
        if (!strandCode || !strandTitle) return null;
        strands.push({
          code: strandCode,
          title: strandTitle,
          description: cleanText(strand.description, 600),
        });
      }
    }
    criteria.push({
      code,
      title,
      description: cleanText(c.description, 600),
      strands,
      weight: typeof c.weight === "number" && Number.isFinite(c.weight) ? c.weight : null,
      marks: typeof c.marks === "number" && Number.isFinite(c.marks) ? c.marks : null,
    });
  }

  return {
    version: MYP_EXAM_CONFIG_VERSION,
    reference: cleanText(raw.reference, 80) || MYP_REFERENCE_SNAPSHOT,
    saved_at: cleanText(raw.saved_at, 40),
    subject_group: group,
    subject_group_label: label,
    source: cleanText(raw.source, 300),
    sourceUrl: cleanText(raw.sourceUrl, 400),
    criteria,
  };
}

/**
 * Build the snapshot from the configuration form.
 *
 * Reads `myp_criterion` (A–D), `myp_strand` (e.g. "A(i)") and optional
 * `weight_<code>` / `marks_<code>` fields. Only explicitly selected criteria
 * and strands are captured; any combination the framework allows is valid
 * (A alone, A+C, all four with partial strands, …).
 */
export function buildMypExamConfigFromForm(
  form: FormLike,
  groupKey: string,
  savedAt: string = new Date().toISOString(),
): BuildResult {
  const group = mypReferenceGroup(groupKey);
  if (!group) return { ok: false, error: "group" };

  const wantedCriteria = new Set(
    form.getAll("myp_criterion").map((v) => cleanText(v, 4)).filter(Boolean),
  );
  if (wantedCriteria.size === 0) return { ok: false, error: "criteria" };

  const wantedStrands = new Set(
    form.getAll("myp_strand").map((v) => cleanText(v, 16)).filter(Boolean),
  );

  const criteria: MypSnapshotCriterion[] = [];
  for (const referenceCriterion of group.criteria) {
    if (!wantedCriteria.has(referenceCriterion.code)) continue;

    const selectedStrands = referenceCriterion.strands
      .filter((strand) => wantedStrands.has(strand.code))
      .map((strand) => ({
        code: strand.code,
        title: strand.title,
        description: strand.description,
      }));

    // Strands that claim this criterion but are unknown to the reference are
    // rejected outright (never silently dropped from a saved configuration).
    const claimed = [...wantedStrands].filter((code) => code.startsWith(referenceCriterion.code));
    for (const code of claimed) {
      if (!referenceCriterion.strands.some((strand) => strand.code === code)) {
        return { ok: false, error: "strand" };
      }
    }

    criteria.push({
      code: referenceCriterion.code,
      title: referenceCriterion.title,
      description: referenceCriterion.description,
      strands: selectedStrands,
      weight: optionalNumber(form.get(`weight_${referenceCriterion.code}`), 0, 100),
      marks: optionalNumber(form.get(`marks_${referenceCriterion.code}`), 0, 1000),
    });
  }

  // Any strand submitted outside a selected criterion of this group is invalid.
  for (const code of wantedStrands) {
    const owner = group.criteria.find((criterion) =>
      criterion.strands.some((strand) => strand.code === code),
    );
    if (!owner || !wantedCriteria.has(owner.code)) return { ok: false, error: "strand" };
  }

  if (criteria.length === 0) return { ok: false, error: "criteria" };

  return {
    ok: true,
    config: {
      version: MYP_EXAM_CONFIG_VERSION,
      reference: MYP_REFERENCE_SNAPSHOT,
      saved_at: savedAt,
      subject_group: group.key,
      subject_group_label: group.group,
      source: group.source,
      sourceUrl: group.sourceUrl,
      criteria,
    },
  };
}

export function summarizeMypExamConfig(config: MypExamGradingConfig): {
  criteria: number;
  strands: number;
  label: string;
} {
  const strands = config.criteria.reduce((sum, criterion) => sum + criterion.strands.length, 0);
  return {
    criteria: config.criteria.length,
    strands,
    label: `${config.subject_group_label} · ${config.criteria.length} criterion${config.criteria.length === 1 ? "" : "a"} · ${strands} strand${strands === 1 ? "" : "s"}`,
  };
}

export function strandsForCriterion(
  config: MypExamGradingConfig,
  criterionCode: string,
): MypSnapshotStrand[] {
  return config.criteria.find((criterion) => criterion.code === criterionCode)?.strands ?? [];
}

/**
 * Detects whether the LIVE reference library no longer matches the snapshot
 * (titles/codes changed upstream). Display-only: the snapshot always wins for
 * this examination's grading.
 */
export function snapshotDiffersFromReference(config: MypExamGradingConfig): boolean {
  const group = mypReferenceGroup(config.subject_group);
  if (!group) return true;
  for (const saved of config.criteria) {
    const live = group.criteria.find((criterion) => criterion.code === saved.code);
    if (!live) return true;
    if (live.title !== saved.title) return true;
    for (const strand of saved.strands) {
      const liveStrand = live.strands.find((s) => s.code === strand.code);
      if (!liveStrand || liveStrand.title !== strand.title) return true;
    }
  }
  return false;
}
