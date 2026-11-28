# AI Assistant — final end-to-end audit report

Date: 2026-11-28
Merged: PR #124 → `main` `6e7f950` (previously #123 → `052bdac`)
Production: `dpl_93pLuX3EzC5DDEKV4yKp4hp3LNTM`, sha `6e7f950`, state **READY / PROMOTED**, alias `evalora-edu.online`

---

## 1. Defects and root causes

Each defect was reproduced by **executing** the real `planFromRules`, `buildExamPlan`
and `createQuiz` code — compiled with the project's own settings and called from Node —
not inferred from a test suite. The suite was green (199 suites) throughout every one
of these defects, which is itself the finding: **a passing suite does not prove the
workflow works.**

The service layer was sound in every case. The broken layer was the **intent router
and the arguments it passed to `createQuiz`**.

| ID | Observed behaviour | Root cause |
|----|--------------------|------------|
| D1 | "Create 10 Grade 9 MYP mathematics questions…" planned **one** question | `/(\d{1,2})\s*questions?/` required the digits to touch the noun; "10 Grade 9 MYP mathematics questions" has four words between them, so nothing matched and the default `1` applied |
| D2 | "with different difficulty levels" produced a uniformly **medium** batch | the phrase was never read; `generate_question` accepted a single `difficulty` only |
| D3 | "create **ten** questions" planned one | only digits were parsed; every spelled-out number was lost |
| D4 | "simultaneous equations" silently vanished from the plan | an unresolvable topic word was dropped and the rest of the instruction executed anyway |
| D5 | a **fractions** quiz produced an **algebra** quiz, saved as a success | `createQuiz` passed `topics: undefined as unknown as TopicKey[]`, so `buildExamPlan` fell back to the grade's default topics. This is worse than a refusal: a plausible object about the wrong subject |
| D6 | a 20-minute quiz with four options was stored as 10 minutes of numeric items | `durationMinutes: 30` and `time_per_question_seconds: 60` were hardcoded; there was no options argument at all; and the fractions family authored only numeric percentage questions |
| D7 | "change its duration to 90 minutes" → *"I could not turn that into an action EVALORA can perform"* | no intent rule produced `update_examination`; the handler existed but chat could not reach it |
| D8 | "analyse the last examination" refused | `analyze`, `validate` and `duplicate` all required `UUID_RE` to match the text, so a described examination was unanswerable |
| D9 | "Delete all of Oak's examinations" refused | **correct** — recorded as evidence that the fix for D7 did not become an assistant that acts on anything |
| D10 | `"algebra"` resolved to no topic at all | the word was absent from the `algebraic_expressions` alias list, so "10 questions on algebra" was refused |
| D11 | a retried submission could author the paper **twice** | the composer minted `crypto.randomUUID()` on every attempt and the engine never consulted the `request_id` it recorded; every write handler creates a new object, so a double click duplicated the work |

Two further defects were found while fixing D6 and are recorded because they were
in the shipped code path:

- A "10-**question** quiz" (hyphenated compound adjective) parsed as no count at all.
- "20-minute" parsed as **1200** minutes: the minutes pattern missed the hyphen and
  fell through to an hours branch that matched nothing while a bare digit was still
  picked up. A quiz that said 20 minutes was going to be stored as 20 hours.

## 2. Fixes

**One extractor, shared.** `countFrom(text, noun)` replaces both ad-hoc regexes and
is used by `create_quiz` and `generate_question`. It tolerates the words a teacher
inserts between the number and the noun, reads one…twenty as well as digits, handles
the hyphen in "10-question", and is bounded to 1–60.

`durationMinutesFrom(text)` likewise replaces two divergent parsers and is used by
every rule that needs a duration.

**Difficulty.** `difficulty_mix` is part of the `generate_question` contract and is
planned **only** when the sentence asks for a spread, so "5 hard questions" still
means hard and is not turned into a mixture. `normaliseMix` re-normalises whatever
arrives so the three shares always sum to 1.

**Topics.** The named topic is forwarded to `buildExamPlan`. A topic the generator
cannot serve is now refused **with the supported list** rather than silently
substituted. `"algebra"` was added to the alias list.

**Quizzes.** Duration is read in every form ("20-minute", "20 minutes", "20 mins",
"2 hours", "90 minutes") and converted to `time_per_question_seconds`, so a 20-minute
ten-question quiz is 120 s per question instead of the old hardcoded 60 (which stored
a ten-minute quiz claiming to be twenty). `options_per_question` is a real argument,
carried into the generator as `preferredOptions` so the shape is honoured **while the
questions are authored**, not checked afterwards. The fractions family now authors
four-option multiple-choice items built from a genuinely reducible fraction, with
distractors that model real errors (inverting, cancelling in the numerator only,
doubling the denominator, adding one to both parts). A shape the generator cannot meet
is refused **before anything is written**.

**Editing.** A new `update_examination` rule reaches the existing handler, and
`update`/`validate`/`analyze` all accept a `reference`. `resolveExaminationReference`
queries through a real scoped read: it only ever considers the caller's own
organization, treats "the last/latest/newest" as the most recent, treats a quoted
string as an exact name, narrows on a status or grade word, and **refuses ambiguity
with the candidates listed** rather than choosing one and changing a paper the teacher
did not mean.

**Idempotency.** The composer holds one request id per submitted instruction and
reuses it on retry; a successful turn clears it. The engine looks for a completed
execution with the same request id, tool, acting human and organization **and the same
arguments digest**, and returns that recorded result marked `replayed` instead of
running the tool again. Only completed writes replay — preview mode, a failed attempt
and an approved operation keep their own paths, so the existing approval guarantee
(`ai_claim_approval`, `uq_ai_executions_approval`) is untouched.

## 3. Tests and results

The new assertions were run **against the previous code first**, and failed there with
exactly the audited symptom (`Test A: actual 1, expected 10`). Each fix was then
reverted individually to confirm its test fails without it.

| Gate | Result |
|------|--------|
| `scripts/test-ai-assistant-quality.mjs` | **39 checks** (was 24) |
| `node scripts/run-tests.mjs` | **199 suites passed, 0 failed, 8 skipped — 10,735 checks** |
| `npx tsc --noEmit` | clean |
| `npx eslint src/lib/ai/ src/app/dashboard/ai/` | clean |
| `npm run build` | ✓ compiled in 64 s |

Pre-existing, unrelated warnings left alone: 7 in `src/app/dashboard/questions/actions.ts`,
1 in `src/app/dashboard/exams/actions.ts` (`isPlanLimitError` imported, unused). Both were
proven identical with and without this work by a `git stash` comparison.

## 4. Question evidence (Test A)

> "Create 10 Grade 9 MYP mathematics questions on linear equations, with different
> difficulty levels, correct answers and worked solutions."

| Check | Result |
|-------|--------|
| Plan | one step, `generate_question`, `count: 10` |
| Questions generated | **10** |
| Difficulty spread | **3 easy / 4 medium / 3 hard** |
| Every item has a correct answer key | yes |
| Every item has a worked solution | yes |
| LaTeX clean | yes — fractions render `$\dfrac{a}{b}$`, balanced delimiters enforced by the validator |

## 5. Examination evidence (Test B)

> "Create a complete Grade 9 MYP Mathematics examination on linear equations and
> simultaneous equations, two sections, 20 questions, 100 marks, answer keys and a
> marking scheme. Save it as Draft."

| Check | Result |
|-------|--------|
| Plan | one step, `create_examination` |
| Questions | **20** |
| Sections | **2** |
| Total marks | **exactly 100** |
| Validation | **0 errors** |

## 6. Quiz evidence (Test C)

> "Create a 10-question Grade 8 mathematics quiz on fractions, with four options per
> question, one correct answer, scoring and a 20-minute duration."

| Check | Result |
|-------|--------|
| Topic forwarded | `fractions_percentages` (previously dropped → algebra) |
| Questions | **10** |
| Option count | **4 on every item** (histogram `{"4":10}`) |
| Correct answers | exactly **1** per item |
| Answer keys recomputed independently from the prompt | 36 items sampled across 12 seeds, **0 defects** |
| Duplicate options | none |
| Validation | **0 errors** |
| Duration | **20 minutes** → 120 s per question |

## 7. Dashboard visibility

**Unverified in the browser.** This sandbox has no network egress to Supabase
(`curl` to `nqxqisjtbfsratgztmch.supabase.co` returns `000`) and no local instance, so
no acceptance run could be executed against the live database. What *is* established:

- The handlers persist through the **same services** the dashboard uses
  (`saveQuestion`, `saveQuiz`, `saveExam` from `src/app/dashboard/*/actions.ts`), not a
  parallel path, and the summary is built from the id those services returned — a test
  asserts the `saveQuiz` call precedes the `quiz_id: saved.id` it quotes.
- `create_examination` sets `status: "draft"`, and a draft is a visible row in `exams`,
  not a hidden state.
- The DEMO organization currently holds 13 questions, 2 examinations and 3 quizzes;
  the existing draft examination `833a3cf7-38b9-4d36-92fe-3731c63b0c05` is a real,
  readable record.

## 8. Agent operational verification

Carried forward from `docs/AI_AGENT_VERIFICATION_2026-11-28.md`, re-checked here:

| Item | State |
|------|-------|
| Agent | `9a415c16-eb6e-4486-bc34-8bc0a1e52e5d`, client `api`, status `approved` |
| Organization | EVALORA DEMO ACADEMY (safe org) |
| Credential | prefix `evalora_api_NTyj`, digest `39c891ea…a15fa7` |
| Permissions | 9 narrowed; effective `exams.view` + `questions.create` — no over-privilege |
| Shared core | same registry (`src/lib/ai/tools.ts`) and engine as the native assistant |
| Journal | 1 real operation row; the earlier synthetic row `7273d717…` is still SQL-written |
| Second agent | not created |
| Credentials exposed | never — only the prefix appears anywhere in this repository |

## 9. Production deployment

| Item | Value |
|------|-------|
| Commit | `6e7f950edfbf5fb7b1015f5cfa13b0a643dcc098` |
| Deployment | `dpl_93pLuX3EzC5DDEKV4yKp4hp3LNTM` |
| State | **READY**, `readySubstate: PROMOTED` |
| Alias | `evalora-edu.online` |
| Previous | `dpl_4en38jVmpkfg6JBTWycUWYbdxpyi` @ `052bdac` — confirmed **READY / PROMOTED** this session (it had been left INITIALIZING) |

## 10. Oak protection

| Table | Before | After |
|-------|--------|-------|
| Oak examinations | 50 | **50** |
| Oak questions | 2479 | **2479** |
| Oak attempts | 308 | **308** |

No migration was required for this work, so nothing was applied to the live schema.
Every write in this PR is inside EVALORA DEMO ACADEMY paths.

## 11. Remaining blockers

1. **Acceptance tests A–E are not proven against the live database.** The planning and
   generation layers are proven by execution, and the handler code was read line by
   line, but the write itself was never observed. Stated plainly: unverified, not done.
2. **Agent journal.** Row `7273d717-8f4a-4bb4-bb58-b92bdd5152bf` is still SQL-written;
   no genuine call has gone through MCP or the REST route.
3. **Agent credential rotation.** The prefix `evalora_api_NTyj` token was discarded, so
   that credential can never authenticate. A new one must be minted from
   `/dashboard/ai/agents`; the old row should be revoked there, not in SQL.
4. **`docs/AI_LIVE_VERIFICATION_2026-11-28.md`** still says Blocked and should be
   updated or withdrawn once (1) is resolved.
5. **Full LaTeX was deferred by instruction** — notation is fractions-only, as
   authorised. Powers, roots, indices, geometry diagrams and function graphs are not
   authored by any family yet; a request for them is refused rather than approximated.
