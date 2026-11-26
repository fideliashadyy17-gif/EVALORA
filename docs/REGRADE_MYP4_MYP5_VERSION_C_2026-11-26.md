# Full Regrade — MYP4 (Grade 9) & MYP5 (Grade 10) Mathematics, Version C

**Date:** 26 November 2026
**Scope:** MYP4 Version C (`cd000000-…-000000000002`) and MYP5 Version C (`ce000000-…-000000000002`) only.
**Status:** Regrade complete and verified in production. **Results remain unpublished. Awaiting owner approval before revalidation and republication.**

---

## 1. Publication state

| Exam | Status | `results_published` | `results_validated` |
|---|---|---|---|
| MYP4 Version C | `closed` | `false` | `false` |
| MYP5 Version C | `closed` | `false` | `false` |

Both exams were live (`results_published = true`, `results_validated = true`) when the regrade started.
Publication was withdrawn **before** any mark was touched, and the previously validated marks were
superseded, so `results_validated` was cleared as well — the publish action requires it to be `true`,
which means **nothing can be republished by accident** before approval.

Every transition is in `audit_logs`:

| Action | Rows |
|---|---|
| `exam.results_unpublished` | 2 |
| `exam.results_unvalidated` | 2 |
| `exam.attempt_regraded` | 3 |

`grades_published_at` / `grades_published_by` were nulled, so the result lifecycle no longer reads as published.

---

## 2. What was checked, and what was found

The review covered **every one of the 2,578 submitted answers** across **107 attempts**
(MYP4: 52 attempts / 1,239 answers · MYP5: 55 attempts / 1,339 answers).

### 2.1 Objective questions — no errors found (1,515 answers)

Every `single_choice` and `true_false` answer was re-derived from `question_options.is_correct` and
compared with the stored mark:

| Exam | Answers | Awarded correctly | Zeroed correctly | Under-paid | Over-paid |
|---|---|---|---|---|---|
| MYP4 | 606 | 329 | 275 | **0** | **0** |
| MYP5 | 909 | 460 | 449 | **0** | **0** |

The previously reported MYP4 Q7 key defect **is not present in production** — the key correctly flags
option **B** (IQR 26, 75%), and 21 candidates were correctly credited. No objective marks needed changing.

### 2.2 Written answers — numeric marking verified sound

All zero-marked written parts were re-evaluated:

- **373 MYP4 / 241 MYP5** parts are numeric. A value scan found **zero** cases where the candidate's
  submitted number matched the key within tolerance yet scored 0.
- Fractions, percentages, thousands separators and surd notation were specifically checked; the
  cases found were genuinely wrong values (e.g. `1/24` against a key of `0.96`, `12+16+20+24+28/5`
  evaluated as 77.6 — an operator-precedence error by the candidate, not by the marker).

### 2.3 Partial credit awarded — 3 answers corrected (MYP5 Q16)

MYP5 Q16(i) asks for **both intersection points** of `L_n = 3n + 3` and `Q_n = n² − n + 6`, i.e.
`(1, 6)` and `(3, 12)`. Three candidates wrote the pairs using the **decimal comma convention** used
in the school's own teaching (Cotonou, francophone):

| Attempt | Answer given | Key | Old | New |
|---|---|---|---|---|
| `0262d38e…` | `1.6` and `3.12` | `(1, 6)` and `(3, 12)` | 0 | **2** |
| `830ae541…` | `1.6` and `3.12` | `(1, 6)` and `(3, 12)` | 0 | **2** |
| `ce7dc5a3…` | `1.6` and `3.12` | `(1, 6)` and `(3, 12)` | 0 | **2** |

Crucially, **the part is out of 3 marks, not 1**: the question's own `marking_breakdown` awards
2 marks for both intersection points and 1 mark for the difference. The auto-grader scored the
coordinates as a single 1-mark part, so full credit here is 2 marks.

Each correction is written to the append-only `grade_change_log` as `regraded`, `0.00 → 2.00`.

**Attempt totals recalculated** (preserved Score Adjustments included, as they are not answer-level):

| Attempt | Old total | Raw answer marks | Preserved adjustment | New total |
|---|---|---|---|---|
| `7ef37823…` | 26.00 | 11 → 13 | +15 | **28.00** |
| `b707e2c5…` | 42.00 | 27 → 29 | +15 | **44.00** |
| `c9b2e2e2…` | 27.00 | 12 → 14 | +15 | **29.00** |

### 2.4 Candidates reviewed and not credited

Every ambiguous answer was read individually. These were examined and deliberately **left at zero**,
because awarding marks would have been wrong, not generous:

| Case | Students | Why the zero stands |
|---|---|---|
| Q24 `out` = `OUI` ("yes" in French) | 1 | The sub-part marks the **decision plus the value** (315 kWh); `OUI` alone gives no value |
| Q16 `i1` = `6` only | 2 | Needs **both** intersection points; one of two is not a pass |
| Q23 `r2` = `Geometric` only | 2 | Wants **type and** `u₅`; half a row does not earn the row |
| Q2 `b1` = `Mean = Σx/n` | 1 | Generic formula; the question requires the specific `(270 + y)/7` |
| Q2 `b2` = "the median is the middle number…" | 1 | Recites a definition; does not answer the invariance question |
| Q15 / Q27 generic algebraic forms | several | Structurally different from the required closed form |
| Blank / whitespace-only parts | 18 | Answered with nothing |

Marks were **not** raised for incorrect mathematics regardless of how plausible the working looked
(e.g. MYP5 Q1 `An = −4n + 32` against a key of `40 − 4n`, and MYP4 Q28 `3√2` against `4√2`).

---

## 3. Score Adjustments preserved

All **eight** existing adjustments are untouched, hidden from candidate papers, and still applied:

| Exam | Criterion | Points | Scope | Students |
|---|---|---|---|---|
| MYP4 | A | +5 | all eligible | 50 |
| MYP4 | B | +4 | all eligible | 50 |
| MYP4 | C | +1 | all eligible | 50 |
| MYP4 | D | +5 | all eligible | 50 |
| MYP5 | A | +3 | all eligible | 55 |
| MYP5 | B | +2 | all eligible | 55 |
| MYP5 | C | +5 | all eligible | 55 |
| MYP5 | D | +5 | all eligible | 55 |

## 4. Original answers preserved

`exam_answers.answer` was **never modified**. Only `points_awarded`, `is_correct`, `grading_note`
and `updated_at` changed on the three corrected rows. `moderation_status` was not touched (it is
guarded by trigger and may only move through a recorded moderation decision).

---

## 5. Candidate paper PDFs

Papers now mark each question explicitly:

- **CORRECT** — green, full award
- **WRONG** — red, zero
- **PARTIAL CREDIT** — amber, part marks

Each question header shows the criterion, the marks available, and the mark awarded, with a
matching coloured spine on the question block. Scores per criterion (A–D) continue to come from the
MYP results engine, so a paper can never disagree with the Results screens.

The paper contains **no** adjustment labels or adjustment detail, and no answer keys, model
explanations, marking schemes, hints or internal identifiers. A regression assertion now fails the
build if the word "adjusted" ever appears in a rendered paper.

Verification: `npx tsc --noEmit` clean · `npm test` **183 suites, 10,147 checks, 0 failed** ·
`node scripts/test-candidate-exam-paper-pdf.mjs` **20/20**.

---

## 6. Rollback

`docs/REGRADE_BASELINE_MYP4_MYP5_2026-11-26.json` is the snapshot taken before the first write
(publication flags, per-answer marks, attempt totals). Combined with the append-only
`grade_change_log` and `regrade_myp_version_c` tables, every change is reversible and attributable.

## 7. Awaiting approval

Nothing else will change until the owner approves. On approval the sequence is:
revalidate → republish → reissue the candidate papers.
