# Controlled Examination Score Adjustment (Institution plan)

A governed, audited way to raise verified examination scores — by MYP criterion,
by paper section, or across the whole paper — **before** results are validated or
published. It is exclusive to organizations on the active **Institution** plan and
is deliberately invisible to candidates: students, parents and the candidate
result page never see a bonus, an adjustment or a label. They simply see the final
score and, for MYP papers, the final criterion levels.

## 1. Where it lives

| Console | Route | Who |
|---|---|---|
| Workspace (studio) | `/dashboard/score-adjustments` — `?exam=<id>` picks the paper | org owner/admin/teacher/corrector with `grading.edit` |
| Workspace (deep link) | `/dashboard/exams/[id]/adjustments` | same — delegates to the studio above |
| Super Admin | `/admin/examinations/score-adjustments` | platform Super Admin, any organization |

`/dashboard/score-adjustments` is the **single** workspace implementation: the
per-exam route is a ~20-line delegate that deep-links it, so there is one
authorization path, one set of numbers and no parallel grading system.

Entry points, all resolving to that one studio:

1. **Workspace sidebar** — `Dashboard → Score Adjustment` (`SlidersHorizontal`
   icon), visible to `operational` roles when the real entitlement is Institution
   **and** the `exam_results` module is enabled. This is the primary discovery path.
2. **Super Admin console** — `F. Examinations → Score Adjustment (Institution)`,
   labelled in en/fr/es and reachable from the shell's runtime search.
3. Per-examination **Adjustment** button on `/dashboard/exams/[id]`.
4. Grade ledger `/dashboard/exams/[id]/grades` and Results Management
   `/dashboard/results`.

Every workspace surface is gated on the organization's **real** entitlement
(`getEntitlement`, never an owner bypass) **and** on role permissions:
`grading.view` / `results.view` to open, `grading.edit` to apply. A viewer without
`grading.edit` (for example `school_founder`, which is supervision-only) sees the
panel read-only. The page also calls `requireModule(entitlement, "exam_results")`,
so disabling Results Management in Plan & Module Management hides the nav entry
*and* blocks the direct URL.

### Visibility regression guard

`scripts/test-score-adjustment.mjs` runs the real `isNavVisible` rule and asserts
that `owner`, `admin`, `teacher`, `corrector`, `organizer` and `supervisor` all see
the sidebar entry on an Institution plan, while `student`, `candidate`, `parent`
and `participant` never do — and that no role sees it on a non-Institution plan or
with `exam_results` disabled.

## 2. The rules the database enforces

`supabase/migrations/20261125230000_score_adjustments.sql` (applied live) adds two
append-only tables and one atomic RPC. Everything below is enforced in
PostgreSQL, not only in the UI:

- **Institution plan exclusivity** — the target organization must hold an active
  or trialing subscription whose plan is `institution` (or whose limits carry
  `institutional = true`) and whose period/trial has not expired. A Premium or
  Free organization is refused with `plan_ineligible`.
- **Pre-validation lock** — the examination must not be deleted, archived,
  validated (`settings.results_validated`) or published
  (`settings.results_published` / `grades_published_at`). The exam row is taken
  `for update`, so a publication that lands mid-flight cannot be overtaken.
- **Authorization** — a Super Admin console call requires an active
  `platform_role = 'super_admin'`; a workspace call requires an active,
  non-learner member of the target organization holding `grading.edit`. Learners,
  candidates, parents and `school_founder` are refused.
- **Eligibility** — only `submitted`, `auto_submitted` or `marked` attempts with a
  graded score and no pending manual marking.
- **No double counting** — `unique (attempt_id, category_type, category_key)`
  blocks a second adjustment of the same criterion/section/overall for a student,
  and `unique (exam_id, idempotency_key)` makes a repeated submission a no-op
  rather than a second award.
- **Caps** — `adjusted_category_score <= category_max_score`,
  `adjusted_exam_score <= exam_max_score`, and `points_applied <= points_requested`.
  Unreachable points are reported as capped rather than silently dropped.
- **Optimistic concurrency** — `original_exam_score` must still equal the stored
  score, so an adjustment computed against a stale preview is rejected
  (`score_changed_since_preview`) instead of overwriting newer marking.
- **Immutability** — triggers refuse every `UPDATE` and every `DELETE` (parent
  cascades from a deleted examination excepted). Corrections are new adjustments,
  never edits.
- **Nothing else changes** — the RPC writes the audit header, the per-student
  ledger, the `exam_attempts.score`, and one `audit_logs` row in the same
  transaction. `exam_answers`, validation and publication flags are untouched.

RLS is staff-only through `can_read_exam_score_adjustments(org_id)`: anonymous
callers, learners and non-members read **zero** rows; `authenticated` holds
`SELECT` only, so a client cannot write the ledger directly even with a valid JWT.

## 3. Score propagation

An applied adjustment is not a separate "bonus" channel — it becomes part of the
score every surface already reads:

- `exam_attempts.score` is updated atomically by the RPC.
- Every recompute path in `src/app/dashboard/exams/actions.ts` and
  `src/app/admin/examinations/actions.ts` (marking, regrading, overrides, single
  question regrade, Super Admin regrade) goes through
  `computeAttemptScoreWithAdjustments`, so later grading preserves the award
  instead of erasing it.
- MYP results (`src/lib/myp.ts`, `src/lib/mypResults.ts`) fold
  `exam_score_adjustment_items` into the assessed criteria and totals, which
  means the individual/collective PDF & Excel exports and the candidate result
  page (`/exam/result/[token]`) show the raised level with no mention of an
  adjustment.
- Student surfaces (`/student`, `/student/results/[attemptId]`, candidate paper
  PDF, `/api/exam/state`) contain no adjustment or bonus vocabulary at all.

## 4. Verification

- `scripts/test-score-adjustment.mjs` — 9 checks covering the pure engine
  (category extraction, capping, duplicates, plan and lifecycle gating, preview),
  a real PGlite run of the migration (constraints, immutability triggers,
  atomicity, RLS, plan refusal, lifecycle refusal, duplicate and cap refusal),
  the recompute-preservation wiring, and static assertions that no student surface
  can disclose an adjustment.
- Live verification against the production database (inside rolled-back
  transactions, no examination data mutated): the RPC raised a `1 → 2` score,
  wrote exactly one ledger row and one audit row, left all 6,275 `exam_answers`
  and the `false/false/false` validation/publication/archive flags untouched;
  `UPDATE`/`DELETE` on both tables were refused; a duplicate adjustment, a Premium
  organization and a non-enrolled actor were all refused; anonymous and learner
  identities read zero rows while Oak staff and the Super Admin read them.

## 5. Not claimed

- Adjustments are additive only. There is no negative adjustment, no
  per-question award, and no way to edit or revoke an applied adjustment — a
  mistake requires a deliberate follow-up migration, which is the point of an
  audit ledger.
- The feature does not change validation or publication. Once results are
  validated or published, the RPC refuses new adjustments.
- Score adjustments do not exist for live quizzes, which have no `exam_attempts`
  row.
