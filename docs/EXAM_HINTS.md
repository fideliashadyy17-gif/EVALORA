# Examination hints (“Need a hint?”)

A universal, question-specific hints feature inside EVALORA's existing
examination interface. It adds guidance only — never an answer — and it is
delivered without touching an attempt, a timer, an answer or a session.

## 1. Where it appears

Inside the examination page (`/take-exam/[attemptId]`), in the question header
next to the point badge and the flag control:

```
Question 3 of 12   ·  2 point(s)   ·  [ Need a hint? 💡 ]   …  Flag for review
```

Clicking it expands an **inline** panel under the header (not an overlay, not a
modal): the question, options, maths editor, images and the on-screen keyboard
stay visible and usable. The panel offers progressive levels where they exist
(“Another hint”), can be hidden at any time, and reports network trouble with a
retry instead of fabricating content.

The control is rendered only while the attempt is in progress. On a submitted
paper it is not rendered at all.

## 2. What supports it

| Dimension | Supported |
|---|---|
| Examinations | every examination, past/present/future, draft/scheduled/open/closed; no examination needs to be recreated or reconfigured |
| Question types | all of them (`single_choice`, `multiple_select`, `true_false`, `short_answer`, `numeric`, `ordering`, `matching`, `open_ended`, `poll`) |
| Rich questions | questions with images, diagrams, tables and maths render as before; the hint is plain guidance text |
| Devices | the panel is inline and responsive (desktop, tablet, mobile); it never covers an answer field |
| Existing papers | a question with no hint simply shows no control; behaviour is otherwise identical to before |

## 3. Data model (migration `0077_question_hints.sql`)

One additive table, no change to any existing table, column or row:

```
question_hints
  id, organization_id (FK organizations, cascade)
  exam_id      (FK exams, cascade) — NULL = bank-wide for the question;
                                     set = overrides the bank hint for THAT exam
  question_id  (FK questions, cascade)
  level        1–3 (gentle clue → method reminder → guided next step)
  body         8–800 characters, trimmed by a trigger
  body_doc     reserved for rich hint content (not rendered yet)
  status       draft | approved | published | archived
  source       manual | ai
  created_by / approved_by (FK profiles), approved_at, published_at,
  created_at, updated_at
```

Integrity:

* `uq_question_hints_bank (organization_id, question_id, level) WHERE exam_id IS NULL`
* `uq_question_hints_exam (exam_id, question_id, level) WHERE exam_id IS NOT NULL`
* `question_hints_review_shape` CHECK — `approved`/`published` require a reviewer
  and a decision instant; `published` also requires a publication instant.
* `guard_question_hint()` trigger — the hint's organisation must be the
  question's organisation, and (when set) the examination's organisation; the
  reviewer/publication instants are stamped server-side, `published_at` is
  cleared on un-publishing, and the body is trimmed.
* Indexes: published lookups by question and by examination, plus
  `(organization_id, status)`.
* RLS: enabled with four policies — Super Admin, organisation content authors
  (`can_create_content`), and a candidate-scoped SELECT limited to published rows
  of their own examination.
* `platform_settings.exam_hints_policy = {"enabled":true,"max_levels":3,"require_review":true}`
  (inserted, never overwriting an existing value). `enabled = false` hides hints
  from candidates without touching a single examination.

Shared questions: a hint attached to one examination shadows the bank hint **for
that examination only**; editing it can never change another examination.

## 4. How a candidate receives a hint

1. `/api/exam/state` attaches `hints: [{ level, text }]` per question in the
   same response — one extra query per paper, not one per question. A hint
   failure degrades to “no hints”; it cannot fail the paper.
2. If the page was already open when a hint was published, the panel asks
   `GET /api/exam/hint?attempt_id=…&question_id=…` once. That route
   * requires the attempt token (header, never a URL),
   * requires `attempt.status = 'in_progress'` (409 otherwise),
   * requires the question to belong to that attempt's paper (404 otherwise),
   * returns only `{ level, text, doc }` of `status = 'published'` rows.

Neither path writes anything. There is no save, submit, timer, integrity or
session call in the hint flow, so opening a hint cannot submit a paper, move a
countdown, record an incident, drop an answer or reload the page.

## 5. Authoring, review and removal

`/admin/examinations/hints` (Super Admin console → Examinations → Examination
Hints, and the “Question hints” button on the examination dashboard):

* filter by examination/status and search the hint text;
* pick an examination to list its questions, then write a level-1/2/3 hint and
  **save as draft**;
* **Publish** (or archive / restore to draft / delete a non-published draft);
* edit draft text inline; published text is immutable (archive first, then write
  the corrected hint) so a student never sees text change mid-exam;
* every create/edit/publish/archive/delete is written to `audit_logs`
  (`exam.hint_created`, `exam.hint_edited`, `exam.hint_published`, …) with the
  actor and scope.

Answer-leak guard: before a hint can be saved or published, `findHintLeaks()`
blocks text that repeats a correct option's full wording and warns on accepted
answers. The same guard runs on AI drafts.

AI drafting: reuses the existing provider boundary (`ai-marking.ts`
`readProviderConfig` / `modelJsonTransport`). With no credential the button is
not a button — the page states that drafting is unavailable and nothing is
generated. With a credential, the model returns 1–3 drafts which are sanitised
(the model never sees the answer key; leaking drafts are discarded) and stored as
`status='draft', source='ai'`. A human must publish.

Manually written hints are always available — AI is optional.

## 6. Protecting students who are mid-exam

* The migration is additive: one new table, its policies/trigger and one
  defaulted settings row. No existing table is altered, nothing is dropped,
  truncated or rewritten, and no attempt is read or written.
* `set lock_timeout = '5s'` makes the migration abort instead of waiting on a
  lock held by live traffic.
* The examination payload and save/submit routes are unchanged apart from the
  additive `hints` field; answer comparison, timers, deadlines, grading and
  proctoring are untouched.
* No client is forced to reload. A paper opened before the deployment keeps
  working; a student who reloads (for any reason of their own) gets the control.
  On a paper opened *after* deployment, a hint published later is fetched on
  demand — still without reloading.
* No session, token, attempt, answer or draft is invalidated by the migration or
  the deployment.

## 7. Rollback

```sql
drop table if exists public.question_hints;            -- hints only
delete from public.platform_settings where key = 'exam_hints_policy';
```
No other object is affected. Removing hints leaves every examination, question,
attempt, answer and score exactly as it was.

## 8. Tests

| suite | covers |
|---|---|
| `scripts/test-exam-hints.mjs` | candidate projection (no ids/authors/statuses), level bounds, bank/exam shadowing, cross-exam isolation, non-published exclusion, policy defaults, answer-leak guard, AI prompt/refusal/draft sanitisation; **migration 0077 in PGlite** (tenant guard, unique scope/level, reviewer requirement, publication instants, trimming/bounds, cascade, no examination rewritten); wiring assertions for the state payload, the hint route, the panel and the admin actions |
| `scripts/test-exam-hints-ui.mjs` | React renderer: closed by default, instant use of bundled hints (zero requests), progressive levels, hiding, exactly one request per question without bundled hints, token never in the URL, network-failure retry, honest empty state, malformed-payload sanitisation, no control on a submitted attempt, and no non-hint endpoint ever called |

## 9. Known limitations

* Hints are plain text; `body_doc` exists for future rich hints but is not
  rendered in the student panel yet.
* A hint published mid-exam reaches an already-open page the first time the
  student opens the panel for that question (on demand) — it is not pushed.
  No real-time subscription was added deliberately, to avoid extra load and
  because a hint is not time-critical.
* AI drafting requires a model credential in the deployment; without one the
  feature remains fully usable manually.
* Institutional timezone is not stored anywhere in the schema, so timestamps in
  the console render in the viewer's local timezone (unchanged from the rest of
  the console).
