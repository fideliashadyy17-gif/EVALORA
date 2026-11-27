# EVALORA AI Core — audit of the existing platform (2026-11-27)

This is the mandatory pre-implementation audit for the **EVALORA Intelligence
Ecosystem** (native AI + external AI agents on one shared core). It records what
already exists, what will be reused, and what must be built. Nothing here is a
completion claim: every statement points at real code in this repository.

Baseline: `352b65b7af27bd5589852130b9105fc80b1dbdb0` (main), 191 routes,
179 migration files, 606 source files under `src/`.

---

## 1. Identity, sessions, tenancy

| Concern | Existing implementation (reused) |
|---|---|
| Session resolution | `src/lib/auth.ts` → `getSessionContext()` / `requireUser()`; memberships from `organization_members`; tenant from the `Host` header via `getTenantSlugFromHost()`. |
| Role model | Legacy column `organization_members.role` **plus** the centralized RBAC tables (`access_roles`, `access_permissions`, `access_user_roles`, `access_permission_overrides`) added in `20261125120000_rbac_system.sql`. |
| Authoritative permission check | `public.access_has_permission(uuid,uuid,text)` — deny by default, super-admin bypass, Founder ceiling, override-deny wins over grants. |
| Server-side wrapper | `src/lib/operationalAccess.ts` → `canOperate()` / `canOperateMany()` (intersects RBAC with organization module entitlements, fails closed). |
| Entitlements | `src/lib/entitlements.ts` (`getEntitlementFor`) + `src/lib/modules.ts` (`MODULE_CATALOG`, `moduleEnabled`). |
| Plan capability set | `src/lib/capabilities.ts` (`getCapabilities`), `capability-rules.ts`. |
| Audit log | `public.audit_logs` written through `src/lib/admin.ts` → `audit()`. |
| Super Admin console | `/admin/*` (96 routes), `requireSuperAdmin()`. |
| Organization workspace | `/dashboard/*` (58 routes) with `DashboardChrome` navigation filtered by `navAccess` + `navModules`. |

**Consequence for AI:** an agent must never be a shared admin identity. Every AI
call must resolve a *real* `SessionContext` (native AI: the signed-in user;
external agent: a bound human owner) so `access_has_permission` stays the single
authorization source for humans and machines alike.

## 2. Assessment domain

| Concern | Existing implementation (reused) |
|---|---|
| Question bank | `questions` + `question_options`; type registry in `src/lib/brand.ts` (`QUESTION_TYPES`); authoring in `src/app/dashboard/questions/actions.ts` (`saveQuestion`, zod-validated, tenant-checked, plan-limited). |
| Publish gate | `src/lib/questionValidation.ts` → `questionPublishIssues()` / `questionPublishError()` per type (single choice needs one key, `assess_parts` needs parts summing to the question marks, `matching` needs unique pairs…). |
| Paper / quiz | `quizzes` + `quiz_questions`; sections and `section_of` in `quizzes.settings`; **authoritative save path** `saveQuiz()` in `src/app/dashboard/quizzes/actions.ts` (zod schema, preserved settings, module + RBAC + limits, `ASSESSMENT_SOURCE_IMMUTABLE` guard). |
| Examination | `exams` (draft → scheduled → open → closed) referencing a **published** quiz; `createExam()` in `src/app/dashboard/exams/actions.ts` is the hardened creation path (plan limit, tenant-checked paper, paper completeness, randomized settings). |
| Exam sections | `exams.settings.sections` (`id`, `title`, `instructions`, `questions`, `marks`) and `quizzes.settings.sections`; per-question membership in `settings.section_of`. Randomization respects sections (`randomizeQuestionRows` in `src/lib/live.ts`). |
| Scoring / marking | `src/lib/scoring.ts` (`scoreAnswer`, per-type, typed errors), `src/lib/exam.ts` (`gradeAttemptDetailed`), rubrics + moderation in `grading_rubrics` / `grading_rubric_criteria`, AI mark **proposals** in `ai_marking_proposals` with guardrails (`0038`/`0039`). |
| Grade adjustment | `score_adjustments` ledger (`20261126133946_score_adjustments.sql`, `src/lib/scoreAdjustments*.ts`), `gradeAdjustmentLedger.ts`, consolidated in `assessment_contributions`. |
| Results | `resultLifecycle.ts`, `resultsManagement.ts`, `examResults.ts`, publish/unpublish RPC-guarded. |
| Analytics | `/dashboard/reports`, `/dashboard/myp-results`, `src/lib/mypResults.ts`, `statsSpec.ts`. |
| Math | `MathText`/`RichContent` (KaTeX), TipTap editor, `mathlive`, `src/lib/mathExpr.ts`, `mathRender.ts`, `formulaLibrary.ts`, figure/graph spec modules (`graphSpec`, `geometrySpec`, `dataTableSpec`, `vennSpec`, `probabilityTreeSpec`, `stemLeafSpec`, `statsSpec`) rendered by `src/components/{graph,geometry,…}`. |

**Consequence for AI:** generated content must be written **through these
functions**, never by inserting rows directly, and must pass
`questionPublishIssues()` before anything can be published.

## 3. Existing AI surfaces (must be extended, not duplicated)

* `src/lib/ai-marking.ts` — the provider boundary: `readProviderConfig`,
  `describeAiMarking`, `modelJsonTransport` (OpenAI/Anthropic/Gemini), strict
  `parseSuggestions` that refuses invented or out-of-range marks. **No credential
  ⇒ no output.** Reused verbatim as the model transport.
* `src/lib/examHintsAi.ts` — hint drafting on the same boundary, with the
  answer-leak guard.
* `src/lib/questionGeneration.ts` — the *deterministic* question generator
  (seeded, curriculum-aware families, computed answers, misconception
  distractors). This is the honest offline path: it produces real, markable
  questions with no provider credential.
* `/admin/questions/generate` — the existing generation UI wired to the above.

**Gap:** there is no orchestration layer, no shared tool registry, no agent
identity, no MCP server, no execution audit, and no AI examination builder.
Phase 3 of `docs/EXECUTION_TRACKER.md` correctly records "AI Studio" as not
implemented; the native assistant and agent connectivity are new work.

## 4. Data-protection constraints discovered in the repository

* Production holds live papers (Oak MYP4/MYP5 Version C) and candidate attempts.
* Migrations 0024–0031, 0036, 0038–0039, 20261123210843 (`immutable_exam_paper_sources`)
  and `ASSESSMENT_SOURCE_IMMUTABLE` deliberately lock content that an in-progress
  attempt depends on.
* `docs/EXECUTION_TRACKER.md` states preview and production share a database.

**Therefore:** the AI core must never mutate an existing exam's question
content. It creates **new drafts** and new quizzes; improvement of a published
exam is expressed as a *duplicate* (new draft) plus a diff, never an in-place
rewrite of a paper that candidates may be sitting.

## 5. What is reused vs. what is new

| Deliverable | Status | How |
|---|---|---|
| Model abstraction + credentials | **Reuse** `ai-marking.ts` transport; **add** a thin resolver that also accepts `AI_CORE_*` variables. |
| Permission model | **Reuse** `access_has_permission` via `canOperate`; agents bind to a real user, never a synthetic admin. |
| Validation | **Reuse** `questionPublishIssues`, `scoreAnswer`; **add** a blueprint/points/render validator in front of writes. |
| Audit | **Reuse** `audit_logs`; **add** `ai_executions` (per tool call, latency, status, risk, arguments digest, result digest). |
| Knowledge/context | **New** — live, organization-scoped catalogue (classes, subjects, curricula, question types, allowed types from Question Studio, modules, permissions). |
| Action engine / tool registry | **New** — one registry consumed by native AI, REST API and MCP. |
| Native assistant | **New** — `/dashboard/ai` + `/api/ai/assistant`. |
| External agents | **New** — `ai_agents`, hashed credentials, scopes, approvals, REST `/api/ai/v1/*`, MCP `/api/mcp`. |
| Human approval | **New** — `ai_approvals` with risk classification. |

## 6. Non-goals (honesty boundaries)

* No fake "connected model": if no key is configured the assistant says so and
  offers the deterministic generator instead.
* No claim that automated checks prove mathematical correctness. They check
  structure, totals, key presence and render-ability; a human still reviews.
* No silent grade changes. AI marking remains a *proposal* until a human accepts.
