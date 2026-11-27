# EVALORA AI — Production Verification Report

**Date:** 2026-11-27
**Scope:** finalisation of the AI core already built on branch `arena/87854598-evalora`
**Verdict:** `DEPLOYED — PARTIALLY VERIFIED`

---

## A · GitHub

| Item | Value |
|---|---|
| PR | [#119](https://github.com/fideliashadyy17-gif/EVALORA/pull/119) — merged |
| Merge commit | `e66b077148db6b55667a384213e9804e2f28c29d` |
| Merged at | 2026-11-27T22:20:42Z |
| Base → head | `main` ← `arena/87854598-evalora` |
| Commits merged | `d4cdc41` AI core · `cdc75b5` tracker · `cf7269c` agent-identity fix |
| Size | 64 files, +11,843 / −489 |
| State at merge | `MERGEABLE`, `CLEAN`, no conflicts |

**CI on the merged head (`cf7269c`) — 5/5 green:**

| Check | Result | Time |
|---|---|---|
| build-windows | ✓ pass | 2m29s |
| exam-browser | ✓ pass | 5m0s |
| screenshots | ✓ pass | 2m39s |
| Vercel | ✓ pass | — |
| Vercel Preview Comments | ✓ pass | — |

**Follow-up PR [#120](https://github.com/fideliashadyy17-gif/EVALORA/pull/120) — open, not merged.**
`47e1165` — plan-module gate on API + MCP. 4 files, +113/−2. Checks: build-windows ✓, Vercel ✓, Vercel Preview Comments ✓. `exam-browser` and `screenshots` are **path-filtered** to the examination and landing surfaces (`.github/workflows/exam-browser.yml`), so they correctly do not run for an AI-only change; this is not a skipped failure.

---

## B · Vercel

| Item | Value |
|---|---|
| Project | `evalora` (`prj_1PJb6jCOZPKQSxTTWkE6Gx9l6Ax7`, team `team_Wm3wd7SMXAgNyJggxDHo3l32`) |
| Production deployment | `dpl_HUCrnHYpysANrsbz1PJMhJYhuneU` |
| State | **READY**, `readySubstate: PROMOTED`, `buildSkipped: false` |
| Production commit | **`e66b077`** — matches the #119 merge commit exactly |
| Aliases assigned | `evalora-edu.online`, `www.evalora-edu.online`, `*.evalora-edu.online`, `ois.evalora-edu.online`, `evalora-six.vercel.app` |
| Build | turbopack, node 26.x, 6 lambdas, ready in 102 s |
| Previous production | `dpl_6eY3bxBDfLhxWmYpmp44uUWfp1gG` (PR #118, `352b65b`) |

**Endpoints verified live on production: NOT VERIFIED.** This sandbox's egress allowlist permits only `github.com`, `codeload.github.com`, `api.github.com`, `registry.npmjs.org`, `*.pypi.org`, `*.pythonhosted.org`. TCP to `evalora-edu.online:443/80` and `*.supabase.co:443` is closed by policy (`SSL_ERROR_SYSCALL` / empty response at the socket), so no HTTP request could be made against the deployed app from this environment. The deployment facts above come from the Vercel API, which is reachable through the connector.

---

## C · Native AI (`/dashboard/ai`)

**Status: NOT VERIFIED IN A BROWSER.**

- The page, agent console, approvals queue and activity log exist and are gated in code: `requireModule(entitlement, "ai_assistant", "/dashboard?e=module")` at `src/app/dashboard/ai/page.tsx:27`.
- `runAssistantTool` (`src/app/dashboard/ai/actions.ts`) calls the shared executor with a **cookie-bound** client — correct for a browser request, and deliberately different from the agent path.
- **Blocked by the environment:** no browser. `npx playwright install` cannot reach `cdn.playwright.dev`; `@sparticuz/chromium` launches only if `libnss3`/`libnspr4` are present, and they are absent while `apt` mirrors are unreachable. No interactive session for `starboyboy2017@gmail.com` (the only Oak owner) was obtainable without the owner's password or an email round-trip, neither of which is available here and neither of which will be fabricated.

---

## D · External agent connectivity

### Credentials and identity

- Token format `evalora_{client}_{32 random bytes base64url}`, stored only as a SHA-256 digest plus an 18-character prefix; shown once at creation (`src/lib/ai/agents.ts`).
- **No agent credential was created against production**, because no authenticated request could be made from this environment (see B). No token values were invented or replayed.

### The blocker found and fixed in this session

`authenticateAgent` built its request client with `createClient()`, which reads the **caller's cookies**. An agent request carries a bearer token and no cookies, so every agent received an **anonymous** Supabase client, failing silently in two ways:

- `resolvePermission` verifies the caller through `client.auth.getUser()`; with no session it returns null, so `canOperate` inside the shared authoring services answered **false for every write** — an entitled agent was refused with "You don't have permission to …".
- RLS saw no identity, so reads returned **empty rather than refused**.

Fixed in `cf7269c` (merged, deployed):

1. `createUserSessionClient(admin, userId, email)` mints a single-use magic-link token with the admin API and exchanges it for a real session owned by the agent's owner; the minted user id is asserted against the owner before use. Failure → **401**, never a downgrade to the service role.
2. `ToolRuntime.authorize` carries that identity into `saveQuestionForActor`, `savePaperForActor` and `createExaminationFromForm`, which keep `canOperate` for browser callers and use the supplied resolver for agents.
3. `permissionResolver` gained the module half of the check and is created once per request, so discovery and invocation cannot disagree.
4. `executeTool` refuses to run when the request client has no verified identity, or when that identity is not the person the call is attributed to.

`scripts/test-ai-agent-identity.mjs` (14 checks) drives the real `authenticateAgent` against a stub that records **which identity every query ran under**, and asserts zero queries run anonymous, that the cookie client is never used, and that an unverifiable owner resolves to a refusal.

### REST and MCP surfaces

| Item | Status |
|---|---|
| `GET /api/ai/v1` discovery (unauthenticated) | Implemented; **not verified against production** |
| `GET /api/ai/v1/tools` per-credential list | Implemented; **not verified** |
| `POST /api/ai/v1/tools/<name>` | Implemented; **not verified** |
| `POST /api/mcp` streamable HTTP, protocol `2025-06-18` | Implemented; **not verified** |
| Real external MCP client end-to-end | **Not verified** |
| ChatGPT / Claude Desktop connection | **Not verified** — requires an outbound-reachable deployment and a credential created by the owner |

**Distinction, stated plainly:** the MCP **server** is implemented and unit-tested (`initialize`, `ping`, `tools/list`, `tools/call`, JSON-RPC error codes, protocol-version negotiation — 11 + 12 checks). The MCP **integration** with a real external client is **not** complete or verified. Those are different claims.

---

## E · Examination creation

**Status: PARTIALLY VERIFIED — the generator is proven; the persisted exam is not.**

The requested prompt ("Create a Grade 9 Mathematics examination on linear equations and algebraic expressions. Include multiple sections, a reasonable number of questions, marks, a marking scheme and a duration. Save it as a draft.") exercises `create_examination`, whose content path is proven in-process:

- Intent routing maps that phrasing to `create_examination` (`test-ai-core-registry.mjs`).
- `buildExamPlan` produces sections, questions, marks and a duration; answers are **computed** by the platform scorer, not model-invented, and every generated question is re-checked (`test-ai-core-registry.mjs`, 27 checks).
- `materializeExam` writes through the shared services (`createExaminationFromForm`, `savePaperForActor`, `saveQuestionForActor`) and creates a **draft**, never auto-published.

**Not verified:** persistence to the production database, visibility in the real exam UI, and both-pathway equivalence. All three require an authenticated request against the deployed app or the database, neither reachable from this sandbox. **No exam was fabricated or claimed.**

**Provider dependency:** production has **no AI model credential**. The Vercel environment for `evalora` contains no `AI_CORE_OPENAI_API_KEY`, `AI_CORE_ANTHROPIC_API_KEY`, `AI_CORE_GEMINI_API_KEY`, `AI_MARKING_PROVIDER` or `AI_MARKING_API_KEY`. With `source: "auto"` the tool falls back to EVALORA's deterministic generator and **says so in the response**; with `source: "model"` it returns `unconfigured`. Nothing is presented as model output when none was produced. To enable model authoring, add one of those keys to the production environment and redeploy.

---

## F · Security

| Property | Evidence | Status |
|---|---|---|
| Token never stored in clear | SHA-256 digest + 18-char prefix only | Verified (code + migration) |
| Token resolver service-role only | `ai_resolve_agent` EXECUTE granted to `service_role` alone | Verified (production DB) |
| Pending / revoked token cannot resolve | Resolver requires `status = 'approved'` and `revoked_at IS NULL` | Verified (`test-ai-agent-identity`, production probes) |
| Agent cannot exceed its owner | `access_has_permission(p_user_id = owner, …)` then agent's own allow/deny lists on top | Verified |
| Agent cannot cross tenants | Organization comes from the agent row, never the request; handlers' 35 `.from()` sites are org-scoped or id-keyed via `requireOwned` | Verified (code audit) |
| Anonymous client refused | `assertRequestClientIdentity` in `executeTool` | Verified (`test-ai-agent-identity`) |
| Owner session bound and checked | Minted id asserted against owner; refusal is 401, not downgrade | Verified |
| Plan module enforced everywhere | Dashboard `requireModule`; API + MCP `aiModuleRefusal` (PR #120) | Fixed; PR #120 open |
| Approvals single-use | `ai_claim_approval` marks `consumed_at` atomically | Verified (production DB, rolled-back probe) |
| Rejected approval not revivable | Probe attempted revival → refused | Verified (production DB) |
| Expired approval non-executable | Expiry sweep verified by probe | Verified |
| Activity logged | `ai_activity` written by the executor | Verified (unit); not verified on production |
| Credentials absent from responses/logs | `summariseArguments` redacts; token returned once, at creation only | Verified (code) |
| `createExam` form guard | `canOperate(ctx, org.id, "exams.create", "examinations")` restored in `src/app/dashboard/exams/actions.ts` | Verified |

**No destructive test was run against production examinations or student records.** All database probes were rolled back. Oak's MYP4/MYP5 Version C exams, questions, candidates, attempts, answers, marks, results and publication states were not touched: no write was issued against any examination table.

---

## G · Testing

| Suite | Result |
|---|---|
| `npm test` (full) | **198 suites passed, 0 failed, 8 skipped — 10,695 checks** |
| `npx tsc --noEmit` | clean |
| `npx eslint` (touched paths) | clean |
| `npm run build` (turbopack) | success |
| `test-ai-agent-identity.mjs` | 14 checks ✓ (new) |
| `test-ai-plan-module-gate.mjs` | 11 checks ✓ (new) |
| `test-ai-mcp-protocol.mjs` | 11 checks ✓ |
| `test-ai-mcp-server.mjs` | 12 checks ✓ |
| `test-ai-core-registry.mjs` | 27 checks ✓ |
| CI: build-windows, exam-browser, screenshots, Vercel | 5/5 ✓ on the merged head |

The 8 skipped suites are pre-existing and unrelated to this work. Bare `npx next build` (webpack) still fails on `node:crypto`; the production build is turbopack and succeeds — documented, not a regression.

---

## H · Remaining blockers (actual)

1. **Sandbox egress.** Production and Supabase are unreachable from this environment, so surfaces A, B, C, D and E could not be exercised live. This is a limitation of where the work was performed, not of the deployment.
2. **No AI model credential in production.** Model-authored examination content is unavailable until `AI_CORE_*` (or `AI_MARKING_*`) is set. The deterministic generator works and labels itself honestly.
3. **No browser.** Playwright's browser CDN and the apt mirrors are both unreachable, and the only installed Chromium lacks `libnss3`/`libnspr4`. Browser-level UI verification (dashboard, exam editor, MCP client) could not run here.
4. **External client integration unverified.** A real ChatGPT/Claude MCP connection requires a credential created by the owner and a client that can reach the deployment; neither was available.
5. **PR #120 unmerged.** The plan-module gate is fixed and tested but not in production until it is merged and deployed.

---

## I · 27-tool audit

Registry is single-source (`src/lib/ai/tools.ts`); REST, MCP and the native assistant all call the same `executeTool`. Listed exactly as the registry reports:

| # | Tool | Permission | Kind | Approval | Coverage |
|---|---|---|---|---|---|
| 1 | `get_org_context` | dashboard.view | read | — | Partially — registry only |
| 2 | `list_examinations` | exams.view | read | — | **Verified functional** |
| 3 | `get_examination` | exams.view | read | — | Partially |
| 4 | `create_examination` | exams.create | write | — | **Verified functional** (generator + services) |
| 5 | `validate_examination` | exams.view | read | — | Partially |
| 6 | `update_examination` | exams.edit | write | — | Partially — no dedicated suite |
| 7 | `duplicate_examination` | exams.create | write | — | Partially — no dedicated suite |
| 8 | `publish_examination` | exams.edit | write | **sensitive** | **Verified functional** (approval path) |
| 9 | `compare_examinations` | exams.view | read | — | Partially — no dedicated suite |
| 10 | `get_question_bank` | questions.view | read | — | **Verified functional** (service suite) |
| 11 | `create_question` | questions.create | write | — | **Verified functional** (service suite) |
| 12 | `generate_question` | questions.create | write | — | **Verified functional** |
| 13 | `list_quizzes` | quizzes.view | read | — | Partially |
| 14 | `get_quiz` | quizzes.view | read | — | Partially |
| 15 | `create_quiz` | quizzes.create | write | — | **Verified functional** (service suite) |
| 16 | `update_quiz` | quizzes.edit | write | — | **Verified functional** (service suite) |
| 17 | `get_marking_scheme` | grading.view | read | — | Partially |
| 18 | `get_student_responses` | grading.view | read | — | Partially |
| 19 | `mark_responses` | grading.edit | write | **sensitive** | **Verified functional** |
| 20 | `preview_grade_adjustment` | grading.view | read | — | Partially |
| 21 | `apply_grade_adjustment` | grading.validate | write | **sensitive** | **Verified functional** |
| 22 | `get_exam_results` | results.view | read | — | Partially |
| 23 | `publish_results` | results.publish | write | **sensitive** | **Verified functional** (approval path) |
| 24 | `get_class_statistics` | reports.view | read | — | Partially |
| 25 | `analyze_exam_performance` | reports.view | read | — | Partially — no dedicated suite |
| 26 | `list_ai_agents` | ai.manage_agents | read | — | Partially |
| 27 | `revoke_ai_agent` | ai.manage_agents | write | **sensitive** | **Verified functional** |

No tool is marked Verified functional on the strength of its definition alone, and none is claimed operational against production.

---

## I · Verdict

**`DEPLOYED — PARTIALLY VERIFIED`**

The AI core is merged (`e66b077`), built, and serving production on `evalora-edu.online`. Two real blockers were found and fixed — the agent path authenticating but unable to act, and the plan module gating the dashboard but not the API — each with a regression test that fails against the previous commit. The full suite, type check, lint and build are green, and CI passed 5/5 on the merged head.

Production behaviour of the three AI surfaces was **not** verified, because this environment cannot reach the deployment. Nothing in this report should be read as confirmation that a tool ran in production, that an exam was created there, or that an external client is connected.
