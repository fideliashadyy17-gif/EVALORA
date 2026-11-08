# Grade 1 / CI — second marking period: source-to-examination verification

Source document: `OAK_Grade1_Second_Marking_Period_Exam_Papers_2026_2027.pdf`
(OAK International School Benin, 21 pages, "Grade 1 / CI · 2nd Marking Period · 2026/2027").
Papers on pages 2–17, marking schemes on pages 18–21.

Everything below is read back from the production database
(`nqxqisjtbfsratgztmch`) after the import, not from the migration files.

## 1. The four examinations

| Examination | Source pages | Questions in source | Imported | Answer keys verified | Images verified | Marks | Duration | Status | Class |
|---|---|---|---|---|---|---|---|---|---|
| Examination of Grade 1 – Mathematics | 2–5 | 30 | 30 | 30 (20 objective + 10 marking-scheme) | 30 crops / 17 picture cards | 40 | 40 min | open | CI (grade 1) |
| Examination of Grade 1 – Language Arts | 10–13 | 30 | 30 | 30 (20 objective + 10 marking-scheme) | 30 crops / 17 picture cards | 40 | 40 min | open | CI (grade 1) |
| Examination of Grade 1 – Social Science | 14–17 | 30 | 30 | 30 (20 objective + 10 marking-scheme) | 30 crops / 24 picture cards | 40 | 40 min | open | CI (grade 1) |
| Examination of Grade 1 – Science | 6–9 | 30 | 30 | 30 (20 objective + 10 marking-scheme) | 30 crops / 24 picture cards | 40 | 40 min | open | CI (grade 1) |
| **Total** | | **120** | **120** | **120** | **120 crops** | **160** | | | |

No question was omitted, duplicated, reworded, reordered or moved between
papers. Verified by query, per examination:

* 30 rows in `quiz_questions`, 30 **distinct** question ids, positions 1–30 with
  no gap and no mismatch against each question's printed number;
* every row's `points` equals the question's own printed mark (1 for Q1–Q20,
  2 for Q21–Q30), and each paper sums to 40;
* every question belongs to the same organisation as its examination, carries
  `config->>'source' = 'oak-grade1-ci-2026-2027'`, and each examination holds
  exactly one `config->>'subject'` — no subject crosses into another paper;
* every prompt's wording appears in the source PDF's own text layer (all 120
  prompts checked word by word against pages 2–17: zero mismatches);
* every answer key in the database matches the printed marking scheme.

## 2. Answer keys

Section A is auto-marked from the paper's own key, one keyed option per
question (80 objective questions, each with exactly one `is_correct` row; no
objective question has zero or two). Section B (Q21–Q30 on every paper) is
teacher-marked and carries no automatic correct answer, because the printed
marking guides are point-based ("1m for flower; 1m for leaf") and inventing a
single accepted string would have fabricated a key.

Printed keys as imported:

* **Mathematics** — 1) 5, 2) 7, 3) 4, 4) 5, 5) YES, 6) 8, 7) 9, 8) 10, 9) 11,
  10) NO, 11) B, 12) A, 13) B, 14) C, 15) YES, 16) B, 17) C, 18) YES,
  19) straight, 20) triangle.
* **Science** — 1) B, 2) A, 3) C, 4) root, 5) YES, 6) A, 7) B, 8) banana,
  9) YES, 10) NO, 11) B, 12) A, 13) C, 14) fish, 15) YES, 16) B, 17) A,
  18) burrow, 19) food, 20) farm.
* **Language Arts** — 1) bread and apple, 2) YES, 3) A, 4) B, 5) has, 6) have,
  7) sh, 8) B, 9) Mr Ola, 10) YES, 11) A, 12) rope, 13) gold, 14) can't,
  15) YES, 16) Who, 17) What, 18) B, 19) have, 20) teacher.
* **Social Science** — 1) A, 2) A, 3) B, 4) plants and flowers, 5) YES, 6) A,
  7) B, 8) C, 9) veg garden, 10) YES, 11) What plants need, 12) A,
  13) Sunny good soil, 14) YES, 15) NO, 16) B, 17) A, 18) Our teacher,
  19) flower, 20) book.

Word banks are preserved exactly as printed: Mathematics
`straight, triangle, curved, zero`; Science `food, farm, root, water`;
Language Arts `have, teacher, has, doctor`; Social Science
`flower, book, water, hoe`.

## 3. Pictures

The source PDF contains **no raster images** — every picture is vector artwork
drawn on the page, so it cannot be lifted out of the text layer. Each question's
own card is therefore rendered at 300 dpi from its page geometry
(`scripts/grade1-figures.py`, 120 crops in `public/exam-figures/grade1-ci/`).

The printed artwork appears in three shapes, and all three are carried:

1. a row of picture tiles with A/B/C captions (82 questions — this is what the
   marking scheme keys by letter);
2. a single illustration beside the answer lines or YES/NO boxes (30 more
   questions, e.g. Language Arts Q5 shows an apple, Social Science Q26 shows a
   watering can);
3. a shared panel serving two questions at once (Science Q21 & Q22).

112 of the 120 questions therefore show artwork. The remaining 8 are words-only
cards and are left without a picture rather than being given an invented one:
Language Arts Q12, Q13, Q14, Q15, Q23, Q24, Q25 and Social Science Q27.

## 4. Decisions that had to be reported

* **Grade 1 = CI.** Every page of the source is headed "GRADE 1 / CI", and the
  workspace's class ladder has `CI` at `grade_order = 1`. The four examinations
  are attached to that existing class
  (`0a400000-0000-4000-8000-000000000101`); no second Grade 1 class was created.
* **Duration 40 minutes.** Printed on every paper ("Time: 40 Mins") and on the
  index page ("40 Marks | 40 Mins"). Not a default.
* **Marks 40.** Printed on every paper: Section A 20 × 1 + Section B 10 × 2.
* **Access.** The source states no restriction, so none was invented: the
  platform's standard shared link with a per-paper access code
  (`G1-MATH-2026`, `G1-LANG-2026`, `G1-SOC-2026`, `G1-SCI-2026`), first name
  and last name on the link page, eligible class limited to CI. Results are not
  published automatically — teachers mark Section B first.
* **Open, not scheduled.** The source prints no date or time window, so none was
  invented; the examinations are open to students immediately, as requested.
* **Attempt policy.** Platform default `single_resume`: a disconnection resumes
  the same attempt with its original deadline instead of losing the paper.

## 5. Source defects — flagged for a teacher, never guessed

Each of these is recorded on the question itself, not silently corrected:

1. **Mathematics Q30** — the printed answer row is cut off at the right page
   edge; only `1->B (14)` is readable. The other three pairings must be read off
   the paper and entered by the teacher. `review_required = true`.
2. **Social Science Q27** — the marking scheme says "tick 1 & 3" while the card
   lists three statements in the order *What plants grow well? · How do we fly a
   plane? · Do plants need water?*; the tick order is resolved as printed but
   worth a glance.
3. **Language Arts Q30** — the stem's word order on the card differs from the
   marking scheme's phrasing ("A pink (3) grows" / "in her nice (4)"); the key
   (flower, garden) is unaffected.
4. **Science Q13** — answerable only from the printed picture (elephant); the
   crop is attached, and it is worth checking on a small screen.
5. **Social Science Q2 and Q14** — stray `?` in the printed stem.
6. **Language Arts Q12–Q15, Q23–Q25 and Social Science Q27** — words-only cards,
   so they show no picture.

## 6. How this was verified

* `node scripts/test-grade1-papers.mjs` — the five content migrations run
  against a real PostgreSQL engine (PGlite): 32/32 checks, including 30
  questions and 40 marks per paper, 20 Section A / 10 Section B, one keyed
  option per objective question, artwork coverage, and idempotent re-runs.
* `npm test`, `tsc --noEmit`, `next build` — clean.
* Production read-back after the import: 4 examinations, 4 papers, 120
  questions, 199 printed answer choices, 40 marks and 40 minutes each, all
  `status = 'open'`, all class CI, all `shared_link_enabled`, no candidates and
  no attempts created.
* None of the 19 pre-existing examinations, 47 pre-existing quizzes, 29
  competitions or 10 existing attempts was modified.

## 7. Files

* `supabase/migrations/0064`–`0067` — the 120 questions per subject.
* `supabase/migrations/0068_grade1_options.sql` — the printed answer choices and keys.
* `supabase/migrations/0069_grade1_examinations.sql` — the four papers and the four examinations.
* `scripts/grade1-figures.py` — the crop extractor; `scripts/test-grade1-papers.mjs` — the validator.
* `public/exam-figures/grade1-ci/` — 120 crops + `manifest.json`.
