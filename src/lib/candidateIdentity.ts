/**
 * Canonical candidate identity for examination admission.
 *
 * Two people who type the same name with different casing, extra spaces,
 * non-breaking spaces or full-width characters are the SAME printed identity
 * for duplicate-participation purposes. NFKC folds compatibility characters,
 * lower-casing removes case differences and whitespace collapsing removes
 * accidental (and paste-in) spacing differences. Accents are deliberately
 * preserved: "Zoé" and "Zoe" can be two different students.
 *
 * This module is pure and shared by the admission route, the database guard's
 * TypeScript mirror and the tests. The SQL trigger uses the same lower +
 * whitespace-collapse rule.
 */

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

/** Canonical full printed name. Never empty for a valid first + last name. */
export function canonicalCandidateName(value: unknown): string {
  return text(value)
    .normalize("NFKC")
    .replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Canonical identity from the separately captured first and last names. */
export function canonicalCandidateNameFromParts(first: unknown, last: unknown): string {
  return canonicalCandidateName(`${text(first)} ${text(last)}`);
}

/**
 * The name used for duplicate detection. Prefer the separated first/last
 * fields when both exist (that is what the admission form validates), and fall
 * back to the stored full name.
 */
export function candidateIdentityName(
  row: { first_name?: unknown; last_name?: unknown; full_name?: unknown },
  fallback?: { first_name?: unknown; last_name?: unknown },
): string {
  const parts = canonicalCandidateNameFromParts(
    row.first_name ?? fallback?.first_name,
    row.last_name ?? fallback?.last_name,
  );
  return parts || canonicalCandidateName(row.full_name);
}

export function candidateNamesMatch(
  a: { first_name?: unknown; last_name?: unknown; full_name?: unknown },
  b: { first_name?: unknown; last_name?: unknown; full_name?: unknown },
): boolean {
  const left = candidateIdentityName(a);
  const right = candidateIdentityName(b);
  return Boolean(left) && left === right;
}

/**
 * Candidate-facing refusal. Deliberately does not echo any personal data and
 * gives a legitimate route back to the original attempt.
 */
export const DUPLICATE_EXAM_CANDIDATE_MESSAGE =
  "This candidate name has already been used for this examination, so a second participation is not permitted. If this is you, reopen the examination on the device where you started, or sign in with your personal candidate code to resume your existing attempt. Your original answers and timer have not been changed.";
