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
- Unchanged constraint: the Vercel project still has `productionBranch: main` and
  `createDeployments: disabled`, so production deployments are created explicitly
  for a specific commit rather than triggered by pushing this branch.
