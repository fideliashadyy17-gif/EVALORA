# EVALORA — Testing Strategy & Load-Test Plan

## What is verified today

- **Build**: `npm run build` passes (TypeScript strict, all routes compile).
- **Scoring unit tests** (run during development): single-choice,
  multiple-select partial credit & penalties, short-answer normalization,
  numeric tolerance, ordering, matching partial credit, open-ended → manual.
  The engine is pure TypeScript (`src/lib/scoring.ts`) — keep extending
  these with `tsx` or your preferred runner.
- **Database**: migration applied cleanly to the production Supabase project;
  RLS enabled on all 26 tables; seed plans/settings present.
- **Deployment**: the existing Vercel production deployment is READY. No new production deployment was made for the Oak event work below.

## Current verification — 2026-11-05 (working branch `arena/21f3ffe0-evalora`)

- `npx tsc --noEmit`: exit 0.
- `npm run lint`: exit 0, 13 non-blocking warnings.
- `npm run build` with dummy non-secret build-time env: exit 0, 37/37 static pages generated. This is not a production-env or runtime test.
- `node scripts/test-admin-utils.mjs`: 11/11 passed.
- `node scripts/test-live-three-interfaces.mjs`: 49/49 passed.
- `node scripts/test-rich-content.mjs`: 146/146 passed.
- `node scripts/test-school-systems.mjs`: 29/29 passed.
- `node scripts/check-contrast.mjs`: all WCAG 2.2 AA pairs passed.
- `node scripts/test-event-operations.mjs`: 45/45 static event-operations checks passed.
- Post-migration schema validation: 18 event/pool/admission functions, 5 new tables, 16 policies on new/private tables, both shared-link identity CHECK constraints, 5 guards/usage/code-hash triggers, the invite/guest/participant indexes, the canonical event name and all three exact phase titles were confirmed present.
- **Transactional pool / qualification / exam-link tests**: `scripts/test-event-operations.sql` ran end-to-end against the Supabase project inside `BEGIN … ROLLBACK`; 36/36 assertions passed. B1–B9 (pool generation, validation, shuffle, replace, manual selection, shortfall workflow, approved-only guard, single-class guard, unresolved-count publish block) passed; C1–C15 (per-class ranking, unqualified/direct-URL/invalid-token/unapproved denial, organizer approval, class isolation, participant recheck, forged hash, documented override, unchanged source score, anonymous RLS) passed; D1–D11 plus D4b (code hash, wrong code, expired link, class isolation, later-phase class exclusion, mandatory names, duplicate guest, identity/score persistence, duplicate attempt, name-only student merge, anonymous result/answer protection) passed. The revised RLS harness records `SET LOCAL ROLE anon` results after restoring the privileged role, so the earlier temp-table permission false positive is eliminated. No test rows were committed.
- Database migration history was rechecked: 22 applied migrations include `official_event_identity`, `question_pools`, `question_pool_validate_curriculum_counts_fix`, `qualification_schema_part_a`, `compute_phase_qualification_function`, `qualification_admission_functions_policies`, `exam_shared_links`, `participant_admission_recheck`, `pool_manual_selection`, `participant_admission_verified_student`, and `shared_link_identity_integrity`.
- Vercel environment review: required public Supabase/LiveKit URL keys and an encrypted anon key are present; service-role and LiveKit secret values are redacted/sensitive. `LIVE_DISPLAY_TOKEN_SECRET` and `NEXT_PUBLIC_ROOT_DOMAIN` are referenced in source but are not configured as Vercel project env vars. No secret values were copied into source or reports.
- Vercel deployment review: the existing production deployment remains `dpl_9wriaiQ6pPLkjy6NsR1DgT5oMG2n` (READY/PROMOTED, commit `7845fa6`). Pushing the working branch automatically started previews `dpl_9RTvVfHjZ8vmP6aWV5BzCgxF7JCd` (`02987c7`) and `dpl_7pGRt9efvyHN2Frdb1r1iYLKRZeF` (`dcfb768`); both were canceled through the Vercel API. No production deployment, promotion, or alias change was performed for this work.
- **Local production-server smoke test** (`npm run start`, dummy env, port 3000): `/`, `/exam-access`, `/login` and `/faq` returned 200; invalid POSTs to `/api/exam/access`, `/api/exam/link-access` and `/api/live/join` returned 400 with clear validation errors. This is an HTTP smoke test only — not an authenticated browser test and not a DB-backed integration test.
- **Not yet run**: authenticated browser testing (Super Admin, org admin, organizer, registered student, shared-link candidate, qualified/unqualified candidate, desktop/mobile), live API integration tests against a running app with production credentials/env, production-env validation, or a new production deployment. Do not claim E/F browser or deployment success from the build, SQL, or smoke-test results above.

## Manual acceptance script (15 minutes, do this on the live URL)

1. Register with the Super Admin email → confirm email → sign in → `/admin` loads.
2. Create an organization (Premium trial starts) → dashboard shows trial banner.
3. Questions → create one of each type (include `$x^2$` math) → publish.
4. Import the CSV template → rows land in *Pending review* with a report → publish.
5. Quizzes → build a quiz → publish → **Go live (synchronized)**.
6. Use three separate screens: (a) signed-in Host Control
   Screen, (b) projector/TV using only the **secure Public Live Screen link**
   from the host screen (`/live/{competitionId}/screen?token=…`), and
   (c) two phones/tablets at `/play/{code}`. Join with different avatars,
   test approval/admission close, explicitly start, submit different answers,
   verify the host-only answer counts/distribution, reveal the answer, show
   intermediate rankings, pause/resume, refresh/reconnect each screen, finish,
   then display the final podium. The old `/live/{code}` URL must stay locked.
7. End session → Reports → session report → export CSV.
8. Exams → create from the quiz (proctoring on) → add 2 candidates → Open exam.
9. `/exam-access` as candidate 1 → allow camera → answer → autosave indicator;
   refresh the page → same codes resume the attempt with answers intact.
10. Supervisor opens *Proctoring room* → candidate feed visible → log an incident.
11. Submit as candidate → attempt auto-marked; mark any open-ended answer →
    Publish results → candidate sees score & PASS/FAIL.
12. Billing → submit a test payment reference → Super Admin → Payments →
    reject with reason (org gets notified) → submit again → approve →
    subscription activates.
13. Team → invite a second email as *Corrector* → accept via link → verify
    they cannot reach Billing (server rejects).

## Security tests to run regularly

- Tenant isolation: two orgs, attempt cross-org reads via the Supabase REST
  API with each user's JWT — all must return zero rows.
- Guest tokens: wrong token / wrong question id / late answer → 4xx.
- Forged LiveKit requests: candidate token for another exam → 403.
- Payment bypass: submitting a reference never changes entitlements until approval.

## Progressive load-test plan (measure, don't assume)

Use k6 or Artillery against a **staging** deployment (never production data):

| Stage | Scenario | Success signal |
|---|---|---|
| 1 | 5–20 participants, synchronized quiz | p95 state latency < 300 ms |
| 2 | 100 participants answering the same question within 2 s | 0 lost answers (unique-constraint count = submissions) |
| 3 | 500 participants | Vercel function errors < 0.1%, DB CPU < 70% |
| 4 | 1,000 participants | same + Supabase connection headroom verified |
| 5 | Video: 5 → 20 → 50 → 100 cameras in one exam room | supervisor grid stable, LiveKit minutes/bandwidth recorded per candidate-hour |

Report quiz capacity and video capacity **separately** — they are different
infrastructures with different ceilings.

## Current verification — additional mandatory requirements, 2026-11-05

- `npm install --no-audit --no-fund` installed 544 packages in the sandbox; `./node_modules/.bin/tsc --noEmit` exited 0 and `npm run lint` exited 0 with the same 13 non-blocking warnings. After the final LiveKit edit, dummy-env `npm run build` exited 0, compiled in 30.7 s and generated 37/37 static pages, including `/exam/join/[token]` (12.5 kB / 136 kB First Load JS); `git diff --check` also exited 0. `npx tsc --noEmit` is a wrong-tool dead end when local `node_modules` is absent; use the local binary.
- `node --experimental-strip-types scripts/test-additional-requirements.mjs`: **51/51** passed. It covers owner/customer capability separation, Institutional plan entitlements, pure exam-access helpers, fake-Supabase plan resolution, invitation copy, and static source/migration coverage. The `MODULE_TYPELESS_PACKAGE_JSON` warning is a Node type-stripping warning, not a failure.
- `scripts/test-additional-requirements.sql` ran through `supabase__execute_query` inside `BEGIN … ROLLBACK`: **39/39** passed. It verified Super Admin RLS reads and owner insertion into an organization with no ordinary membership; DB-generated unique codes/links/hashes; wrong-code, cross-exam and invalid-token rejection; all 15 exams' persisted links, hashes and access settings; identity JSONB columns; Free/Premium/Institution plan tiers; ordinary-user tenant isolation; cross-org insert denial and own-org insert allowance. No test rows were committed.
- All existing suites rerun together: `test-admin-utils.mjs` **11/11**, `test-event-operations.mjs` **45/45**, `test-live-three-interfaces.mjs` **49/49**, `test-rich-content.mjs` **147/147** (the new `/admin/operations` route adds one navigation check), `test-school-systems.mjs` **29/29**, `check-contrast.mjs` all WCAG 2.2 AA pairs pass.
- `supabase__list_migrations` now shows **25** applied migrations, ending `20261105093813 institutional_entitlements`, `20261105093835 super_admin_operational_rls`, `20261105093845 exam_access_identity`. The earlier 22 Oak/foundation migrations remain applied. `ROLLBACK_0020_0022.sql` is provided for emergency schema rollback but was not executed.
- Live DB read-only checks: one active Super Admin (`3c3ed712-f409-4aa1-a645-816418e22ec4`); authenticated-JWT RLS simulation returned `is_super_admin()=true` and `exams_visible=15`; 93 public policies with 90 explicit `is_super_admin()` paths. The three policies without that string are `competitions.comp_public_select` (anon, public visibility), `platform_settings.ps_select` (authenticated, `true`) and `support_tickets.sup_insert` (anon/authenticated, `true`) — intentional, not owner gaps. `org_role()` returns `'owner'` for a verified Super Admin; `is_org_member()`, `can_create_content()`, `can_host_live_session()` and `can_manage_org()` delegate to it.
- Post-migration object state: `exam_count=15`, `bad_links=0`, `missing_hashes=0`, `all_exams_have_access_settings=true`, `all_exams_have_persisted_links=true`, `no_duplicate_exam_records=true`. Free/Premium have `institutional=false`; Institution has `institutional=true` with centralized resources, configurable limits and unlimited quotas. Existing tokens, codes, exams, hashes, candidates, attempts, scores and results are preserved.
- Vercel deployment review correction: in addition to the two canceled previews already recorded above, the third auto-started preview `dpl_CjsT3C5fi8kcdt8mZFe2YhuGzADm` was also canceled. Pushing the additional-requirements commit `da0d0794078d8c1fcf3d6854fb10ba2ee89beee4` auto-started a fourth preview `dpl_6X67iKBT4vKsWEHWWyMuafnPT4yc`; it was canceled through the Vercel API. No production deployment, promotion or alias change was made for this work.
- **Still not run**: authenticated browser testing for Super Admin, Free, Premium, Institutional, registered student, shared-link guest, qualified/unqualified candidate, desktop/mobile; DB-backed live API integration for link-access/join/exam state/submit/take-exam/legacy access/read-only re-entry; wrong-code, expired/closed, unauthorized-ID, ineligible, cross-exam, refresh-persistence, separate-session, duplicate/conflicting-attempt, attempt-recording, autosave, timing, scoring, results and proctoring cases; production-env validation; production-secret decryption; production deployment. Do not claim browser, API-integration or deployment success from the compile, static, SQL or earlier smoke-test results.
- Remaining implementation limits: the DB persists the canonical `/exam/join/{token}` path while the full URL is host-derived at render time (no absolute-URL column/backfill); a general exam with no eligible class returns `409` rather than silently admitting a candidate; an explicit safe no-class workflow is not implemented. See `docs/ADDITIONAL_REQUIREMENTS.md` for the full Completed / Implemented but not fully tested / Not implemented / Blocked breakdown.

## Final deployment note

All auto-started Vercel previews from pushes on `arena/21f3ffe0-evalora` were canceled, including `dpl_6X67iKBT4vKsWEHWWyMuafnPT4yc` (`da0d079`) and `dpl_BPdUNLRjxxy6cJuNcR9ZSujmpAPf` (`06fa6cc`). Any preview started by the final docs push is also canceled; exact IDs are in Vercel deployment history. Production deployment `dpl_9wriaiQ6pPLkjy6NsR1DgT5oMG2n` remains the only promoted deployment and was not changed.

## Current verification — grading rubrics, moderation and grade audit, 2026-11-06

- Migration `0036_grading_rubrics_moderation_audit.sql` was applied to production
  as version `20261106052420` (39 applied). Additive only: 7 new tables, 4 new
  `exam_answers` columns, 2 new `exams` columns, 8 triggers. Existing data was
  untouched — the 8 `exam_answers` rows defaulted to `not_required`/`manual`,
  and the 1,076 questions, 15 examinations and 1 attempt are unchanged.
- Production verification ran inside `BEGIN … ROLLBACK` with no residue: a rubric
  derived its total (12) from criteria 6 + 6; a mark above a criterion maximum
  was rejected; a rubric attached to another organisation was rejected; two
  graders kept independent criterion scores; rubric marking appended a `marked`
  row; and a moderation insert carrying only `answer_id`, `decision`,
  `proposed_marks`, `note` and `moderator_email` had its attempt, examination and
  organisation derived by trigger, stamped `previous_marks` 8, projected 9.5
  onto the answer, set the status to `adjusted`, and appended a `moderated` row.
  Editing the grade log and deleting a moderation decision were both refused.
  After rollback: rubrics/criteria/links/scores/moderation/log all 0, answers 8.
- Local suites: `scripts/test-grading-rubrics-moderation.mjs` **16/16** (isolated
  PGlite), `scripts/test-rubric-marking-action.mjs` **16/16** (the real server
  actions with mocked auth and database), `scripts/test-result-publication-action.mjs`
  **7/7** (now also asserts the release stamp and its clearing). Full suite:
  **54 pass, 3 environment-only failures** — `test-exam-browser` and
  `test-printable-paper-browser` need the absent `playwright-core`, and
  `test-profile-status-security` cannot exercise ownership-dependent DDL in PGlite.
- `tsc --noEmit`, `eslint` on the touched paths and `next build` are clean;
  `/dashboard/rubrics`, `/dashboard/rubrics/[id]` and `/dashboard/exams/[id]/grades`
  appear in the route manifest.
- Production deployment `dpl_Fm7ccUx4mtjody8qBGe9LziXQzA9` (commit `99d1506`) is
  READY / PROMOTED with the `evalora-six.vercel.app` alias, and `/login` renders.
- **Not verified:** authenticated browser flows for rubric creation, criterion
  marking and moderation. No Super Admin credential is available in this
  environment, so those paths are evidenced by the action tests and the
  production SQL blocks, not by clicking through the app. Do not claim otherwise.
- Deployment path, corrected: PR #3 merged this work into `main` (merge commit
  `5545668`), and that merge automatically produced production deployment
  `dpl_DkoC9twBb6KpHgYDpL1JGK7NtQ7Q` — built from `main`, READY / PROMOTED, holding
  both `evalora-starboyboy2017-cells-projects.vercel.app` and `evalora-six.vercel.app`.
  Pushing to `main` is therefore the normal shipping path. Pushing a *feature*
  branch still only creates a preview, which is why the earlier deployments had to
  be created explicitly for a specific commit.

## Current verification — plan-limit enforcement at the database, 2026-11-06

Before this increment, plan limits were advisory: `withinLimit()` ran in four
server actions, so a client talking to PostgREST directly — or two creates racing
each other — could exceed a plan freely. The database now enforces them.

- Production migration `plan_limit_enforcement`, version `20261106104030`, adds
  `free_plan_defaults()`, `org_entitlement_limits(uuid)`, `org_limit(uuid, text)`
  and the `enforce_plan_quota()` trigger function, with triggers on `exams`,
  `quizzes`, `questions` and `organization_members`. It resolves limits in the
  same order as `src/lib/entitlements.ts`: hard-coded free defaults < the `free`
  plan row < an active/trialing plan < that subscription's `limits_override`; a
  lapsed trial or billing period falls back to free. Unlimited is `-1`.
- Unmetered by design: writes with no `auth.uid()` (service role, migrations,
  job runners — this is what lets onboarding create an organisation and its first
  member) and the platform owner (`is_super_admin()`), matching the existing
  owner bypass in TypeScript.
- Invitation acceptance used to write `organization_members` with the service
  role, so it skipped metering entirely: a workspace could invite past its plan
  and every acceptance succeeded. It now goes through `accept_invitation(text,
  uuid)`, which takes an organisation row lock, checks the member limit and
  inserts in one transaction, returning `ok` / `limit` / `expired` / `invalid`.
  The function is revoked from `anon` and `authenticated`; the app checks the
  invitation email against the session before calling it with the service role.
- Server actions map a rejection to their own upgrade prompt instead of a generic
  failure: `isPlanLimitError()` / `planLimitMessage()` in `src/lib/entitlements.ts`
  read the `PLAN_LIMIT:<key>:<limit>` code written to `DETAIL`, and the message
  itself is written for a person. A bulk question import stops at the first quota
  rejection rather than reporting the same failure once per remaining row.
- Local suites: `scripts/test-plan-limit-enforcement.mjs` **18/18** in isolated
  PGlite against the real migration file (free cap, paid ceiling, unlimited,
  lapsed period, lapsed trial, running trial, override, plan-row override,
  independent metering of exams/questions, member cap, workspace isolation,
  owner bypass, service-role bypass, drift check against `FREE_LIMITS`, and four
  invitation paths). `scripts/test-exam-create-security.mjs` is now **10/10** —
  it gained a check that a database quota rejection reaches the upgrade prompt.
  Full suite: **55 pass, 3 environment-only failures** (`test-exam-browser`,
  `test-printable-paper-browser` need the absent `playwright-core`;
  `test-profile-status-security` cannot exercise ownership-dependent DDL in
  PGlite). `tsc --noEmit`, `eslint` on the touched paths and `next build` clean.
- Production verification, `BEGIN … ROLLBACK`, no residue: resolved limits read
  back per workspace (DEMO Premium `-1/-1/-1/50`; Oak and EVALORA Platform on free
  `5/2/100/3`). Simulating an ordinary authenticated teacher, five quizzes
  inserted and the sixth was refused with "This workspace has reached its plan
  limit for quizzes (5)…"; simulating the platform owner, seven inserted against
  a limit of five. Afterwards 3 organisations and 44 quizzes — no probe rows.
- **Consequence to decide, not a defect:** Oak International School holds 42
  quizzes, 14 examinations and 1,064 questions with no subscription, so it
  resolves to free limits. Its only member is the `super_admin` owner, who is
  unmetered, so nothing is blocked today; staff who are not the owner could not
  create content there until a plan is assigned. Assigning Oak a plan is a
  commercial decision and was deliberately left to the owner.
- **Not enforced here, and not claimed:** `max_participants_per_session` (a
  live-session admission rule, not a row count), `max_classes` / `max_students`
  (both default to unlimited; wire with the institutional rollout) and
  `storage_mb` (needs a file-size ledger that does not exist). Feature gates such
  as `proctoring` remain action-layer checks.
- **Not verified:** the authenticated browser experience of hitting a limit and
  upgrading — no Super Admin credential is available in this environment.

## Current verification — AI-assisted marking as proposal and review, 2026-11-06

`grading_method` already allowed `'ai_assisted'`, and `grade_change_log` already
allowed a `change_type` of the same name, but nothing ever wrote either and no
model credential exists in this project. So the feature is built to be honest
about that: it suggests, a person decides, and with no credential it refuses.

- Production migrations `ai_marking_proposals` and `ai_marking_guardrails`
  (repo files `0038` and `0039`) add `public.ai_marking_proposals`: one row per
  criterion suggestion, carrying the proposed mark, a required rationale, the
  provider and model, a digest of the prompt and of the answer text, and the
  decision (who, what mark, when, note). RLS gives workspace markers read access
  and grants no insert/update/delete at all — proposals are written and decided
  by the server with the service role after it has authorised the caller, so a
  client cannot fabricate a "model" suggestion or quietly rewrite a decided one.
- Guard rails are in the database, not only in the action: a suggestion cannot
  exceed its criterion maximum, must belong to a rubric the examination actually
  uses, cannot be inserted as already decided, cannot be edited after a
  decision, cannot be deleted once decided, and cannot be accepted without an
  attributable decider. Replacing the candidate's answer supersedes live
  suggestions about the old text. One live suggestion exists per criterion.
- `src/lib/ai-marking.ts` is the provider boundary: `describeAiMarking()` reports
  whether a credential exists, and `suggestCriterionMarks()` throws
  `AiMarkingError('unconfigured')` when none does — it never returns invented
  marks. Replies are parsed strictly: an unknown, missing, repeated or
  out-of-range criterion, a missing rationale, or a total above the question's
  worth rejects the whole reply rather than snapping values into range.
- `proposeAiMarks` stores suggestions and writes no mark; `decideAiProposal` is
  the only path to a mark. Accepting writes the criterion score, marks the answer
  `grading_method='ai_assisted'`, and the database logs the change as
  `ai_assisted` (the previously-unreachable audit label). Rejecting writes no
  mark. Deciding one criterion of several records the decision but deliberately
  leaves the answer total alone until every criterion is scored, so a partial
  review cannot produce a silently low mark.
- UI: on `/dashboard/exams/[id]`, each written answer in the marking queue shows
  either the suggestion controls or the plain reason they are off; each proposal
  shows the criterion, the proposed mark against its maximum, the rationale, and
  accept (with an editable mark) / reject.
- Local suites: `scripts/test-ai-marking-schema.mjs` **14/14** (migrations
  0038–0039 in isolated PGlite), `scripts/test-ai-marking-actions.mjs` **15/15**
  (the real actions with a stubbed provider, including that an unconfigured,
  failed or unusable provider writes nothing) and
  `scripts/test-ai-marking-provider.mjs` **16/16** (config resolution, strict
  parsing, prompt construction; no network). Full suite **58 pass, 3
  environment-only failures** (`test-exam-browser`, `test-printable-paper-browser`
  need the absent `playwright-core`; `test-profile-status-security` cannot
  exercise ownership-dependent DDL in PGlite). `tsc --noEmit`, `eslint` on the
  touched paths and `next build` clean.
- Production verification, `BEGIN … ROLLBACK` inside the DEMO workspace as its
  owner: an over-maximum suggestion was refused; a rubric the examination does
  not use was refused; a valid suggestion had its attempt, examination and
  workspace derived from the answer rather than trusted from the caller and left
  the answer mark `null`; accepting stamped the decider and the accepted mark;
  re-deciding was refused; writing the mark logged `change_type='ai_assisted'`
  with the new points; and replacing the answer superseded the live suggestion.
  Afterwards: 0 proposals, 0 rubrics or candidates from the probe, 8 answers and
  15 examinations — nothing persisted.
- **Inert, by design:** no provider credential is configured anywhere (Supabase
  secrets or Vercel environment), so suggestions cannot be generated in
  production today. The UI says so instead of pretending, and adding
  `AI_MARKING_PROVIDER` + `AI_MARKING_API_KEY` (or a provider key variable such
  as `OPENAI_API_KEY`) is the switch. Nothing here proves a real model's output
  quality, because no model has been called.
- **Not verified:** an authenticated browser session generating and accepting a
  suggestion (no Super Admin credential here), and real provider responses.

## Current verification — printable paper beyond print-only, 2026-11-06

The paper was a single unpersonalised print view. It now also produces a
candidate answer sheet, a marker's rubric grid, and one packet per candidate,
all from the same route so a single browser print produces one PDF.

- `src/lib/printablePackets.ts` holds the pure builders: `answerLinesFor()`
  (7 lines for a written answer, 4 for short answer, 2 otherwise, none where
  options are printed), `buildAnswerSheet()` (numbered boxes, marks, option
  letters, and a writing-space fallback so a choice question with no printable
  options cannot produce an empty row), `buildMarkerGrid()` and
  `buildCandidatePackets()`. The rubric for a question is resolved with
  `rubricForQuestion` — the same helper the marking screen uses — so a
  question-level rubric overrides the examination-level one on paper exactly as
  it does on screen. A question with no rubric still gets a single-mark row, so
  nothing drops off the sheet.
- Packets are ordered by candidate name (case-insensitive), de-duplicated by id,
  carry the same answer sheet, grid and total, and each later packet starts a new
  page (`print:break-before-page`) so a cohort prints as one document with one
  candidate per page. A candidate with no access code still prints, with a blank
  reference.
- The route `/dashboard/exams/[id]/paper` takes `?mode=paper|sheet|packets|markers`
  (default `paper`, unchanged output). An unknown mode falls back to the question
  paper. The mode switch is hidden when printing. Rubric links, criteria and
  candidates are read through the existing workspace-scoped queries.
- Local suites: new `scripts/test-printable-packets.mjs` **14/14** (pure builders,
  compiled from the TypeScript) and `scripts/test-printable-paper-page.mjs`
  **8/8**, which gained four checks: the answer-sheet view numbers every question
  with writing space, packets name each candidate and mark later packets with a
  page break, the marker view prints the awarded table, and an unknown mode
  renders no packet body. Full suite: **59 pass, 3 environment-only failures**
  (`test-exam-browser` and `test-printable-paper-browser` need the absent
  `playwright-core`; `test-profile-status-security` cannot exercise
  ownership-dependent DDL in PGlite). `tsc --noEmit`, `eslint` on the touched
  paths and `next build` clean, with `/dashboard/exams/[id]/paper` in the route
  manifest.
- **Not verified:** the authenticated browser rendering and the actual printed
  output — no Super Admin credential is available here. This remains browser
  print-to-PDF; there is no server-side PDF generation, no scanning, no candidate
  matching and no paper-mark capture, and the packets only include candidates
  recorded against the examination.

## Single sign-on (Google) and the provisioning guard

### What ships inert

- `src/lib/sso.ts` resolves which providers the deployment may offer. With no
  flag set, `enabledSsoProviders()` is empty and `/login` renders exactly what it
  rendered before SSO existed: no divider, no button, no dead end. A button that
  cannot complete a sign-in is worse than no button — the same fail-closed rule
  AI marking follows with no credential.
- Enabling Google needs **both** halves: a Google Cloud OAuth client whose
  authorized redirect URI is
  `https://nqxqisjtbfsratgztmch.supabase.co/auth/v1/callback`, pasted into
  Supabase → Authentication → Providers → Google, **and**
  `NEXT_PUBLIC_GOOGLE_SSO_ENABLED=true` in the deployment environment. A
  declared-but-blank `NEXT_PUBLIC_GOOGLE_SSO_CLIENT_ID` mirror fails closed, so a
  half-configured environment stops advertising a dead sign-in method.
- `/dashboard/settings` shows a **Single sign-on** card listing each provider as
  *Enabled* or *Not configured*, with the school portal link when it is live and
  the exact configuration steps when it is not.

### Where the round trip goes

- The start action (`startSsoSignIn`) re-checks the provider server-side — the
  hidden field is user input, the deployment flag is the authority — then calls
  `signInWithOAuth` with a callback URL built from the request's own host, so a
  sign-in begun on a school subdomain returns to that subdomain.
- A Host header is attacker-controlled, so the origin is only accepted when the
  hostname is loopback, the configured `NEXT_PUBLIC_ROOT_DOMAIN` (or a subdomain
  of it), or a known platform suffix; anything else falls back to
  `NEXT_PUBLIC_APP_URL`, and no usable fallback means SSO is refused instead of
  redirecting a browser to an untrusted origin. The protocol cannot be
  downgraded by `x-forwarded-proto`. Tenant subdomains that are not under the
  configured root domain need `NEXT_PUBLIC_ROOT_DOMAIN` set to be accepted.
- `next` is filtered through the existing `safeLocalPath` in both the action and
  the page, so an off-site or protocol-relative destination is dropped.

### Provisioning policy: deny by default

- `src/lib/ssoSession.ts` checks the freshly authenticated identity against
  `profiles`: no row, or a non-active row, and the session is **destroyed**
  (`signOut()`) before the redirect, so an uninvited Google account never holds a
  live session. The user is sent to `?error=sso_unprovisioned` (or `?error=suspended`)
  with copy that says to ask a school administrator for an invitation.
- Membership, roles and organization scope are untouched: SSO authenticates a
  person, it never creates a workspace identity. The profile read prefers the
  service-role client so the answer cannot depend on how the `profiles` RLS
  policy is written, and falls back to the session client when no service key is
  configured.
- The callback marker `?sso=<provider>` is what enables the guard. Email
  confirmation and password recovery travel through the same route without it and
  keep their previous behaviour (`?next=/reset-password` still reaches the form).
- Each attempt writes `audit_logs.action = 'auth.sso_signin'` with the provider,
  the **masked** email (`a***@school.edu`) and the outcome (`provisioned`,
  `denied_no_profile`, `denied_inactive`). `actor_id` is null for a denial with no
  profile, because `actor_id` references `profiles(id)` and a profile-less auth
  user would violate the foreign key. An audit failure is swallowed — it must
  never block a legitimate sign-in.

### Verification

- `scripts/test-sso.mjs` **21/21** — pure gate (empty unless explicitly on;
  ambiguous values off; blank client-id mirror fails closed), origin allowlist
  (platform host, school subdomain, loopback, forwarded-host chain, look-alike
  suffixes, injection strings, no proto downgrade), callback URL marker and
  destination encoding, email masking, error copy.
- `scripts/test-sso-flow.mjs` **14/14** — the real action and the real callback
  handler against a stubbed Supabase client: no provider attempt when SSO is off
  or the provider is unknown, no attempt when no trustworthy origin exists,
  hostile `next` values dropped, provider errors returning to the form,
  provisioned identities reaching `/auth/resolve` with a masked audit row,
  no-profile and inactive identities signed out *before* the redirect with
  `Cache-Control: private, no-store`, the email-confirmation leg doing no
  provisioning lookup at all, recovery links preserved, failed code exchange
  returning to sign-in, and an audit outage not blocking a valid sign-in.
- `scripts/test-sso-login-page.mjs` **8/8** — the real server page and the real
  client form: an unconfigured deployment shows no SSO control whatsoever, a
  configured one shows `Continue with Google` posting to the action, denial copy
  names the next step, non-SSO errors keep their own copy, unknown error codes
  render no banner, a local `next` reaches the hidden field while a hostile one
  does not, and the registered/reset notices survive the move to a server page.
- Full suite: **62 pass, 3 environment-only failures** (`test-exam-browser` and
  `test-printable-paper-browser` need the absent `playwright-core`;
  `test-profile-status-security` cannot exercise ownership-dependent DDL in
  PGlite). `tsc --noEmit`, targeted `eslint` and `next build` clean, with
  `/login`, `/auth/callback` and `/dashboard/settings` in the route manifest.
- Production audit shape checked in `BEGIN … ROLLBACK` against
  `audit_logs`: a denial row with `actor_id` null and a provisioned row with a
  real profile actor both insert, and 0 probe rows persisted. No schema change was
  needed — `audit_logs` already allowed a null actor.

### Not verified, and why

- **No real Google sign-in has been performed.** There is no OAuth client
  credential in this project and no Supabase provider entry, so the flag stays
  off and the feature stays inert. The code path is exercised only against stubs.
- **School-subdomain SSO is not proven in production.** `src/lib/tenant.ts`
  deliberately excludes `.vercel.app` from tenant suffixes, so tenant hosts
  resolve only once a wildcard custom domain and `NEXT_PUBLIC_ROOT_DOMAIN` exist.
  The host-preserving behaviour is unit-tested; a real `<school>.domain` sign-in
  cannot be smoke-tested on the current platform hosts.
- Supabase creates the auth user during the provider round trip, before this code
  runs. Denying access removes the session, not the auth record: an uninvited
  account exists but can do nothing, and gets the same denial on every retry. A
  `before-user-created` hook would be needed to prevent the record itself.

## Oak Elimination count: from deferred to confirmed

### What changed

- The owner confirmed the existing **20 questions per class** for the Elimination round on 2026-11-06; the earlier 25 and 5-per-class candidates are rejected.
- `supabase/migrations/0040_oak_elimination_count_confirmed.sql` records it: `elimination_question_count_status = confirmed`, `elimination_question_count_confirmed = 20`, `elimination_question_count_confirmed_on`, a resolution note, and one `audit_logs` row (`competition.elimination_count_confirmed`). The migration resolves the event by name, raises when the event is missing, and returns early when the flag is already confirmed.
- Nothing else moved: no examination created, renamed or re-counted; no pool created, edited or published; semi-final (24 configured / 25 phase maximum) and grand-final (30) untouched.

### How the gate is proved in both directions

- `scripts/test-event-operations.sql` B9 became two assertions running inside the same `BEGIN … ROLLBACK` transaction. **B9a** forces the flag back to `pending_owner_confirmation` and asserts the publish is refused *and* that the message is the count message (so a validation failure cannot masquerade as a pass). **B9b** restores `confirmed` and asserts the same pool reaches `status = published`.
- `scripts/test-event-operations.mjs` gained 12 static checks — the migration exists, records 20 and the date, rejects the other candidates, is idempotent, fails loudly without the event, writes the audit row, creates/publishes no pool, resolves by name, the operations guide states the confirmed count, and both SQL assertions are present. **57 checks pass.**

### Production probe (rolled back)

| Check | Result |
|---|---|
| Draft Elimination pool assembled and validates | pass — 5 selected, 38 eligible, curriculum quota met |
| Publish refused while the flag is `pending_owner_confirmation` | pass — *"The Elimination question count is unresolved. Owner confirmation is required before publishing."* |
| Publish permitted while the flag is `confirmed` | pass — `status=published` |

Residue afterwards: 0 probe pools, 0 published pools, 1 permanent audit row, flag `confirmed`.

### Not verified

No Elimination pool has actually been published — the event holds none. Publication is now permitted, not performed. The count gate is one condition among several; a pool must still be complete, valid, single-class, curriculum-valid and approved-only.

## Summative Assessment — Grade 10 (content) and the notification bell popover

### What changed

- `supabase/migrations/0041_summative_grade10_questions_1_25.sql`, `0042_summative_grade10_questions_26_50.sql`, `0043_summative_grade10_options.sql` and `0044_summative_grade10_exam.sql` seed 50 single-choice questions (200 options, one keyed answer each), one published quiz holding all 50 in printed order at 1 mark each, and one open examination attached to the Grade 10 — MYP 5 class with a shared link, an access code and `results_published = true`. Each file is separately idempotent, so re-running any of them is a no-op.
- `src/components/dashboard/NotificationBell.tsx` + `src/lib/notifications.ts` replace the sidebar notification link with a floating popover over the same `notifications` rows; `DashboardChrome` renders it in the sidebar and in the mobile topbar.

### Automated evidence

| Suite | Checks | Result |
|---|---|---|
| `node scripts/test-summative-assessments.mjs` | 35 | pass — 50 questions, 200 options, 1 correct per question, all 50 keyed letters matched to the document key, printed order, 1 mark, exam configuration, idempotency guards |
| `node scripts/test-notification-popover.mjs` | 51 | pass — 15 helper cases executed, 36 component/chrome behaviour assertions |
| Full sweep (`scripts/test-*.mjs`) | 67 suites | 64 pass, 3 environment-only failures (2 Playwright browser suites without a browser binary, 1 PGlite ownership DDL) |
| `npx tsc --noEmit` | — | clean |
| `npx eslint src/components/dashboard src/lib/notifications.ts` | — | clean |

### Live production verification (deployed URL, anonymous)

The anonymous candidate flow was exercised against `https://evalora-six.vercel.app/exam/join/3ec9e83b-6286-4885-b178-12bc8dff8bb4` with the code `MYP5-SEQ-2026`:

| Step | Endpoint | Result |
|---|---|---|
| Wrong access code | `POST /api/exam/link-access` | 403 — *"That access code is not correct for this examination."* |
| Admission | `POST /api/exam/link-access` | 200 — attempt created, token issued, deadline 60 minutes out |
| Exam state before submission | `GET /api/exam/state` | 200 — 50 questions; no `is_correct` key, no `correct_option_ids`, every per-question `result` is `null` (no answer leakage) |
| Autosave | `POST /api/exam/save` × 3 | 200 — two correct answers (Q1 B, Q2 D) and one deliberately wrong (Q3 A) persisted |
| Submit | `POST /api/exam/submit` | 200 — `score: 2`, `max_score: 50`, `results_published: true`, `auto_submitted: false` (graded server-side, not from the client) |
| Exam state after submission | `GET /api/exam/state` | 200 — a result for all 50 questions, each with `is_correct`, `points_awarded` and a worked explanation |
| Repeat admission, same guest key | `POST /api/exam/link-access` | 409 — *"This attempt has already been submitted. Duplicate attempts are not permitted."* |

The verification attempt, its three answers and the candidate record were deleted afterwards; the examination, its 50 questions and its 200 options were not modified by the run.

Not covered by automation or by this run: clicking the bell and marking a notification read, which need an authenticated dashboard session.

## Summative Assessments — Grade 9 and the Grade 10 repairs

### What changed

- **Grade 9 — Summative Assessment** (MYP 4 Statistics & Distributions): `0046`–`0049` carry the 50 questions in four steps, `0050` the 200 options with their text, `0051` the quiz, the paper and the examination on the Grade 9 — MYP 4 class, access code `MYP4-STAT-2026`.
- **Grade 10 repairs**: `0045` writes the option text the seed never stored (`content_doc`), and `0052` attaches the two figures the seed could not carry (Q6 matchsticks, Q28 dot arrays).
- **Rename**: the Grade 10 assessment is "Summative Assessment — Grade 10" in the migrations, the headers, the titles and the idempotency guard, matching the live examination.

### Automated evidence

| Suite | Checks | Result |
|---|---|---|
| `node scripts/test-summative-assessments.mjs` | 64 | pass — both papers: 50 question rows each, 200 options each, one keyed option per question, the 50-letter key matched, printed order, 1 mark, every referenced figure present in `public/`, option text written to `content_doc`, examination configuration, idempotency guards, no "Sommetisation" left |
| `npx tsc --noEmit` | — | clean |

### Figure pipeline

The Grade 9 PDF holds no raster images: all 38 figures are vector drawings. Each question's figure is rendered from the page at 220 dpi, cropped to the band between the question text and its options, then trimmed of blank margins — so the caption, axis numbers and axis titles travel with the drawing. The 35 image figures are committed under `public/exam-figures/grade9/`; the 3 data callouts stay as text so they reflow on a small screen.

### Verified in production

| Check | Result |
|---|---|
| Grade 9 rows | 50 questions, 200 options, 50 keyed, 200 options with text, 35 figures, 3 callouts |
| Grade 9 key | `BDDADBBCCAABBCDBDCCACDCDABCDCDCBBAADABCDADAABABCBC` — identical to the document's key, and every letter re-checked against the marking scheme (0 mismatches) |
| Grade 9 examination | open, 60 minutes, 50-item paper, Grade 9 — MYP 4 class, code `MYP4-STAT-2026`, results released on submission, both shuffles off |
| Grade 10 option text repair | 200 of 200 options now carry their printed text (`content_doc`) |
| Grade 10 figure repair | 2 of 2 figure questions now carry their drawing |

## Complete corrigé after submission

### What changed

- `src/lib/examResults.ts` (new): pure post-submission rules — `buildExamResult`, `optionMarkings`, `resultLabel`, `answerKeyLine`, `selectedOptionIds`.
- `src/app/api/exam/state/route.ts`: after submission **and** publication, every question carries `reveal` (correct option ids + summary) and a `result`, whether or not the candidate answered it.
- `src/components/QuestionRunner.tsx`: optional `markings` prop — the correct option is green with a ✓, an option the candidate chose that is wrong is red with a ✗.
- `src/app/take-exam/[attemptId]/TakeExamClient.tsx`: prints "Correct answer: B", the explanation, a neutral panel for blanks, the blank count in the sidebar, and a ✓ / ✗ / – badge on every question in the navigator.

### Automated evidence

| Suite | Checks | Result |
|---|---|---|
| `node scripts/test-exam-results.mjs` | 37 | pass — blank question is `answered: false`, `is_correct: false`, `points_awarded: 0` and labelled "Not answered · 0 / 1 point" (never "Incorrect"); only the correct option and a chosen-wrong option are marked; single and multi-select payloads; points coerced from the database string; manual-marking answers still "Awaiting manual marking"; the state route builds a result for every row and only behind `submitted && resultsPublished` |
| `node scripts/test-summative-assessments.mjs` | 64 | pass — unchanged |
| `npx tsc --noEmit` | — | clean |
| `npm run build` | — | clean |

### Verified in production

| Check | Result |
|---|---|
| Submitted Grade 9 attempt with 2 answers | state returns results for **50 of 50** questions |
| Blank questions | `answered: false`, `is_correct: false`, `points_awarded: 0`, explanation still present |
| Answered questions | correct answer revealed only after publication; chosen-wrong option identifiable from `correct_option_ids` |
| Before submission | no `result`, no `reveal`, no `is_correct` in the payload |

## One-page corrigé

### What changed

- `src/components/ExamCorrige.tsx` (new): the complete marking scheme on one page — every question with its prompt, its four marked options, the answer key line, the mark obtained and the worked solution.
- `src/app/take-exam/[attemptId]/TakeExamClient.tsx`: "Voir le corrigé complet (50 questions)" and "Imprimer / PDF" on the results card; the sidebar and the single-question card step aside while the corrigé is open.
- Print support reuses the existing `paper-print` / `paper-question` rules in `globals.css`, so printing or "Save as PDF" yields the whole paper with the app chrome removed.

### Automated evidence

| Suite | Checks | Result |
|---|---|---|
| `node scripts/test-exam-corrige.mjs` | 25 | pass — real component rendered with the real marking rules: 50 questions, 200 options, 48 blanks labelled "Not answered · 0 / 1 point", exactly one "Incorrect", 50 answer-key lines, ✗ only on the chosen wrong option, the blank count in the summary, score/percentage/pass mark, Print calling `window.print`, the print classes, and the publication gate on the exam screen |
| `node scripts/test-exam-results.mjs` | 37 | pass — unchanged |
| `node scripts/test-summative-assessments.mjs` | 64 | pass — unchanged |
| `npx tsc --noEmit` | — | clean |
| `npm run build` | — | clean |

### Not claimed

- No automated browser test: the page has no browser runner in this environment. The component is covered by a React render test; the print output is covered by the shared print stylesheet, not by a rendered PDF.

## `/exam` entry page

### What changed

- `src/app/exam/page.tsx` (new): `/exam` and `/exam/` answered **404** in production; the page now accepts a pasted invitation link, a bare invitation token or an access code.
- `src/lib/examEntry.ts` (new): pure parsing rules, unit-testable without a browser or database.

### Behaviour

| Input | Result |
|---|---|
| `https://…/exam/join/<token>` | redirect to that join page (with its `code` if present) |
| bare `<token>` | redirect to `/exam/join/<token>` |
| access code (`MYP4-STAT-2026`) | SHA-256 looked up against open, shared-link assessments; redirect only on exactly one match |
| anything else | the page explains, with the same copy whatever the reason |

### Automated evidence

| Suite | Checks | Result |
|---|---|---|
| `node scripts/test-exam-entry.mjs` | 27 | pass — link/token/code parsing, code normalisation, rejection of non-examination and `javascript:` URLs, extra parameters dropped, destinations always internal, hash-only lookup restricted to open shared-link assessments, single-match redirect, no question/answer fields, GET form, labelled input |
| `npx tsc --noEmit` | — | clean |
| `npm run build` | — | clean |

### Production evidence

| Check | Before | After |
|---|---|---|
| `GET /exam` | 404 | 200, entry page |
| `GET /exam/?code=MYP4-STAT-2026` | 404 | resolves to the Grade 9 join page |
| `GET /exam/join/3f867709-…` | 200 | 200, unchanged |

## Universal assessment integrity

### What changed

- `src/lib/integrity.ts` (new): policy parsing, event catalogue, severity, escalation ladder, warning copy.
- `src/lib/integrityMonitor.ts` (new): one browser monitor (visibility, focus, full screen, clipboard, context menu, unload, connectivity) with an injected environment and transport.
- `src/app/api/exam/integrity/route.ts` (new): records `integrity_<event>` rows in the existing `proctoring_incidents`, resolving exam/candidate/organisation from the attempt token.
- `src/app/api/exam/state/route.ts`: sends the assessment's integrity policy to the candidate client (never an answer key).
- `take-exam/[attemptId]/TakeExamClient.tsx`: starts the monitor while the attempt is in progress, shows a dismissible warning and an optional tone, stops on submission.
- Teacher consoles: human-readable incident labels, browser payloads hidden.
- `NotificationBell`: `extraCount` / `allHref` / `allLabel`; the admin console now uses the popover instead of a page link.

### Automated evidence

| Suite | Checks | Result |
|---|---|---|
| `node scripts/test-integrity.mjs` | 60 | pass — policy defaults and clamping, per-event switches, escalation (none/warn/strong/review), warning copy, fake-DOM monitor (tab hidden, dedupe, blur collapse, clipboard, full screen, `stop()`, disabled policy, server-authoritative count, throwing transport), route identity/dedupe/cap/409/policy gate, console labels, bell wiring |
| `npx tsc --noEmit` | — | clean |
| `npm run build` | — | clean |

### Production evidence

| Check | Result |
|---|---|
| Candidate attempt with the monitor active | `POST /api/exam/integrity` accepts the token and records `integrity_tab_hidden` / `integrity_focus_lost` / `integrity_copy` |
| Row association | `exam_id`, `candidate_id`, `attempt_id`, `organization_id` all resolve from the token |
| Foreign token | rejected with 404 — no cross-attempt or cross-tenant write |
| Closed attempt | rejected with 409 |
| Teacher console | incidents listed with a readable label |
| Bell | admin console opens the popover, no navigation |
