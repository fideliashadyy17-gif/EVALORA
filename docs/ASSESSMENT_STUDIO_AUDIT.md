# EVALORA — Assessment Studio audit (baseline before the 2026-11-11 upgrade)

> See `docs/ASSESSMENT_STUDIO_UPGRADE.md` for what was implemented and how it was verified.

Scope: the `main` tree at `c838fb9` (production deployment `dpl_L6tLqqyyrsxDaqieXUE2Gw6QPEGH`).
This is a working checklist, kept so later decisions can be traced.

## What already existed and works (reused, not replaced)

| Capability | Where | Decision |
| --- | --- | --- |
| Rich structured question content (TipTap JSON + legacy `$…$`) | `src/lib/content.ts`, `src/components/RichContent.tsx`, `src/components/editor/RichContentEditor.tsx` | Extended, never duplicated |
| Visual mathematics field (MathLive, local fonts) | `src/components/editor/MathField.tsx`, `public/mathlive/` | Reused for teacher **and** student |
| Mathematical keyboard (18 categories, structures not Unicode glyphs) | `src/components/editor/mathKeyboard.ts` | Reused; added sequences/science/units categories |
| KaTeX rendering + validation | `content.ts` → `renderLatex`, `validateLatex` | Reused everywhere |
| Stored math in `mathInline` / `mathBlock` nodes with `attrs.latex` | `src/components/editor/mathNodes.tsx` | Reused; new diagram nodes follow the same pattern |
| Image upload / URL insertion, tables, lists, headings, colours, alignment | `RichContentEditor` | Reused |
| Question types and server scoring | `src/lib/scoring.ts`, `src/lib/questionValidation.ts` | Extended additively |
| Candidate exam client with save queue, offline recovery, server deadline | `TakeExamClient.tsx`, `examSaveQueue.ts`, `examSubmission.ts`, `examDeadline.ts` | Reused unchanged |
| Integrity monitor / clipboard lockdown | `src/lib/integrity.ts`, `assessmentLockdown.ts` | Reused; new tools verified not to trigger false clipboard incidents |
| Teacher marking (manual marks, rubrics, AI proposals) | `dashboard/exams/[id]`, `admin/examinations/marking` | Extended with structured-response rendering |
| Exam navigation, hints, retakes, proctoring | existing modules | untouched |

## Gaps found

1. No graphing or geometry tool of any kind; prompt diagrams were static images only.
2. Student constructed responses were a plain `<textarea>` (`open_ended`) or a single-line input; no math, no structured storage, no graphs.
3. Question `config` had no notion of which response tools a question needs, so every constructed-response question received the same generic box.
4. The marking screens printed `answer.text ?? JSON.stringify(answer)`, which would flatten any structured response.
5. The save route validated the attempt/question linkage but not the shape or size of a rich answer payload.
6. No tests covered graph/geometry serialisation, response-tool inference or structured answer validation.

## Constraints honoured

- No new question **type** was introduced, because `questions_type_check` is a database CHECK constraint and new types would ripple through scoring, marking queues, printable papers and live quizzes. Constructed-response questions stay `open_ended` and gain an explicit response-tool configuration; existing papers keep their meaning, marks and wording.
- Graph/geometry specifications live in the existing `config` JSONB (question side) and `exam_answers.answer` JSONB (candidate side): no schema change, backward compatible.
- No existing assessment, attempt, answer or mark is modified by the migration; it only inserts the new MYP 5 formative paper.
