# Grade 4 — second marking period: source-to-examination verification

Source document: `OAK_Grade4_Second_Marking_Period_Exam_Papers_2026_2027.pdf`
(OAK International School, 17 pages, "End of Second Marking Period Examination —
Grade 4 • 2026/2027"). Papers on pages 2–13, teacher marking schemes on pages
14–17.

Everything below is read back from the production database
(`nqxqisjtbfsratgztmch`) after the import, not from the migration files.

## 1. The four examinations

| Examination | Source pages | Questions in source | Imported | Answer keys verified | Images verified | Marks | Duration | Status | Class |
|---|---|---|---|---|---|---|---|---|---|
| Examination of Grade 4 – Mathematics | 2–4 | 30 | 30 | 30 (20 objective + 10 marking-scheme) | 6 diagrams | 50 | 60 min | open | CE2 (grade 4) |
| Examination of Grade 4 – Language Arts | 8–10 | 30 | 30 | 30 (20 objective + 10 marking-scheme) | 9 (4 diagrams + 5 uses of the two passages) | 50 | 60 min | open | CE2 (grade 4) |
| Examination of Grade 4 – Social Science | 11–13 | 30 | 30 | 30 (20 objective + 10 marking-scheme) | 4 charts/graphs | 50 | 60 min | open | CE2 (grade 4) |
| Examination of Grade 4 – Science | 5–7 | 30 | 30 | 30 (20 objective + 10 marking-scheme) | 4 diagrams | 50 | 60 min | open | CE2 (grade 4) |
| **Total** | | **120** | **120** | **120** | **18 crops** | **200** | | | |

Access codes (shared link, the platform default): `G4-MATH-2026`,
`G4-LANG-2026`, `G4-SOC-2026`, `G4-SCI-2026`.

Nothing was omitted, duplicated, reworded, reordered or moved between papers.
Verified per examination: 30 rows in `quiz_questions` at positions 1–30 with no
gap, each paper summing to the printed 50 marks, each question carrying
`config->>'source' = 'oak-grade4-2026-2027'`, and each examination holding one
subject only.

## 2. Answer keys

Section A is auto-marked from the paper's own key. The platform uses whichever
mechanism matches the printed card, and each objective question is markable
exactly once:

| Paper | keyed choice | keyed numeric | printed pairing | ordering | multiple select |
|---|---|---|---|---|---|
| Mathematics | 14 | 4 (Q14, Q15, Q16, Q19) | 1 (Q20) | 1 (Q18) | — |
| Language Arts | 19 | — | 1 (Q19) | — | — |
| Social Science | 18 | — | 1 (Q20) | 1 (Q18) | — |
| Science | 17 | — | 1 (Q20) | 1 (Q18) | 1 (Q19: two keyed) |

Section B (Q21–Q30 on every paper) is teacher-marked and carries no automatic
correct answer, because the printed guides are point-based ("M1 bar labels;
A1 for 980"). Fabricating a single accepted string would have invented a key.

Printed Section A keys as imported:

* **Mathematics** — 1B 2C 3A 4D 5B 6C 7A 8B 9C 10B 11 TRUE 12 TRUE 13 FALSE
  14 13,500 15 120 16 120 17 D (50 × 30) 18 60÷20, 80÷20, 120÷20 19 35
  20 125 × 8 → 1,000 / 175 ÷ 25 → 7.
* **Science** — 1B 2C 3D 4A 5A 6C 7B 8A 9C 10B 11 TRUE 12 FALSE 13 FALSE
  14 condensation 15 solvent 16 humus 17 D (Polyester) 18 Topsoil → Subsoil →
  Parent rock → Bedrock 19 Wind + Running Water 20 Salt from seawater →
  Evaporation / Iron from sand → Magnet.
* **Language Arts** — 1B 2C 3D 4A 5B 6A 7C 8B 9C 10D 11 TRUE 12 FALSE 13 TRUE
  14 are 15 Bakery 16 us 17 D (garden) 18 was watching 19 Nose → Smell /
  Tongue → Taste 20 West.
* **Social Science** — 1A 2B 3C 4A 5B 6C 7D 8A 9B 10C 11 FALSE 12 TRUE
  13 FALSE 14 17 15 country 16 source / tool 17 D (pillow) 18 Collect data →
  Analyse data → Evaluate results 19 B (Planting shade trees) 20 Overlapping
  circles → Venn / Bars of height → Bar Graph.

Section B keys (printed model answers) are stored verbatim in each question's
`config->>'marking_scheme'`, e.g. Mathematics Q21 "Boxes: 18,000 | 2,400 |
120 | 48; Sum of boxes = 20,568", Q29 "(c) 945 ÷ 35 = 27", Science Q24 "X =
Solid, Y = Liquid, Z = Gas; Arrow 1 = Melting, Arrow 2 = Evaporation".

## 3. Images

The PDF contains **no raster images at all** — every diagram is vector art, so
each one was rendered from the printed page by `scripts/grade4-figures.py`
(18 crops, DPI 300, committed under `public/exam-figures/grade4/` with a
`manifest.json`). Each crop spans the diagram's own drawing **and** its printed
labels, and stops below the question's title strip so no heading is clipped.

| Question | Figure |
|---|---|
| Mathematics Q19 | bar model, five units, "Total = 175" |
| Mathematics Q21 | empty box-method grid, × 6 |
| Mathematics Q22 | empty 2 × 2 box-method grid, 30/5 × 40/6 |
| Mathematics Q24 | bar model, Science 245 / Story = ? |
| Mathematics Q26 | long-division bracket 6 ) 4,632 + working box |
| Mathematics Q30 | bar model, "Total = 1,500", seven units + 48 |
| Science Q22 | textile-fibres classification chart |
| Science Q24 | particle boxes X, Y, Z with arrows 1 and 2 |
| Science Q26 | solution / filtration setups P–T |
| Science Q29 | four-layer soil profile A–D |
| Language Arts passages 1 and 2 | bench illustration, Mimosa "Open (Day) / Folded (Touched)" |
| Language Arts Q29 | five sense cards with "Organ: ___" |
| Language Arts Q30 | neighbourhood map with N/E/S/W compass |
| Social Science Q22 | tally chart of vegetable sources |
| Social Science Q23 | Venn diagram of Shop A / Shop B |
| Social Science Q25 | bar graph, North 8 / South 3 / East 6 / West 9 |
| Social Science Q26 | country table A–C |

All 18 files were checked visually against the source page after the final run.

## 4. Source defects flagged (not "fixed")

Printed marks, prompts and printed keys are kept exactly as they stand; the
question is marked `review_required` with the reason a teacher needs.

| Paper / Q | Defect |
|---|---|
| All papers, Section B | The marking-scheme cells are cut off at the page edge for the long answers ("(a) Protection from weath", "X = Solid, Y = Liquid, Z"). Readable text transcribed; each affected question flagged. |
| Language Arts Q10 | Key cell garbled: "D (were watered -> were w", which does not match the card's own options. Printed key letter D recorded, flagged. |
| Language Arts Q18 | Scheme prints "was reading" for a card that asks was/were **watching**. Flagged. |
| Language Arts Q23 | Six answer slots (2 countable, 2 uncountable, 2 is/are) against a 2-mark tariff; the is/are sentences do not use the sorting words. Printed as is, flagged. |
| Language Arts Q25, Q26, Q27 | Scheme model answers name different words ("neatly", "a pen", "sketching") than the card prints. Flagged. |
| Social Science Q3 | Options Pillow / Bicycle / Majority / Umbrella; scheme answers "C (Compare / Majority)". Key letter C kept, flagged. |
| Social Science Q13 | Scheme keys FALSE for a statement ("a group task works best when every member shares the work") that reads TRUE. Flagged. |
| Science Q23 | Six printed answer lines against a 3-mark tariff. Printed as is; the scheme itself resolves it ("1m per row"). |

## 5. Decisions reported (nothing invented)

* **Duration** — 60 minutes, printed on every paper's cover and on the index
  page ("50 Marks | 60 Mins"). Not a platform default.
* **Marks** — 50 per paper, printed: Section A 20 × 1 mark, Section B 30 marks
  in the pattern 3,3,3,3,2,3,2,2,4,5.
* **Schedule** — the source prints no dates, so none were set; the examinations
  are `open` (no start/end window) rather than given an invented timetable.
* **Access** — the source prints no access restriction. The platform's standard
  shared-link examination was used, open to the Grade 4 class only
  (`eligible_class_ids` = CE2). No new restriction was added.
* **Class** — Grade 4 is stored as **CE2**
  (`0a400000-0000-4000-8000-000000000104`, `grade_order = 4`). No second
  Grade 4 class was created.
* **Section B marking** — manual, because the printed guides are point-based.

## 6. Tests

* `node scripts/test-grade4-papers.mjs` — 45 checks against a real PostgreSQL
  (PGlite): every migration loads, 30 questions and 50 marks per paper,
  Section A 20 / Section B 10 with the right mark split, every question keyed,
  every diagram attached and present on disk, every flag explained, every
  markable question auto-markable exactly once, four examinations with the right
  titles/class/duration, and idempotency on re-run.
* `npm test` — 536 individual checks pass. One pre-existing browser suite
  (`test-exam-premature-submit-browser.mjs`) fails because Playwright is not
  installed in the build sandbox; it is skipped when run with `--all` and is
  unrelated to this import.
* `npx tsc --noEmit` clean; `npm run build` clean.

## 7. Production state after the import

* 4 examinations with `settings->>'source' = 'oak-grade4-2026-2027'`, each
  `open`, 60 minutes, 30 questions, 50 marks, class CE2.
* 120 questions, 232 printed answer choices, 18 diagram files.
* Existing data untouched: 28 examinations after the import (24 pre-existing +
  4 new), 1,501 pre-existing questions + 120 imported = 1,621, 10 exam attempts
  before and after, exactly one Grade 4 class.
