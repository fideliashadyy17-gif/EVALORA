# MYP 4 (Grade 9) Mathematics — Q15–18 matching correction

**Assessment:** MYP 4 (Grade 9) Mathematics — Term 1 Summative Assessment
(quiz `cb000000-0000-4000-8000-000000000001`, examination
`cb000000-0000-4000-8000-000000000002`).

**Problem corrected:** the original import stored Q15–18 as four separate
multiple-choice questions. The source paper prints **one** matching exercise:
a single formula bank labelled **P–U** and four numbered definitions, each with
one small box for a letter. The assessment now matches the paper.

## What the candidate sees

- The printed instruction and the six-formula bank **P, Q, R, S, T, U**.
- Four definitions, unchanged from the paper:
  - **15** Diagram showing distribution shape while retaining every exact raw data value — Criterion C
  - **16** Formula for frequency density when constructing an unequal-width histogram — Criterion A
  - **17** Exact formula for the population standard deviation σ of N values — Criterion A
  - **18** Graph used to estimate median, quartiles and percentiles of grouped continuous data — Criterion C
- One small, aligned answer box in front of each definition. The student taps a
  box and types one letter. Lower case is normalised to upper case; characters
  outside P–U are rejected without clearing an existing answer.
- All four boxes belong to **one** parent question. Typing saves that question's
  answer payload (`pairs`), so the existing draft/restore and examination rules
  apply unchanged.
- The question navigator shows one **15–18** entry, and the card reads
  "Questions 15–18 of 25" in Part A. Later questions keep their printed numbers.

## Marks and criteria

| Field | Answer | Marks | Criterion |
| --- | --- | --- | --- |
| 15 | T | 1 | C |
| 16 | P | 1 | A |
| 17 | Q | 1 | A |
| 18 | R | 1 | C |
| **Total** | | **4** | **A 2 · C 2** |

The paper still totals 100 marks, with the printed criterion totals
**A 32, B 20, C 24, D 24**. The results engines read the question's
`criterion_shares` (`A 2`, `C 2`) so those totals stay exact; the award is split
between the two criteria in the same proportion.

## Data change

Forward migration:
`supabase/migrations/20261118120000_myp4_q15_18_matching_exercise.sql`

1. Q15 becomes the single `matching` parent question, 4 marks, with
   `match_mode: "letters"`, four `pairs` (one per definition), four row metadata
   entries, and `criterion_shares`.
2. The Q15 quiz row carries 4 marks.
3. Q16–18 quiz links are removed, so the four boxes are no longer four
   independent questions.
4. The absorbed question rows are **archived, not deleted**, with
   `superseded_by` pointing at Q15. No option, question or assessment record is
   deleted.
5. No other question, mark, duration, criterion, section, class or branding is
   changed.

The examination had **0 attempts and 0 saved answers** before the migration, so
no attempt, answer or result required migration.

## Application change

- `src/components/QuestionRunner.tsx` — typed-letter layout for
  `match_mode: "letters"`: one box per row, P–U validation, normalisation, save
  on entry, restore of saved letters, mobile-first aligned rows.
- `src/lib/live.ts` — candidate-safe projection of the letter rows (no key),
  the printed 15–18 label/span, and the criterion split.
- `src/lib/criterionShares.ts` — validates a question's criterion split and
  distributes its marks.
- `src/lib/myp.ts` / `src/lib/mypResults.ts` / `src/lib/examFeedback.ts` —
  criterion reporting uses the split, without changing the behaviour of any
  question that has no split.
- `src/app/take-exam/[attemptId]/TakeExamClient.tsx` — printed question labels
  in the navigator and the correct Part A denominator for a grouped question.
- `scripts/exam-import/summative_a_myp4.py` — the source module now produces the
  one-question structure, so a future rebuild carries the correction.
- `scripts/exam-import/build_summative_a_matching_correction.py` — generates the
  forward migration from that source module.

## Verification

- `node scripts/test-matching-letters.mjs` — **29 checks**: one quiz record,
  four marks, six P–U formulas, four verbatim definitions, T/P/Q/R key, 100
  total marks, A32/B20/C24/D24, archived rows, no key in the student
  projection, case-insensitive scoring, partial marks per field, invalid letters
  score nothing, other questions unchanged.
- `node scripts/test-question-runner-drafts.mjs` — **12 checks**, including a
  4-box typed-letter interaction test (restore, lower-case normalisation,
  out-of-bank rejection without clearing, all four saved in one payload).
- `node scripts/test-myp-grading-engine.mjs` — **95 checks**, including the
  split-criterion maxima and proportional award.
- `node scripts/test-myp-criteria.mjs` — **36 checks**, including the result
  summary's split rows.
- `npm test` — **138 suites passed, 0 failed, 8 browser suites skipped**;
  **2312 individual checks passed**.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` — clean.
