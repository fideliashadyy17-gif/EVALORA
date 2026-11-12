# Formative Assessments — Full Student-View Audit (all six papers)

Audit of every question and every part (150 questions) of the six formative assessments, checked as a student sees them: (1) command term on every part, (2) complete question with all needed information on screen, (3) visuals display complete and readable, (4) answer instructions (units, rounding, form, symbol entry), (5) child-friendly wording (6) consistency with the model answer/accepted variants, (7) a working two-level hint on every part, (8) typed answers only. Method: systematic spec audit + server-side rendering of all 150 questions through the real student components (`QuestionRunner`, `AssessDiagram`), before and after the fixes; every fixed question was re-rendered and re-checked. Fixes were applied to production in place with `supabase/migrations/0091_assessment_audit_fixes.sql` (84 questions updated; IDs, slugs and access codes unchanged). Platform-level display fixes shipped alongside: wide data tables are no longer truncated at 8 columns (`src/lib/assessDiagram.ts`) and now scroll horizontally on narrow screens, dot patterns no longer clip, box plots no longer draw misleading y-axis ticks (`src/components/AssessDiagram.tsx`), and expression inputs tell students to use `^` for powers (`src/components/QuestionRunner.tsx`).

## MYP2 (Grade 7) — Formative Assessment 1 · `MYP2-FORM-2026`

24 of 25 questions had at least one defect; all 25 questions re-checked in the student view after fixing.

| Q | Defects found | Fix applied | Final status |
|---|---|---|---|
| 1 | wording (stem unclear/incomplete) | stem rewritten in plain sentences | OK |
| 2 | wording (stem unclear/incomplete) | stem rewritten in plain sentences | OK |
| 3 | wording (stem unclear/incomplete) | stem rewritten in plain sentences | OK |
| 4 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction; (c) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form; (c) now starts with a command term and states the required form | OK |
| 5 | none | — | OK |
| 6 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 7 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 8 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 9 | (b) command term — part was a bare question/statement with no instruction | (b) now starts with a command term and states the required form | OK |
| 10 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 11 | wording (stem unclear/incomplete) | stem rewritten in plain sentences | OK |
| 12 | wording (stem unclear/incomplete) | stem rewritten in plain sentences | OK |
| 13 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 14 | (a) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form | OK |
| 15 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 16 | (b) command term — part was a bare question/statement with no instruction | (b) now starts with a command term and states the required form | OK |
| 17 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 18 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 19 | (a) command term — part was a bare question/statement with no instruction; (c) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (c) now starts with a command term and states the required form | OK |
| 20 | wording (stem unclear/incomplete) | stem rewritten in plain sentences | OK |
| 21 | wording (stem unclear/incomplete) | stem rewritten in plain sentences | OK |
| 22 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 23 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 24 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 25 | wording (stem unclear/incomplete) | stem rewritten in plain sentences | OK |

## MYP4 (Grade 9) — Formative Assessment 1, Statistics · `MYP4-STATS-2026`

17 of 25 questions had at least one defect; all 25 questions re-checked in the student view after fixing.

| Q | Defects found | Fix applied | Final status |
|---|---|---|---|
| 1 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction; (c) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form; (c) now starts with a command term and states the required form | OK |
| 2 | wording (stem unclear/incomplete) | stem rewritten in plain sentences | OK |
| 3 | (a) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form | OK |
| 4 | wording (stem unclear/incomplete); display (visual wrong/incomplete); (b) command term — part was a bare question/statement with no instruction | stem rewritten in plain sentences; visual added/repaired to match the question; (b) now starts with a command term and states the required form | OK |
| 5 | none | — | OK |
| 6 | none | — | OK |
| 7 | none | — | OK |
| 8 | (b) wording / answer instructions unclear; (b) consistency — accepted answers/keyword rubric did not match the question | (b) now starts with a command term and states the required form; (b) accepted variants/rubric corrected | OK |
| 9 | (a) wording / answer instructions unclear; (a) consistency — accepted answers/keyword rubric did not match the question | (a) now starts with a command term and states the required form; (a) accepted variants/rubric corrected | OK |
| 10 | wording (stem unclear/incomplete); missing element (visual referenced but not shown); (b) command term — part was a bare question/statement with no instruction | stem rewritten in plain sentences; visual added/repaired to match the question; (b) now starts with a command term and states the required form | OK |
| 11 | none | — | OK |
| 12 | (b) command term — part was a bare question/statement with no instruction | (b) now starts with a command term and states the required form | OK |
| 13 | none | — | OK |
| 14 | none | — | OK |
| 15 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 16 | wording (stem unclear/incomplete); missing element (visual referenced but not shown); (a) command term — part was a bare question/statement with no instruction | stem rewritten in plain sentences; visual added/repaired to match the question; (a) now starts with a command term and states the required form | OK |
| 17 | (a) hint — missing, leaked the answer, or did not guide; (b) command term — part was a bare question/statement with no instruction; (b) hint — missing, leaked the answer, or did not guide | (a) two-level hint rewritten (guides without giving the answer); (b) now starts with a command term and states the required form; (b) two-level hint rewritten (guides without giving the answer) | OK |
| 18 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 19 | (a) command term — part was a bare question/statement with no instruction; (a) hint — missing, leaked the answer, or did not guide | (a) now starts with a command term and states the required form; (a) two-level hint rewritten (guides without giving the answer) | OK |
| 20 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 21 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 22 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 23 | none | — | OK |
| 24 | none | — | OK |
| 25 | (b) command term — part was a bare question/statement with no instruction | (b) now starts with a command term and states the required form | OK |

## MYP5 (Grade 10) — Formative Assessment 1, Sequences · `MYP5-SEQUENCES-2026`

12 of 25 questions had at least one defect; all 25 questions re-checked in the student view after fixing.

| Q | Defects found | Fix applied | Final status |
|---|---|---|---|
| 1 | none | — | OK |
| 2 | (a) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form | OK |
| 3 | (a) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form | OK |
| 4 | none | — | OK |
| 5 | none | — | OK |
| 6 | none | — | OK |
| 7 | wording (stem unclear/incomplete) | stem rewritten in plain sentences | OK |
| 8 | (b) command term — part was a bare question/statement with no instruction | (b) now starts with a command term and states the required form | OK |
| 9 | (a) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form | OK |
| 10 | none | — | OK |
| 11 | none | — | OK |
| 12 | (b) command term — part was a bare question/statement with no instruction | (b) now starts with a command term and states the required form | OK |
| 13 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 14 | (a) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form | OK |
| 15 | none | — | OK |
| 16 | (a) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form | OK |
| 17 | none | — | OK |
| 18 | none | — | OK |
| 19 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 20 | none | — | OK |
| 21 | none | — | OK |
| 22 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 23 | none | — | OK |
| 24 | (c) command term — part was a bare question/statement with no instruction | (c) now starts with a command term and states the required form | OK |
| 25 | none | — | OK |

## MYP2 (Grade 7) — Formative Assessment 2, Criteria A–D · `MYP2-FORM2-2026`

12 of 25 questions had at least one defect; all 25 questions re-checked in the student view after fixing.

| Q | Defects found | Fix applied | Final status |
|---|---|---|---|
| 1 | wording (stem unclear/incomplete) | stem rewritten in plain sentences | OK |
| 2 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 3 | none | — | OK |
| 4 | none | — | OK |
| 5 | (b) command term — part was a bare question/statement with no instruction | (b) now starts with a command term and states the required form | OK |
| 6 | none | — | OK |
| 7 | none | — | OK |
| 8 | (b) command term — part was a bare question/statement with no instruction | (b) now starts with a command term and states the required form | OK |
| 9 | wording (stem unclear/incomplete) | stem rewritten in plain sentences | OK |
| 10 | none | — | OK |
| 11 | none | — | OK |
| 12 | none | — | OK |
| 13 | (b) command term — part was a bare question/statement with no instruction; (c) wording / answer instructions unclear | (b) now starts with a command term and states the required form; (c) now starts with a command term and states the required form | OK |
| 14 | (b) command term — part was a bare question/statement with no instruction | (b) now starts with a command term and states the required form | OK |
| 15 | none | — | OK |
| 16 | none | — | OK |
| 17 | none | — | OK |
| 18 | (b) command term — part was a bare question/statement with no instruction | (b) now starts with a command term and states the required form | OK |
| 19 | none | — | OK |
| 20 | none | — | OK |
| 21 | (d) command term — part was a bare question/statement with no instruction | (d) now starts with a command term and states the required form | OK |
| 22 | none | — | OK |
| 23 | (c) command term — part was a bare question/statement with no instruction; (d) wording / answer instructions unclear; (d) consistency — accepted answers/keyword rubric did not match the question | (c) now starts with a command term and states the required form; (d) now starts with a command term and states the required form; (d) accepted variants/rubric corrected | OK |
| 24 | (b) command term — part was a bare question/statement with no instruction; (c) command term — part was a bare question/statement with no instruction | (b) now starts with a command term and states the required form; (c) now starts with a command term and states the required form | OK |
| 25 | (a) wording / answer instructions unclear | (a) now starts with a command term and states the required form | OK |

## MYP4 (Grade 9) — Formative Assessment 2, Criteria A–D · `MYP4-FORM2-2026`

9 of 25 questions had at least one defect; all 25 questions re-checked in the student view after fixing.

| Q | Defects found | Fix applied | Final status |
|---|---|---|---|
| 1 | none | — | OK |
| 2 | none | — | OK |
| 3 | none | — | OK |
| 4 | none | — | OK |
| 5 | none | — | OK |
| 6 | none | — | OK |
| 7 | none | — | OK |
| 8 | (a) wording / answer instructions unclear; (b) wording / answer instructions unclear | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 9 | none | — | OK |
| 10 | (c) wording / answer instructions unclear | (c) now starts with a command term and states the required form | OK |
| 11 | none | — | OK |
| 12 | (d) wording / answer instructions unclear | (d) now starts with a command term and states the required form | OK |
| 13 | (b) command term — part was a bare question/statement with no instruction | (b) now starts with a command term and states the required form | OK |
| 14 | none | — | OK |
| 15 | none | — | OK |
| 16 | none | — | OK |
| 17 | (c) consistency — accepted answers/keyword rubric did not match the question | (c) accepted variants/rubric corrected | OK |
| 18 | none | — | OK |
| 19 | none | — | OK |
| 20 | (d) wording / answer instructions unclear; (d) consistency — accepted answers/keyword rubric did not match the question | (d) now starts with a command term and states the required form; (d) accepted variants/rubric corrected | OK |
| 21 | none | — | OK |
| 22 | (d) command term — part was a bare question/statement with no instruction; (d) consistency — accepted answers/keyword rubric did not match the question | (d) now starts with a command term and states the required form; (d) accepted variants/rubric corrected | OK |
| 23 | (c) command term — part was a bare question/statement with no instruction | (c) now starts with a command term and states the required form | OK |
| 24 | none | — | OK |
| 25 | (c) command term — part was a bare question/statement with no instruction; (d) wording / answer instructions unclear; (d) consistency — accepted answers/keyword rubric did not match the question | (c) now starts with a command term and states the required form; (d) now starts with a command term and states the required form; (d) accepted variants/rubric corrected | OK |

## MYP5 (Grade 10) — Formative Assessment 2, Criteria A–D · `MYP5-SEQUENCES-2026`

10 of 25 questions had at least one defect; all 25 questions re-checked in the student view after fixing.

| Q | Defects found | Fix applied | Final status |
|---|---|---|---|
| 1 | none | — | OK |
| 2 | none | — | OK |
| 3 | none | — | OK |
| 4 | none | — | OK |
| 5 | none | — | OK |
| 6 | none | — | OK |
| 7 | none | — | OK |
| 8 | display (visual wrong/incomplete); (a) command term — part was a bare question/statement with no instruction; (b) wording / answer instructions unclear | visual added/repaired to match the question; (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 9 | wording (stem unclear/incomplete); (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | stem rewritten in plain sentences; (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 10 | none | — | OK |
| 11 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 12 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 13 | wording (stem unclear/incomplete); (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | stem rewritten in plain sentences; (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 14 | (a) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form | OK |
| 15 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 16 | (a) command term — part was a bare question/statement with no instruction; (b) command term — part was a bare question/statement with no instruction | (a) now starts with a command term and states the required form; (b) now starts with a command term and states the required form | OK |
| 17 | none | — | OK |
| 18 | none | — | OK |
| 19 | none | — | OK |
| 20 | none | — | OK |
| 21 | none | — | OK |
| 22 | none | — | OK |
| 23 | (d) consistency — accepted answers/keyword rubric did not match the question | (d) accepted variants/rubric corrected | OK |
| 24 | (d) command term — part was a bare question/statement with no instruction; (d) consistency — accepted answers/keyword rubric did not match the question | (d) now starts with a command term and states the required form; (d) accepted variants/rubric corrected | OK |
| 25 | none | — | OK |

## Totals

- Questions audited: **150** (6 papers × 25), every part (a), (b), (c)… checked individually.
- Questions with at least one defect: **84** — every one fixed and re-checked in the student view (final pass: 150/150 questions render with an input for every part, 322/322 part hint buttons present, no raw LaTeX/code on screen).
- Defects by category:
  - command term: 95
  - wording (stem unclear/incomplete): 17
  - wording / answer instructions unclear: 12
  - consistency: 9
  - hint: 3
  - display (visual wrong/incomplete): 2
  - missing element (visual referenced but not shown): 2
- Anything not fixable: **none**. No question had to be rebuilt or deleted; mathematical content, topic, criterion and difficulty were preserved everywhere.

## Addendum — MYP2 strict command-term pass (follow-up)

A second, stricter pass over the two MYP2 papers only, requiring every part to *start* with a
recognised command term (previously some parts used "Type…", "List…" or "Use…", and two ended in a
bare question). 12 further prompts were normalised (migrations
`0092_myp2_command_term_fixes.sql`, `0093_myp2_command_term_lead.sql`, applied to production):
MYP2-1 Q5, Q14(b), Q16(a), Q25; MYP2-2 Q11(d), Q12(d), Q13(c), Q13(d), Q14(d), Q18 stem+(a),
Q19 stem+(a), Q25(d). Rewording only — answers recomputed and unchanged, hints/accepted variants
untouched. Final scan of the production database: 50 questions, 96 parts, **0** parts not starting
with a command term, **0** empty prompts, **0** single questions without an instruction; student-view
re-render confirms 50/50 questions display with a labelled input and hint button per part.

## Addendum 2 — "MYP2 (Grade 7) Formative Assessment 2 - Criteria A-D" stem-level check

The assessment (exam `c2000000-0000-4000-8000-000000000002`, quiz
`c2000000-0000-4000-8000-000000000001`, code `MYP2-FORM2-2026` — the only match in the database for
MYP2 / Grade 7 / Formative Assessment 2 / Criteria at Oak International School) was re-checked at
the *stem* level: 17 questions (Q3, Q5, Q6, Q8, Q10–Q15, Q17, Q18, Q21–Q25) presented only a
diagram, table or scenario in the stem, with the instruction carried solely by the parts
(including the user-spotted Q5, Q6, Q8 and Q10). Each stem now also carries an instruction
sentence starting with a command term summarising its parts (migration
`0094_myp2_form2_stem_instructions.sql`, applied to production). Parts, answers, hints, marks and
strands unchanged. Final scan: 25/25 stems contain an instruction, 62/62 parts start with a
command term, student-view re-render confirms a labelled input and hint button for every part.
