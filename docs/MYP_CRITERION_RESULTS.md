# MYP criterion results, overall 1–7 grade and reports

EVALORA records MYP results from the marks already held on a paper: every
question can be tagged with a criterion (`questions.config->>'myp_criterion'`,
letters `A`–`D`), the marks live in `exam_answers.points_awarded`, and the
maximum lives in `questions.points`. This document describes how those marks
become a criterion achievement level and an overall 1–7 grade, where the
surfaces live, and how to configure a school's own criteria and boundaries.

## Principles

1. **One engine.** `src/lib/myp.ts` is the only place that maps marks to levels
   and levels to an overall grade. Pages, PDFs and workbooks never do their own
   arithmetic; they call `loadMypResults` (`src/lib/mypResults.ts`).
2. **Criteria are per subject.** Nothing assumes the Mathematics criteria. A
   subject's criteria and boundaries are rows in `myp_criteria`,
   `myp_level_boundaries` and `myp_grade_boundaries`. A subject with no
   configuration still reports the criterion letters found on its paper, but it
   has no titles, and the report states that the subject is unconfigured.
3. **Missing evidence is never a zero.** A criterion is only levelled when it
   has at least one marked question and (for an assessed result) every one of
   its questions is marked.
   - `pending_marking` — an answer is awaiting a mark.
   - `partially_marked` — some questions marked, some not.
   - `not_assessed` — the criterion has no questions on this paper.
   - `assessed` — fully marked; level `0` is only awarded when the candidate
     genuinely earned no marks (`assessedAtZero`).
   The overall grade is withheld (`incomplete`) unless the organization's
   configuration allows provisional aggregation.
4. **Grades come from boundaries, not from the exam percentage.** Criterion
   levels come from the percentage of the criterion's own marks through the
   configured percentage→level table. The overall grade is the sum of the
   assessed criterion levels through the configured total→grade bands. Two
   papers with the same raw percentage can therefore produce different grades.
5. **History is append-only.** `myp_result_history` stores snapshots
   (`publication`, `moderation`, `regrade`, `snapshot`,
   `configuration_change`). A database trigger rejects `UPDATE` and `DELETE`, so
   a moderated or regraded result can be compared with, but never silently
   replace, the previous one. Configuration edits affect future calculations;
   they never rewrite archived snapshots.
6. **Tenant isolation.** Every surface takes an explicit organization scope, and
   the queries run with the request's Supabase client so RLS also applies. The
   student view reads only the student's own **released** result.

## Where it lives

| Surface | Path | Who |
| --- | --- | --- |
| Individual + collective results, filters, exports | `/dashboard/myp-results` | teachers, org admins, managers |
| One student's criterion report | `/dashboard/myp-results/[attemptId]` | staff with export rights |
| Criteria, levels and grade boundaries | `/dashboard/myp-results/settings` | owner / admin |
| All organizations, per-org completion | `/admin/myp-results` | Super Admin |
| One student across organizations | `/admin/myp-results/[attemptId]` | Super Admin |
| Released result for the signed-in student | `/student/results/[attemptId]` | student (own, released only) |
| Collective PDF / XLSX | `/api/myp/export/pdf`, `/api/myp/export/xlsx` | authorized staff; a learner may export only their own released result |
| Entry points | `/dashboard/reports/exam/[id]`, `/admin/examinations/results`, `/student` | existing report surfaces now link here |

Filters are URL state (`org`, `year`, `class`, `subject`, `exam`, `criterion`,
`status`, `from`, `to`, `q`), and the export links carry the same query string,
so a downloaded report always matches the screen it came from. The MYP year is
resolved from the examination setting, then the class name/code, then
`classes.grade_order` (6–10 → MYP 1–5).

## Reports

* **Individual PDF** — EVALORA header, organization name/logo, student and
  examination details, marks, per-criterion marks/percentage/level/status,
  teacher feedback, strengths and improvement areas, the overall 1–7 grade (or
  the explicit incomplete/provisional/not-applicable status), the boundary
  sources, and a page footer with `Page n of m`. Long feedback spans pages.
* **Collective PDF** — title and scope, average/highest/lowest, completion and
  pending-marking counts, overall grade distribution, criterion averages, and a
  per-student section. Empty scopes produce a valid report that says so.
* **XLSX** — four worksheets with real numeric cells, frozen header rows,
  autofilters and number formats:
  1. *Student Results* — one row per result, with grade status and pending /
     not-assessed criteria named.
  2. *Criterion Breakdown* — one row per criterion per result; blank marks and
     levels for unassessed or pending work, never `0`.
  3. *Class Statistics* — per class/subject/examination averages, criterion
     averages, 1–7 distribution, completion %, pending marking, released count,
     plus an *all results in scope* row.
  4. *Grading Configuration* — the criteria and boundaries actually used, with
     their sources.

## Configuring a school

Open **Dashboard → MYP Results → Settings** (owner/admin only). You can:

* choose the framework label and whether every criterion must be marked before a
  1–7 grade is calculated (`require_all_criteria`; when off, a grade is
  provisional while criteria are outstanding);
* apply the published IB MYP criteria preset for a subject, edit titles and
  descriptions, or add a criterion manually;
* remove a criterion that has no questions on any paper (the screen refuses
  otherwise, so historical papers keep their meaning);
* edit the percentage→level thresholds and the total-levels→grade bands. Saves
  are rejected when levels are not ascending or grade bands overlap, so a stored
  configuration is always valid.

Defaults seeded by the migration:

* percentage→level: `0, 1, 20, 35, 50, 65, 75, 85, 95` for levels 0–8, marked in
  every report as an **EVALORA school-policy default, not an IB-published
  boundary**;
* total levels→grade: the published IB MYP bands (0–5→1 … 28–32→7) for an
  organization default and for each configured subject, so a subject can be
  overridden without losing the organization set.

## Database

`supabase/migrations/20261116120000_myp_criterion_results.sql` is additive and
idempotent. It creates `myp_criteria`, `myp_level_boundaries`,
`myp_grade_boundaries`, `myp_framework_config` and `myp_result_history`, with
guard triggers (canonical criterion codes, subject/organization agreement,
attempt/examination/organization agreement, append-only history, `updated_at`)
and RLS (`is_org_member` read, `can_manage_org` write, `is_super_admin` global).
It seeds a framework row and the organization-default 1–7 bands for every
organization, then the published criteria, level table and subject bands for
subjects it can recognise by name or code. It never modifies or deletes existing
examinations, attempts, answers or marks.

## Tests

| Suite | Covers |
| --- | --- |
| `scripts/test-myp-grading-engine.mjs` | year resolution, configured criteria, boundaries, pending vs zero, provisional vs final, analytics |
| `scripts/test-myp-results-loader.mjs` | tenant isolation, student-only released reads, per-subject precedence, filters, degradation before migration |
| `scripts/test-myp-reports.mjs` | PDF page tree and extracted text, long reports, encoding, four-sheet workbook opened and unzipped |
| `scripts/test-myp-migration.mjs` | migration applied twice to PGlite, seeds, guards, append-only history, RLS for member/manager/teacher/other tenant/Super Admin |
| `scripts/test-myp-export-controls.mjs` | every surface, navigation link and download control, and that no page duplicates the grading arithmetic |

Run them with `node scripts/test-myp-grading-engine.mjs` (etc.) or the whole
suite with `npm test`.
