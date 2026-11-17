# Examination quality audit — 17 November 2026

Scope: the live MYP 4 (Grade 9) and MYP 5 (Grade 10) Term 1 summative papers
(`cb…0002`, `cc…0002`), their Version B siblings, the Grade 1 drawing papers,
and every submitted attempt in the database. The audit covered question
content, marking keys, response workspaces, formula sheets, automatic scoring,
manual/rubric marking, moderation and the grade-change audit trail.

## A. Paper and key integrity

* **MYP 2 Version B, Q27–Q30 (bar-chart answer bank).** The chart data are
  Red 8, Yellow 5, Green 4 and Blue 3 (20 marbles). The answer bank is
  `P = 0`, `Q = 0.2`, `R = 40 %`, `S = 0.75`, `T = 0.25`, `U = 1`; the keys
  are P(red) = R, P(not yellow) = S, P(green) = Q and P(purple) = P.
  All four keys are mathematically correct. P(purple) is a deliberate zero
  because purple is absent from the chart; the legend does not name purple.
  This is retained as a reasoning item and flagged for teacher awareness.
* **MYP 3 Version B, Q16–Q18 (answer bank).** The bank contains
  `P = 7/9`, `Q = √1.44`, `R = 4⁻¹ + 2⁻²`, `S = 7/10`, `T = (l_L + l_U)/2`,
  `U = 1 − 3`. Each target value is present exactly once; keys P, R and Q are
  correct.
* **Objective keys.** Every `single_choice`/`true_false` question has exactly
  one correct option; `assess_parts` part totals equal the question mark;
  numeric keys and tolerances parse. The earlier "wrong totals" suspicion was
  tested against both MYP 4 FA2 attempts: stored score equalled the sum of
  answer points (37.0 and 47.0), so no reconciliation defect existed.
* **Matching duplicate labels.** A query for `matching` questions in the live
  MYP 4/MYP 5 summative papers returned zero rows. The previously suspected
  duplicate right-hand labels are not present in these papers. The "position
  101" concern is also inapplicable: the MYP 5 live paper has 35 questions.

## B. Response workspaces

Fourteen `open_ended` stems ask for a construction, table or plot while
omitting the corresponding structured tool. Each was reviewed; five needed a
change:

| Paper | Position | Stem asks for | Before | Now |
| --- | --- | --- | --- | --- |
| Grade 1 Mathematics | 27 | Draw a circle | prose only | geometry required |
| Grade 1 Science | 23 | Draw a plant | prose only | geometry required |
| Grade 1 Social Science | 22 | Draw a flower | prose only | geometry required |
| MYP 4 live | 37 | Construct a grouped table | rich-text table | structured data table required |
| MYP 4 live | 38 | Draw a frequency-density histogram | graph/rich text | statistics workspace, fixed to histogram |

The remaining stems already had the right tool (e.g. MYP 4 Q36 stem-and-leaf,
MYP 4 Q28 table, MYP 5 Q23 table) or used "plot" descriptively, not as a
candidate instruction (MYP 4 Q45 "16 plots", MYP 5 Q14 "are plotted
together"). The Grade 1 matching item has no matching input in `open_ended`;
it remains prose and is recorded as a residual limitation.

Every changed question satisfies the publication rule that a required tool is
enabled. No prompt, mark or answer key was edited.

## C. Formula sheets

The live MYP 4 and MYP 5 papers had no formula sheet. Each now carries the
validated sheet from its Version B sibling, with `exam_id` retargeted to the
live paper:

* MYP 4: averages, grouped data (midpoint, class width, frequency density),
  median/quartiles/spread, cumulative frequency and coding (including
  `σ_y = |a| σ_x`).
* MYP 5: arithmetic sequences/series, geometric sequences/series, quadratic
  sequences, recursive rules and partial sums.

`parseFormulaSheet` accepts the copied sheets (4 groups, all items within the
8 × 12 limits), and the sheets contain no keyed answer values. The formula
button therefore appears only on papers that actually have a sheet.

## D. Grading engine

The engine rejected correct answers that differed only in presentation. The
following are now accepted:

* currency prefixes (`$13.5`, `€4`) and trailing units;
* decimal commas (`8,75`) while keeping thousands separators (`1,250`);
* a label or working line before the value (`mean = 21`,
  `18 + 6 = 24`, `M25 = 4(25) + 1 = 101`);
* superscript powers (`n²`, `n⁻¹`) in algebraic answers;
* multi-letter left-hand sides (`Mn = 4n + 1`, `tn = n²`);
* listed equivalents (`1/2, 0.5, 4/8, 50%`);
* percentage/decimal equivalence (`50% = 0.5`) in written answers;
* one typo in a word answer (`solvant` → `solvent`,
  `quantitative discrite` → `quantitative discrete`);
* numeric fractions and simple arithmetic working in numeric parts.

The numeric evaluator supports `+ - * / ^` and brackets and never uses
`eval`. A range such as `20-30` is not mistaken for `-10`.

### Submission resilience

A stale saved option, a malformed marking key or an unsupported payload used
to abort the whole submission with `grading_failed`. `gradeAttempt` now catches
only `ScoringError` for that answer, stores `is_correct = null` and
`points_awarded = null` (pending human marking), and continues grading the
rest of the paper. Genuine database or paper failures still fail closed.

### Duplicate recomputation removed

`markAnswer` contained a second copy of the attempt-total logic. It now calls
`recomputeAttempt`, the same function used by rubric marking and moderation.

## E. Re-grade ledger

Fifteen previously under-marked answers were re-graded. The original marks are
preserved in `grade_change_log` as `regraded` rows (previous points, new
points, previous/new correctness, timestamp); no mark was reduced.

| Attempt | Paper | Old total | New total |
| --- | --- | ---: | ---: |
| `6cd8f266…` | MYP 4 FA2 | 37.0 | **39.0** |
| `8ad18126…` | MYP 2 FA2 | 47.0 | **55.0** |
| `f2f1044c…` | MYP 4 FA2 | 37.0 | **38.5** |
| `0f564482…` | MYP 5 FA2 | 38.0 | **40.0** |
| `788da2bd…` | MYP 2 FA2 | 10.0 | **11.0** |
| `7197e68e…` | Grade 4 Science | 13.5 | **14.5** |

Examples of the corrections: `modal class= 20-30` (0 → 1), `mean= 21`
(0 → 1), `$13.5` and `$90` (0 → 0.5/1), `8,75` (0 → 1),
`18+6=24` (0 → 1), `Mn=4n+1` plus `M25=…=101` (2 → 3), `tn=n²` (1.5 → 2.5),
`1/2, 0.5, 4/8, 50%` (0 → 1) and `solvant` (0 → 1).

Every affected attempt total was recomputed from its answers after the
answer-level changes.

## F. Audit trail, disclosure and residual risks

* **Audit trail works.** `exam_answers` has an `AFTER UPDATE` trigger
  (`grade_change_recorder`) that appends to `grade_change_log` for points,
  correctness, marker, moderation or grading-method changes. The table is
  append-only, readable only by the owning workspace's owner/admin/teacher/
  corrector roles (or a Super Admin), and has no client INSERT policy; the
  security-definer trigger is the writer. Manual, rubric and moderation
  changes therefore keep their history, including the 15 re-grades above.
* **Disclosure.** The candidate state route sends only the public question
  projection; correct options, keys and worked solutions are attached only
  when the attempt is submitted **and** results are published. Formula sheets
  are validated against the paper and contain no answer values.
* **Residual risk — numeric typing.** A numeric part still strips trailing
  letters as a unit, so `4n` in a numeric field would be read as `4`. The
  structured part type is `numeric`, not `expression`; authors should keep
  formulas in expression parts.
* **Residual risk — decimal comma.** A single comma with one or two trailing
  digits is treated as a decimal comma (`1,2` → 1.2); three digits are treated
  as a thousands separator (`1,250` → 1250). This is the intended convention
  but is inherently ambiguous.
* **Residual risk — automatic marking method.** Auto-marked answers still have
  `grading_method = 'manual'`; the audit trail distinguishes them by
  `marked_by is null` and the grade-change log. A future migration could set
  `answer_key` for initial automatic marking.
* **Residual limitation — Grade 1 matching.** `open_ended` has no matching
  input; the Social Science matching item remains a prose answer.
* **Residual content note — purple marble.** MYP 2 Version B Q30 asks for
  P(purple) while the chart legend omits purple; the key 0 is correct and the
  item is retained deliberately.
* **Demo data.** Eight seeded DEMO answers have marks but no grade-change row;
  they predate the trigger and are not real candidates.

## Verification

* `npm test`: **136 suites passed, 0 failed, 8 skipped — 2306 checks**.
* `npx tsc --noEmit`: clean.
* `npm run lint`: clean.
* `npm run build`: production build completed.
* Database checks: live papers still open, zero attempts; formula sheets parse;
  changed questions satisfy the required-tool rule; 15 `regraded` log rows.
