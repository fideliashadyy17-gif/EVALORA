# Mathematics Term 1 summative audit — four papers and the candidate formula sheet

Scope is exactly four existing examinations in production
(`nqxqisjtbfsratgztmch`), by their database titles:

| # | Title | Examination id | Quiz id | Questions | Marks |
|---|---|---|---|---|---|
| 1 | MYP 2 (Grade 7) Mathematics — Term 1 Summative Assessment (Version B) | `c0700000-0000-4000-8000-000000000002` | `…0001` | 45 | 100 |
| 2 | MYP 3 (Grade 8) Mathematics — Term 1 Summative Assessment (Version B) | `c0800000-0000-4000-8000-000000000002` | `…0001` | 45 | 100 |
| 3 | MYP 4 (Grade 9) Mathematics — Term 1 Summative Assessment (Version B) | `c0900000-0000-4000-8000-000000000002` | `…0001` | 45 | 100 |
| 4 | MYP 5 (Grade 10) Mathematics — Summative Assessment: Sequences and Series | `c0a00000-0000-4000-8000-000000000002` | `…0001` | 45 | 100 |

The similarly named formative, mock and Assessment Studio papers were **not**
opened, edited or audited.

## A. Paper audit

### Method

Every one of the 180 questions was read from the applied source modules
(`scripts/exam-import/summative_b_myp{2,3,4,5}.py`), matched to the rows in
production (`questions`, `quiz_questions`, `question_options`) and checked for:

- stem clarity and sufficiency of the data;
- independent recomputation of every keyed answer (110 single-choice/true-false
  items and 4 numeric items);
- key ↔ option match and exactly one correct option;
- mark allocation: 45 questions and 100 marks per paper, criterion totals
  A 32 / B 18 / C 26 / D 24 (MYP 2) and A 32 / B 20 / C 24 / D 24 (MYP 3–5);
- auto-marking reachability: a question that is neither `open_ended` nor backed
  by a usable key would make grading throw and block the whole submission;
- figures: the SVG spec actually shows the data the stem describes (a diagram
  that prints `"shaded"` as a number shades nothing; an empty dot plot is not a
  graph);
- answer leakage: a stem must never print the marking-scheme answer.

### MYP 4 Question 4 (midpoint) — priority diagnostic

Stem as stored: *"Wooden rod lengths, measured to the nearest centimetre, are
grouped into 20–29 cm, 30–39 cm, 40–49 cm. What are the class width and midpoint
of 30–39 cm?"*

Independent calculation: measured to the nearest centimetre, the class has real
limits 29.5 cm and 39.5 cm, so width = 39.5 − 29.5 = **10 cm** and midpoint =
(29.5 + 39.5)/2 = **34.5 cm**. The stored key is option **C — "Width 10 cm, mid
34.5 cm"**, which is correct; the distractors are width 9 (computing 39 − 30) and
mid 35 (rounding).

Verdict: **no defect in the question, key, algorithm or stored result.** The
question is single-choice, so the accepted format is the stored option id; the
scorer compares the chosen id with `question_options.is_correct`. No attempt,
answer or result exists for this examination (see B), so there was nothing to
regrade. The item is nevertheless covered by the statistics formula sheet
(class width and midpoint), which states the general rule without giving this
answer.

### Defects found and corrected

| Paper | Q | Defect | Correction |
|---|---|---|---|
| MYP 2 | 21 | The stem showed an **empty dot plot titled "Option A"** while the options are text descriptions; the chart was not a graph of direct proportion. | Removed the placeholder figure; the question is now purely the description choice. |
| MYP 2 | 23 | The Venn spec stored `rightOnly: "shaded"` and no `shaded` region, so the renderer printed the word *shaded* inside B and shaded nothing — the question was unanswerable from the figure. | Stored the counts as empty, set `shaded: "rightOnly"` and completed the renderer's region paths (right-only, left-only, both, outside, union). |
| MYP 2 | 34 | The proportionality table had duplicated `x` and `y` columns (`x, x, 6, 15, b` / `y, y, a, 20, 36`). | One `x` heading and one `y` heading with the four value columns. |
| MYP 3 | 9 | Stem had no unit while every option was in grams. | Stem now states the two masses in grams, matching the keyed options. |
| MYP 3 | 15 | Stem printed **"(Scheme answer: 2√5.)"** — the answer — and the item was `short_answer` with no accepted options, so any response threw `ScoringError` and blocked submission. Requires a reason, so it cannot be auto-marked. | Answer removed; item is `open_ended` with math/rich-text tools and teacher marking. |
| MYP 3 | 17 | "Evaluate 4⁻¹ + 2⁻²" had the **unevaluated expression itself** as keyed option R. | Stem now asks which answer-bank entry has the value ½; R is that entry. |
| MYP 3 | 19 | `short_answer` with `numeric_answer` but no options → every response threw `ScoringError` (submission failure). | Converted to `numeric` (1.2 × 10¹² = 1 200 000 000 000, tolerance 0); prompt asks for the total number of bytes. |
| MYP 3 | 20 | Same `short_answer`/numeric mismatch (ladder height 6 m). | Converted to `numeric` (6, tolerance 0). |
| MYP 4 | 32 | Part (b) claimed the 7-student **IQR** remains constant for every y ≤ 34. It does not: the 6-student IQR is 6, and with y = 11 it is 8 (Q₁ falls from 36 to 34). The premise was false. | Part (b) now asks for the true invariants, median and **upper quartile** (both 38 and 42 for every y ≤ 34), and a correct explanation is stored. |

MYP 5 had **no content defect**: all 25 objective keys and all 20 structured
stems/data were independently checked and matched.

MYP 2's remaining 39 objective items, MYP 3's remaining 21 objective items and
MYP 4's remaining 24 objective items all reproduced the keyed answer. All 70
constructed-response items retain their printed marks, criteria and guidance.

## B. Student results

- `exam_candidates` for all four examinations: **0**.
- `exam_attempts` for all four examinations: **0** (no in-progress, submitted,
  auto-submitted or graded attempt).
- Therefore there is no stored mark, criterion total, percentage or published
  result for these papers, and **no attempt was regraded**. The production
  `exam_answers` table was not modified.
- Because the MYP 3 mismatch would have thrown on **any** answered response, the
  correction removes a submission-blocking defect before any candidate sits the
  paper.
- The nine corrected questions carry `config.content_revision =
  "summative-b-maths-audit-2026-11-16"` and a human-readable
  `content_revision_note`; the migration is idempotent and touches no attempt or
  answer row. No student answer, mark, moderation record, timer or session was
  changed.

## C. Candidate "Formulas" button

- Content is stored per examination in `exams.settings.formula_sheet`, with an
  explicit `exam_id` inside the sheet. `parseFormulaSheet(value, exam.id)` rejects
  a missing, malformed or foreign sheet, so the shared candidate page cannot
  show MYP 4 formulas to an MYP 3 candidate, and no grade lookup exists in the
  page.
- The button is rendered **only** when the attempt is in progress and the
  examination has a valid sheet. The four sheets are:
  - MYP 2 — ratio/proportion, set notation and inclusion–exclusion, probability;
  - MYP 3 — index laws, standard form, surds, Pythagoras, trigonometric ratios,
    similarity/congruence;
  - MYP 4 — means (including grouped), class width/midpoint, frequency density,
    quartiles/IQR, outlier fences, population σ, cumulative frequency, coding;
  - MYP 5 — arithmetic and geometric terms/sums, quadratic second difference,
    recursive rules, partial sums, sigma notation, growth/decay.
- Every entry has a one-line explanation of its symbols. There are no answers,
  worked solutions, question-specific hints or numeric values from a keyed
  option.
- Interaction: a header button toggles a modal dialog; the close button, Escape
  and a backdrop click close it. Focus moves into the dialog, Tab is trapped,
  and the page, timer, autosave queue, answers and submission flow are untouched.
  Responsive: bottom sheet on phones, centred two-column panel from `sm` upward,
  with an internal scroll area and `max-h-[85vh]`.
- It is not a route, download or printable sheet, and it disappears once the
  attempt is submitted.

## D. Technical delivery

- Migrations (one per paper, independently idempotent, generated by
  `scripts/exam-import/build_summative_b_corrections.py`):
  `20261116150000_summative_b_maths_corrections_myp2.sql`,
  `…150001…_myp3.sql`, `…150002…_myp4.sql`, `…150003…_myp5.sql`.
- Source modules corrected so a reviewed fresh rebuild is consistent; the
  applied migrations `0116`–`0119` are never rewritten (the builder now refuses
  without `--force-applied-rewrite`).
- Code: `src/lib/examFormulas.ts`, `src/app/api/exam/state/route.ts`,
  `src/app/take-exam/[attemptId]/FormulaPanel.tsx`,
  `src/app/take-exam/[attemptId]/TakeExamClient.tsx`,
  `src/components/AssessDiagram.tsx` (Venn region shading).
- Tests: `scripts/test-summative-b-corrections.mjs` (PGlite, 36 checks),
  `scripts/test-exam-formulas.mjs` (55 checks), plus the existing full suite
  (132 suites / 2 301 checks, 8 browser suites skipped without Playwright).
- Applied to production `nqxqisjtbfsratgztmch` on 2026-11-16 as four separate
  migrations (`summative_b_maths_corrections_myp2` … `_myp5`). Verified after
  apply: **9** questions carry the revision tag, **4** examinations carry a
  `settings.formula_sheet` whose embedded `exam_id` matches its own exam; every
  `config.source` marker survived; the corrected question types are
  `single_choice × 5`, `open_ended × 2`, `numeric × 2`; and production still
  holds 138 attempts / 2 737 answers / 2 260 questions, so no attempt, answer or
  mark moved.

## E. Genuine outstanding issues

1. **MYP 3 Q15 is teacher-marked.** The item asks for a reason as well as a
   simplification, so no exact-string key can mark it fairly; it is now
   `open_ended` and is reported as pending until a teacher marks it. It is not
   zeroed.
2. **MYP 3 Q19 and Q20 are numeric.** Equality is exact (tolerance 0), so an
   equivalent value is accepted, but a *presentation* requirement such as
   "standard form" cannot be enforced by a numeric box. Q19's prompt therefore
   asks for the total number of bytes; the standard-form skill remains in the
   written reasoning the teacher can see. No key was changed to make a response
   fit.
3. **No student evidence exists for these four papers.** The audit can prove the
   keys and the marking rules, but not "a real student was marked wrongly",
   because there are no attempts. The production volume check (138 attempts,
   2 737 answers overall) is unchanged by this work.
