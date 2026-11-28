# Native AI assistant — end-to-end audit, 2026-11-28

Scope: production at `052bdac`, the five acceptance tests in the final brief, and
the user experience they describe. Every finding below was reproduced by running
the real `planFromRules` / `buildExamPlan` / `createQuiz` path, not read off a
test name.

Baseline: 199 suites green, `tsc`/`eslint`/`next build` clean. **None of that
catches any defect listed here** — they are all about *what the assistant was
asked to make versus what it would make.*

---

## D1 — The test-A instruction asks for 10 questions and plans 1

```
"Create 10 Grade 9 MYP mathematics questions on linear equations, with
 different difficulty levels, correct answers and worked solutions."
   → count: 1
```

The extractor is `/(\d{1,2})\s*questions?/` — the digits must be immediately
followed by the word "questions". A teacher writes "10 Grade 9 MYP mathematics
questions", so the count is lost and the default of 1 is used. `"Create 10
questions…"` happens to work, which is why the existing suite passes.

Ten questions would also be requested but the second defect makes the rest
impossible.

## D2 — The same instruction collapses every question to one difficulty

`difficulty: "medium"` is planned, so `generate_question` builds
`{medium: 1}`. "With different difficulty levels" is silently discarded. There is
no difficulty-mix argument on the tool at all, so the request cannot be expressed.

## D3 — "Ten" is not a number

`"Create ten questions on linear equations"` → `count: 1`. Only digits are read.

## D4 — Test B asks for simultaneous equations and gets an implicit no-op

The examination router resolves topics through the catalogue. `simultaneous
equations` is not a key and is not an alias of `linear_equations`, so the phrase
is dropped and the paper covers only the topics that did resolve. The teacher is
never told. (Same class of defect as the trigonometry one, but silent here
because *something* resolved.)

## D5 — Test C creates an **algebra** quiz when asked for **fractions**

This is the most serious content defect found.

```
router  → create_quiz { generate: { question_count: 8 } }     // no topics
handler → buildExamPlan({ topics: undefined })                // grade fallback
result  → Expand 5(4x + 7). / Solve for x: 2x + 4 = 14. / …
```

`create_quiz` never forwards a topic, so a "fractions" quiz is filled with
algebra. The worked check:

```
topics: undefined                       → Algebra | Expand 5(4x + 7).
topics: ["fractions_percentages"]       → Number  | Find 5% of 60.
```

That is worse than a refusal: the object is created, saved, looks plausible, and
is about the wrong subject.

## D6 — Quiz duration and options are ignored

- The router plans no duration; `create_quiz` hardcodes `durationMinutes: 30`.
- `time_per_question_seconds: 60` is hardcoded, so "20 minutes" over 10 questions
  (120 s each) is contradicted by the stored settings.
- "four options per question" is not honoured or even parsed.
- The quiz is saved as `draft` only — a quiz that is never published cannot
  become an examination, because `lock_exam_paper_on_attach` requires
  `quizzes.status = 'published'`.

## D7 — Test D ("modify an existing examination") is refused outright

```
"Replace two questions in the Grade 9 linear equations examination and change
 its duration to 90 minutes."
   → 0 steps, "I could not turn that into an action EVALORA can perform."
```

`update_examination` exists and supports `duration_minutes` and `question_ids`,
but no rule ever produces it. Editing — an everyday teacher action — is
unreachable from chat.

## D8 — Analysis and correction requests are refused

```
"Analyse the results of the last Grade 9 examination."   → refused
"Improve the existing examination and fix any wrong answers." → refused
```

Both have handlers (`analyze_exam_performance`, `validate_examination`,
`update_examination`) but the rules require a UUID in the text. A teacher says
"the last one".

## D9 — A destructive instruction is refused, which is correct

```
"Delete all of Oak International School's examinations." → refused, 0 steps
```

Good: there is no delete tool, and the refusal is honest. This is the behaviour
Test E needs, and it already works. It is recorded so the fix for D7/D8 does not
accidentally gain one.

---

## What is actually sound

- The engine now journals refusals correctly (PR #121) — no false success.
- `create_examination` validates before persisting and refuses impossible marks.
- `create_question` / `generate_question` save through the real
  `saveQuestion` service and label `creation_method: ai_generated`.
- `update_examination`, `duplicate_examination`, `create_quiz`, `saveQuiz` all
  exist and are wired to real services.
- Generation of a 20-question 100-mark paper validates with `errors: []`.
- Tenant scoping is enforced in every handler inspected.

None of the above is in question. The defect is the layer *between* the teacher's
sentence and those services.

---

## Plan

1. One count extractor, shared by every rule, tolerant of words between the
   number and the noun, and of spelled-out numbers.
2. A difficulty-mix argument on `generate_question`, planned from the sentence.
3. Topics forwarded by `create_quiz`; duration and options honoured.
4. An `update_examination` rule reachable without a UUID, resolving "the last
   one" through a real query.
5. An analysis/correction rule that resolves a named-or-latest examination.
6. Report unresolved topic words instead of dropping them.

Each gets an assertion in `test-ai-assistant-quality.mjs` **written to fail
against the current code first**.
