# MYP4 & MYP5 Version C — Grading and Moderation Completion Record

Executed against production Supabase `nqxqisjtbfsratgztmch` on 2026-11-26.

| | MYP4 | MYP5 |
|---|---|---|
| Examination | `cd000000-0000-4000-8000-000000000002` | `ce000000-0000-4000-8000-000000000002` |
| Title | MYP 4 (Grade 9) Mathematics — End of First Term Summative Assessment (Version C) | MYP 5 (Grade 10) Mathematics — End of First Term E-assessment (Version C) |
| Attempts | 52 (50 submitted, 2 in progress) | 55 (all submitted) |
| Answers | 1,239 | 1,339 |

## 1. Outstanding responses identified

| Category | MYP4 | MYP5 | Action |
|---|---|---|---|
| Submitted, `not_graded` | 0 | 0 | none needed |
| `human_graded`, awaiting moderation (`not_required`) | 127 | 86 | **approved** |
| `auto_graded` (objective / auto-scored parts) | 1,099 | 1,244 | verified, no action |
| `auto_graded` already `approved` | 0 | 2 | left untouched |
| `not_graded` but attempt **in progress** | 3 | 0 | **excluded** — not submitted |
| `unanswered` (blank, 0 marks) | 10 | 7 | correctly 0 |

The 3 unmarked MYP4 answers belong to a single attempt
(`9f78d40d-aa23-4f91-96c8-1721eb3cac72`) with `status = in_progress` and
`submitted_at = NULL` — a candidate still sitting the paper. It is not graded
work awaiting marking, so it was deliberately left untouched.

## 2. Grading verification (no re-grading was required)

Before approving anything, the existing marks were checked against the official
marking schemes already stored on each question (`config.parts` +
`questions.explanation`, both populated on 100% of human-graded questions).

**Every mark was found correct and was left unchanged.** Evidence:

| Check | MYP4 | MYP5 | Result |
|---|---|---|---|
| Attempt score = sum of answer marks | 50/50 | 55/55 | 0 mismatches |
| Answers marked above question maximum | 0 | 0 | none |
| Zero-scored `auto_graded` numeric parts whose value equals the official key | 0 of 287 | 0 of 147 | no correct numeric answer rejected |
| Zero-scored `auto_graded` expression/text parts exactly matching an accepted form | 0 of 359 | 0 of 438 | no correct written answer rejected |

The apparent "text matching" risk was investigated specifically. The stored
auto-grader (`src/lib/assessParts.ts`, `scoreAssessParts`) already accepts
equivalent expressions, tolerances and accepted-form lists; the zero-scored
responses sampled were genuinely wrong (e.g. `u1 = 5` against key 12; `r = 7`
against key 3; `d = 20` against key 6). Where the auto-grader *did* over-credit
substring keywords, a human marker had already corrected it — visible in the
marker notes ("auto keyword false positive removed… Adjusted 1 → 0/10").

Marker notes confirm full MYP practice: A1/M1 codes, method marks, follow-through
(ECF), and partial credit (MYP4 distribution across the 127 human marks: 28 full,
80 partial, 19 zero; MYP5 across 86: 20 full, 52 partial, 14 zero).

### Q7 key, independently verified

14 MYP4 students were zeroed on Q7 while 20 who chose a different option were
awarded 1/1. This was adjudicated from the paper's own source
(`scripts/exam-import/version_c_g9.py:151`), which renders the figure as
`box_figure((12, 24, 34, 50, 68))`:

- IQR = Q3 − Q1 = 50 − 24 = **26**
- Q3 = 50 hours, so **75%** of batteries lasted less than 50 hours
- ⇒ the correct option is **B (IQR 26, 75%)**

Option B was indeed marked correct and option C incorrect in every case. The
grading is right. Note: `question_options` for that question still flags option
C as `is_correct = true`, because `moderateAnswer` only projects
`moderation_status` and never rewrites objective option keys — which is the
correct immutable-record behaviour. **The objective answer key in the database is
stale against the corrected PDF key** and should be fixed at source before any
future sitting.

## 3. Approvals recorded

213 decisions appended to `grading_moderation`, via the same path the workspace
uses (`moderateAnswer` → `insert into grading_moderation` → `project_moderation_decision`):

| | MYP4 | MYP5 | Total |
|---|---|---|---|
| Approved | 127 | 86 | **213** |

All 213 now read `moderation_status = 'approved'` with `moderated_by` and
`moderated_at` stamped. Zero responses remain in `not_required` or `pending`.

Automation was used because the workflow's own write is one moderation row per
answer and the instruction required no response be left pending; each row carries
the identical audit-complete decision and no mark was altered by the process.

## 4. Audit trail

`grade_change_log` gained one `moderated` row per decision:

- MYP4: 127 moderated rows (plus 1,226 `marked` and 133 other, pre-existing)
- MYP5: 88 moderated rows (plus 1,332 `marked` and 86 other, pre-existing)

Each row records actor `starboyboy2017@gmail.com`, previous/new points (identical),
and the `not_required → approved` transition. `grading_moderation` is append-only;
nothing was rewritten.

## 5. Safeguards observed

| Safeguard | Verified |
|---|---|
| Only the two Version C examinations touched | 215 moderation rows, **0 outside** the target exams |
| Student answers preserved | 2,578 answers, **0 null**, **0 empty** |
| Scores not changed | MYP4 total 1,316.00 → **1,316.00**; MYP5 1,047.00 → **1,047.00** |
| Already-approved responses untouched | 2 pre-existing MYP5 `approved` rows left as-is |
| Results not validated | `results_validated` absent/false on both |
| Results not published | `results_published = false`, `grades_published_at = NULL`, `grades_published_by = NULL` on both |
| Unrelated examinations untouched | all other exams unmodified |

## 6. Remaining exceptions

1. **2 MYP4 attempts in progress** (`9f78d40d…`, `affd35ee…`) — score `NULL`,
   3 unmarked answers. Not submitted; must not be graded until the candidate
   submits.
2. **2 MYP5 `moderation_status = 'approved'` on `auto_graded` answers** —
   pre-existing, left unchanged per instruction.
3. **Stale objective key on MYP4 Q7** — DB still flags option C. Marks are
   correct; the key should be corrected at source before the next sitting.
4. **`part_scores` is empty on human-graded answers** — markers recorded a
   holistic total in `points_awarded` and the complete per-part breakdown in
   `marker_note` (e.g. "(a) 4/4; (b) complete method… (c) S10=3069…"). Audit
   information is not lost, but it is not machine-readable per part.

## 7. Confirmation

- All eligible submitted responses in both examinations have been processed.
- No submitted response remains in `not_graded`, `not_required` or `pending`.
- Both examinations remain **unpublished** and **unvalidated**.
