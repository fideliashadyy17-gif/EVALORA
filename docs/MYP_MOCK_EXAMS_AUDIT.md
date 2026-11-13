# MYP2 / MYP4 / MYP5 Mathematics Mock Examinations — pre-implementation audit and plan

Scope: the working tree at `main@ce8809d`, the production Supabase project
`nqxqisjtbfsratgztmch` (queried directly, 74 public tables) and the Vercel
project `evalora` (`prj_1PJb6jCOZPKQSxTTWkE6Gx9l6Ax7`, production alias
`https://evalora-six.vercel.app`).

This document records **what already exists and works**, **what is incomplete**
and **what is missing**, and the plan derived from that — before any change.
Implementation and verification are recorded separately in
`docs/MYP_MOCK_EXAMS_IMPLEMENTATION.md`.

---

## 1. What the platform already has (verified, not assumed)

### 1.1 Modules

| Module | Tables | Routes | State |
| --- | --- | --- | --- |
| Examinations | `exams`, `quiz_questions`, `exam_candidates`, `exam_attempts`, `exam_answers`, `question_hints`, `exam_hint_usage`, `exam_events`* | `/admin/examinations/*`, `/dashboard/exams/*`, `/exam/join/[token]`, `/take-exam/[attemptId]`, `/api/exam/*` | Complete and in production |
| Live quizzes (Competitions) | `quizzes`, `quiz_sessions`, `session_participants`, `participant_answers`, `live_*` | `/play`, `/live`, `/dashboard/sessions/*` | Complete and in production |
| Formative / summative assessments | the Examination module with `settings.assessment_kind` = `formative` \| `summative` \| `mock` | same as Examinations | Six MYP papers already delivered (migrations `0082`, `0085`–`0095`) |
| Question bank | `questions`, `question_options`, `question_categories`, `question_usage` | `/admin/questions/*`, `/dashboard/questions/*` | Complete |
| Marking | `exam_answers.points_awarded`, `grading_rubrics`, `grading_rubric_criteria`, `answer_rubric_scores`, `grading_moderation`, `ai_marking_proposals` | `/dashboard/exams/[id]/grades`, `/admin/examinations/marking` | Complete (auto + manual + rubric + moderation) |
| Proctoring | `proctoring_*`, LiveKit | `/dashboard/exams/[id]/proctor` | Complete |
| Tenancy / entitlements | `organizations`, `plans`, `subscriptions`, `organization_members`, RLS on every table, `src/lib/entitlements.ts` | `/admin/organizations`, `/admin/plans` | Complete |

\* `exam_paper_items` does **not** exist; the paper is `quizzes` + `quiz_questions`
and the sitting is `exams` (`exams.quiz_id`).

### 1.2 The three mock papers will reuse, not replace

- **Paper model** — `quizzes` (paper) + `quiz_questions` (ordered items, per-item
  marks) + `exams` (sitting: dates, duration, access code, settings, publication).
- **Question model** — `questions` with `prompt_doc` (TipTap JSON), `points`,
  `difficulty`, `topic`, `subtopic`, `tags`, `explanation`/`explanation_doc`,
  `config` JSONB. No schema change is needed to add a mock paper.
- **Multi-part typed questions** — `questions.type = 'assess_parts'`
  (`src/lib/assessParts.ts`): one numbered question, parts (a), (b), (c)…, each
  with its own marks, accepted answers, **two progressive hints**, optional MYP
  strand. `scoreAssessParts()` gives per-part partial credit and the marking is
  server-side (`src/lib/scoring.ts` → `scoreAssessParts`).
- **Mathematical editor** — MathLive `math-field` + a 20-category structured
  keyboard (`src/components/editor/mathKeyboard.ts`: Basic, Fractions & Roots,
  Powers & Indices, Equations & Inequalities, Algebra, Geometry, Trigonometry,
  Functions, Limits, Derivatives, Integrals, Sums & Products, Matrices, Greek,
  Sets & Logic, Statistics & Probability, Vectors, Sequences & Series,
  Science & Units, Structures). This already satisfies the symbol-library
  requirement; nothing needs a second toolbar.
- **Response workspace** — `src/lib/responseTools.ts` +
  `StructuredResponseEditor`: `rich_text`, `math`, `table`, `data_table`,
  `graph`, `geometry`, `statistics`, `science`; autosave through the durable
  `ExamSaveQueue`; server-side payload validation in `/api/exam/save`.
- **Graph workspace** — `graphSpec.ts` / `GraphEditor` / `GraphView`
  (functions, points, segments, annotations, legend, intersections).
- **Geometry workspace** — `geometrySpec.ts` / `GeometryEditor` / `GeometryView`.
- **Statistics workspace** — `statsSpec.ts` / `StatsEditor` / `StatsView`
  (dot plot, bar chart, histogram with bin width, box plot, cumulative
  frequency; Tukey quartiles, IQR outliers, population σ computed from data).
- **Structured tables** — `dataTableSpec.ts` / `DataTableEditor` / `DataTableView`.
- **Static authored diagrams** — `assessDiagram.ts` / `AssessDiagram`
  (`table`, `tape`, `double_number_line`, `venn2`, `stem_leaf`, `box_plot`,
  `histogram`, `cumulative_curve`, `shape_pattern`, `term_graph`, …).
- **Hints** — `question_hints` (migration `0077`), bank-wide or per-examination,
  levels 1–3, review workflow, answer-leak guard (`findHintLeaks`), candidate
  route `/api/exam/hint` (token, in-progress only, paper membership check) and
  `/api/exam/hint/usage` (`record_exam_hint_use` → `exam_hint_usage`).
- **Results and feedback** — `/api/exam/state` returns `reveal` + `result` per
  question only after submission **and** publication; `buildExamResult`,
  `resultLabel`, `answerKeyLine`; the post-submission screen already shows score,
  percentage, pass mark, a by-topic and by-MYP-criterion breakdown with an
  indicative level band, and hint usage.
- **Fairness / integrity** — server-authoritative deadline (`0063`), autosave
  queue with offline recovery, pause/resume (`exam_pause_events`), connection
  events, locked submitted attempts.

### 1.3 Existing MYP content in production (do not duplicate)

| Paper | Questions | Marks | Kind | Code |
| --- | --- | --- | --- | --- |
| MYP 2 — Rate, Ratio, Proportion, Sets and Probability | 25 | 50 | formative | `MYP2-FORM-2026` |
| MYP 4 — Statistics | 25 | — | formative | `MYP4-STATS-2026` |
| MYP 5 — Sequences and Series | 25 | — | formative | `MYP5-SEQ-2026` |
| MYP 5 — Sequences and Series (Assessment Studio) | 17 | 73 | — | — |
| MYP2 / MYP4 / MYP5 Formative Assessment 2 (Criteria A–D) | 25 each | 57 / 58 / 58 | formative | `MYP2-FORM2-2026` etc. |

The three new **mock examinations** are separate papers with separate codes.
Nothing in this list is edited, renumbered, re-scored or re-published.

---

## 2. Gaps that block the requirements (the real work)

| # | Requirement | Gap found | Plan |
| --- | --- | --- | --- |
| G1 | MYP2 Venn diagrams: *construct* a two- and a three-set Venn diagram | `assessDiagram` has a **read-only** `venn2` (counts supplied by the teacher). There is no Venn response tool and no three-set type anywhere. | Add a **`venn` response tool** (`vennSpec.ts` + `VennEditor` + `VennView`), 2 or 3 sets, regions keyed by set-expression (`A∩B`, `A only`, outside), draggable labels, counts entered per region. Wire into `responseTools`, `StructuredResponseEditor`, `validateAnswerPayload`, `AnswerResponseView` and the editor blocks. |
| G2 | MYP4 grouped frequency tables with **unequal** class intervals and true histograms (frequency density) | `statsSpec` stores raw observations only and derives equal-width bins. There is no grouped-series input, no frequency density, no class-boundary handling. | Extend `statsSpec` additively: optional `groups[] {from, to, frequency}` (unequal widths allowed), compute **frequency density** when widths differ, class midpoints, cumulative totals; new `frequency_polygon` chart type; new `grouped_frequency` input mode in `StatsEditor`. Raw-value behaviour is unchanged (default). |
| G3 | Cumulative frequency **curve** read for median/quartiles | `cumulative_frequency` exists but only for raw observations with unit steps — not for a grouped table, which is how the exam asks for it. | Covered by G2: grouped series → cumulative polygon with cumulative-frequency axis, from which the candidate reads and the marker sees the same numbers. |
| G4 | MYP4 stem-and-leaf **construction** | `stem_leaf` diagram is display-only. | Add `stem_leaf` as a `data_table` starter (stem column + leaf column) — the existing structured table already gives per-cell marking and re-editing, so no new component is needed. Verified as a construction path in the coverage matrix. |
| G5 | Structured questions where the student must **show working** as well as type an answer | `assess_parts` renders only an input per part; the rich workspace is available only on `open_ended`. So a multi-part question that asks the student to *show* a method has nowhere to put it. | Add an **optional per-part working workspace**: `config.response_tools` / `response_*` on an `assess_parts` question, and a per-part "Show your working" toggle rendering the existing `StructuredResponseEditor` under the part's input. The part's typed answer is still what is marked; the working is preserved for the marker and never changes the mark. Backward compatible: absent config = exactly today's behaviour. |
| G6 | Post-result question-level feedback ("what it tested", "common mistakes", "how to improve", "how it transfers") | The result panel prints `explanation` only (one paragraph). The papers carry `config.marking_criteria` and `config.next_time_hint` but neither is shown to the student after submission. | Extend the published-reveal payload with the **candidate-safe feedback fields** already stored on the question (`config.marking_criteria`, `config.next_time_hint`, criterion/strand) and render them in the result block. No answer is revealed earlier than today; the same `submitted && resultsPublished` gate applies. |
| G7 | Results analysis: topic strengths/needs, objective vs structured split, pass message | Score, %, pass badge, by-topic and by-criterion exist. Missing: objective/structured split, strand detail, a per-question result list, and the personalised pass/below-pass message. | Extend the result screen with the splits + message, driven by data already present (`type`, `criterion`, `topic`, `points`, `result.points_awarded`). Pass threshold already configurable: `exams.settings.pass_mark_percent`, default 50. |
| G8 | Mock examination **cover/instruction page** | `exams.instructions` is a paragraph shown at join. No objectives, structure table or mark allocation view. | Populate `exams.instructions` with the full cover (objectives, general instructions, section structure, mark allocation, calculator/notation rules) using the existing field; add the structure to the paper description. No new component needed. |
| G9 | Hints **on every** part, 2–3 progressive levels, recorded | Level 1–2 exist per part; the paper-level `question_hints` rows exist too. Level 3 (`max_levels: 3`) is supported by the schema but unused. | Author level-1/2 per part and a level-3 **transferable method** hint per question where it adds value; publish through the existing workflow (leak guard runs). |
| G10 | Verification that mock papers are academically sound | No automated content audit for marks, hints, keys, criterion coverage. | New `scripts/exam-import/verify_mock_exams.py` + `scripts/test-myp-mock-exams.mjs`: marks reconciliation, part/option key completeness, two hints per part, criterion coverage for MYP5, tool availability per question, duplicate-stem detection, and a numeric re-check of every objective key. |

### Explicitly *not* changing

- No new question `type` (the `questions_type_check` CHECK constraint and every
  consumer stay as they are). `assess_parts` + `open_ended` cover the need.
- No second editor, toolbar, timer, save queue, marking system or result system.
- No schema migration for the papers themselves (fixed UUIDs + `ON CONFLICT DO
  NOTHING`, content only).
- No edit to any existing paper, question, attempt, answer or mark.

---

## 3. Plan

1. **Platform layer (shared, all modules)** — G1, G2, G3, G5, G6, G7 as
   reusable specifications, editors, views, response-tool inference, save
   validation and result rendering. Every change additive and backward
   compatible; existing papers keep their behaviour.
2. **Content layer** — three new papers in the Examination module with the
   exact titles, ~45 questions each (Section A objective 22, Section B
   structured 23), per-part marks, keys, marking schemes, hints and feedback,
   created `draft`/`scheduled`-safe and *not* published until validation passes.
3. **Verification** — unit/component suites, PGlite migration dry-run
   (`scripts/test-myp-mock-migrations.mjs`), a content audit script, `tsc`,
   lint, production build, and a rendered-student check. Then apply the
   migrations to production, verify the rows, deploy.

### Migration layout

Each paper ships as a run of consecutive migrations, because one file per paper
is far above the ~40 KB a single SQL editor / migration-API statement accepts
(the same budget applies after URL-encoding, so the accented and mathematical
characters in the prose count double):

| Paper | Parts (a → assembly) |
|---|---|
| MYP2-MOCK-2026 (189 marks) | `0097`–`0102` (a–e + assembly `f`) |
| MYP4-MOCK-2026 (221 marks) | `0103`–`0109` (a–f + assembly `g`) |
| MYP5-MOCK-2026 (259 marks) | `0110`–`0115` (a–e + assembly `f`) |

Part boundaries are computed from the encoded payload size by
`build_mock_migrations.py`, which fails the build if any file would exceed the
budget, so a content edit can never produce an unappliable file. Parts are
numbered sequentially across the three papers (the split moves, so a fixed
per-paper start number would collide). Every part is independently idempotent;
the final part re-assembles any missing paper item and then refuses to commit
unless the paper is complete.

---

## 4. Coverage matrix

The authoritative matrix (question → topic → criterion → marks → response tool →
hints) is generated by `scripts/exam-import/verify_mock_exams.py` and pasted
into `docs/MYP_MOCK_EXAMS_IMPLEMENTATION.md`, so it can never drift from the
papers that are actually in the database.
