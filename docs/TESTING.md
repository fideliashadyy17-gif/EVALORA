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
