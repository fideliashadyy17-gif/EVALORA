# EVALORA platform audit and implementation tracker — 7 November 2026

## Scope and evidence standard

This is a repo, deployment-metadata and infrastructure-state audit, not a declaration that every platform flow has been accepted. Sources inspected: Next.js App Router source (`src/app`, `src/components`, `src/lib`), 57 numbered SQL migrations, 72 test scripts, prior platform/security/readiness records, current Supabase and Vercel connector state, and the public production homepage. The inventory below rates 45 capability areas. “Functional, insufficiently tested” means substantial implementation and some tests/evidence exist, but not a complete authenticated browser-to-database production acceptance. No customer records or production configuration were changed during the audit.

## Current platform and infrastructure snapshot

- Architecture: Next.js 15.5.29 / React 19 App Router, server actions and Next API route handlers, Supabase Auth/Postgres/Storage/Realtime, and LiveKit client/server SDK integration. The application contains 205 App Router files, 24 shared components, 40 library modules, 17 API route handlers, and 57 numbered migrations through local migration 0057 plus rollback scripts.
- Git: branch `arena/a355ea2f-evalora` began at `32e64071fdeefa869463edc14bd7520bce07625c`; `origin/main` was fetched read-only and is the same commit. No remote code delta was present at audit start.
- Supabase: EVALORA project `nqxqisjtbfsratgztmch` is `ACTIVE_HEALTHY` for Auth, Postgres, REST and Storage. Production migration history currently ends at `shared_live_quiz_integrity` (`20261107021302`). Only the default `main` database branch is listed; there is no isolated working branch. Realtime health returned `healthy`, but its snapshot reported `db_connected: false` and `replication_connected: false`; this needs operational follow-up rather than being treated as a proven outage. Auth configuration has email enabled, phone disabled, open signup, unconfirmed email sign-up, 1-hour JWTs and refresh rotation enabled. External OAuth providers are disabled in the returned Auth configuration. No Supabase Edge Functions are deployed; application APIs are Next.js route handlers.
- Vercel: project `evalora` is linked to `fideliashadyy17-gif/EVALORA`; domains `evalora-six.vercel.app` and the Vercel project hostname are verified. Current production was READY/PROMOTED from commit `32e64071fdeefa869463edc14bd7520bce07625c` (deployment `dpl_CTuVXGGhDym7vJefpKikBxCmX3HN`). Build metadata showed a successful production build. Speed Insights is configured but has no data. No production runtime error logs/observability samples were available from the connector metadata. Environment secrets were not decrypted or printed.
- LiveKit: application source includes candidate room, token route, webhook and supervisor/projector features. Vercel project configuration includes the public LiveKit URL setting; secret values are intentionally not inspected. No LiveKit-specific connected-app tool or authenticated room test was available, so service credentials, room connectivity and media quality are not certified here.
- Staging: Supabase exposes only the default branch in this snapshot. The prior release ledger records that isolated branching was denied by plan entitlement. Vercel previews are documented as sharing production Supabase settings, so they are not safe database staging.

## Feature inventory (45 capability areas)

| # | Capability | Audit status | Evidence / remaining verification |
|---:|---|---|---|
| 1 | Authentication, sign-up, recovery and sessions | Functional, insufficiently tested | Supabase Auth and application flows exist; no full browser role matrix or session-expiry recovery run. |
| 2 | Role-based routing and authorization | Functional, insufficiently tested | Middleware, profile roles and workspace role resolution exist; production browser checks for every role remain incomplete. |
| 3 | Independent EVALORA Super Admin Console | Functional, insufficiently tested | Separate `/admin` route tree and global actions exist; not every operation was exercised by an authenticated Super Admin. |
| 4 | Organization Owner dashboard | Functional, insufficiently tested | Customer workspace/dashboard exists; customer-owner authenticated acceptance remains incomplete. |
| 5 | Organization management and invitations | Functional, insufficiently tested | Organization, invitation, role and quota logic exists; end-to-end email invitation/acceptance remains to be exercised with real accounts. |
| 6 | Student management | Functional, insufficiently tested | Registration, imports, access and roster workflows exist; complete authenticated lifecycle not run. |
| 7 | Teacher and staff management | Functional, insufficiently tested | Team and role workflows exist; complete permissions matrix remains open. |
| 8 | Classes and academic structures | Functional, insufficiently tested | Years, classes, subjects/programmes and atomic association migration/tests exist; full browser journey remains. |
| 9 | Question Bank | Functional, insufficiently tested | Search, categories, imports, reuse and metadata exist; large-dataset performance and full lifecycle need E2E. |
| 10 | Question editor and rich content | Functional, insufficiently tested | Question create/edit, rich text and media paths exist; historical attempts are not fully protected by immutable snapshots. |
| 11 | Mathematical authoring and rendering | Functional, insufficiently tested | MathLive/KaTeX and rich-content rendering are present; device/accessibility and full author-to-student notation matrix not accepted. |
| 12 | Assessment Studio / examination authoring | Functional, insufficiently tested | Exam/question selection, settings and publishing paths exist; every configuration and mutation path needs authenticated E2E. |
| 13 | Quiz authoring and management | Functional, insufficiently tested | Quiz builder, questions, assignments and results exist; full lifecycle verification remains. |
| 14 | Live quizzes (host, participants, scoring, leaderboard) | Functional, insufficiently tested | Host, join, answer, state and public-screen routes/components exist with integrity tests; multiple real simultaneous participants not browser-tested. |
| 15 | Examination management and publication | Functional, insufficiently tested | Scheduling, candidate, access, monitoring, results and marking modules exist; complete production workflow remains unverified. |
| 16 | Candidate links, codes and eligibility | Functional, insufficiently tested | Token/code/access handlers and security tests exist; authenticated production candidate journeys remain open. |
| 17 | Student examination runner and answer recovery | Functional, insufficiently tested | Server-authoritative deadline and a single-tab save/retry queue exist. This increment adds per-edit autosave and tab-scoped position recovery; this is not server transactionality or cross-device recovery. |
| 18 | Automatic grading and scoring | Functional, insufficiently tested | Scoring helpers and integrity tests cover common question types; complete live assessment-to-published-mark verification remains. |
| 19 | Manual grading, rubrics and moderation | Partially functional | Marking and rubric/moderation persistence and tests exist; writes are not a single atomic workflow and authenticated production acceptance is incomplete. |
| 20 | Result publication, result views and exports | Partially functional | Publication and result logic exist; complete permission, historical-data and export acceptance remains. |
| 21 | Analytics and dashboards | Partially functional | Reporting, summaries and exports exist; query performance, metric correctness and longitudinal reports are not fully established. |
| 22 | Browser anti-cheating / integrity evidence | Partially functional | Shared monitoring and server incident recording cover observable browser events and live quizzes; real-browser evidence and policy-by-policy acceptance are missing. It is not browser lockdown. |
| 23 | LiveKit video proctoring | Partially functional | Token, room, candidate/supervisor UI, webhook and evidence paths exist; real authorized room, camera, reconnect and service-health tests were not possible. |
| 24 | Printable paper mode | Functional, insufficiently tested | Printable assessment/packet workflow and tests exist; authenticated staff-to-print acceptance remains. |
| 25 | Scanned paper/OCR answer ingestion and grading | Missing | Roster extraction is not examination scanning; a complete scan-to-verified-answer workflow is not implemented. |
| 26 | AI question-generation Studio | Interface only / placeholder | Template/content helpers are not a provider-backed, evaluated LLM authoring service. |
| 27 | AI-assisted grading | Blocked by external dependency | Proposal/review guardrails exist, but no configured model provider/credential and full provider-backed workflow is established. |
| 28 | Notification bell, popover and read state | Functional, insufficiently tested | Shared popover and notification actions exist with regression tests; end-to-end destination and mobile checks remain. |
| 29 | Subscription plans and entitlements | Functional, insufficiently tested | Application and database quota enforcement exist; full plan/capability matrix in authenticated UX is incomplete. |
| 30 | Payments and billing | Functional, insufficiently tested | Payment review and billing modules exist; real payment-provider integration is not established and complete workflow tests remain. |
| 31 | Institutional settings | Functional, insufficiently tested | Workspace settings and administration exist; all settings-to-effective-policy paths need verification. |
| 32 | File storage and assessment media | Partially functional | Upload/render paths exist; storage bucket exposure and tenant/path/retention hardening remain release concerns in prior audit. |
| 33 | Import/export and document generation | Partially functional | CSV/spreadsheet extraction and print/export exist; XLS/XLSX advisories and large/untrusted file handling remain concerns. |
| 34 | SSO | Partially functional | Application SSO flow code/tests exist, but external identity providers are disabled in current Supabase Auth configuration. |
| 35 | LMS/SIS and other provider integrations | Blocked by external dependency | No operating provider sync has been established; provider accounts/approval and implementation are needed. |
| 36 | Audit logs, incident review and retention | Functional, insufficiently tested | Audit and proctor review history/retention paths and tests exist; complete role-by-role audit acceptance remains. |
| 37 | Platform operations and error monitoring | Partially functional | Admin operations/system pages and deployment checks exist; Vercel Speed Insights has no data and runtime alerting evidence was unavailable. |
| 38 | Public live projection | Functional, insufficiently tested | Read-only public screen routes and security tests exist; real simultaneous event projection not tested. |
| 39 | Tenant isolation and Supabase RLS | Functional, insufficiently tested | Prior scoped production role/policy checks and isolated PostgreSQL fixtures are documented; not a full penetration test or exhaustive policy matrix. |
| 40 | Responsive layout and accessibility | Partially functional | Responsive patterns and contrast tests exist; keyboard, screen reader, zoom, mobile and WCAG 2.2 AA acceptance remain. |
| 41 | Live-quiz offline behavior | Partially functional | Offline participation cannot continue live; current scope preserves ordinary client state where available, but no end-to-end reconnect test was performed. |
| 42 | Performance telemetry and Core Web Vitals | Partially functional | Build bundles can be measured; production Speed Insights reports no data and browser LCP/CLS/INP were not measured. |
| 43 | Immutable question/assessment versions for history | Missing | Existing question changes can affect historical references; versioned snapshots are not established end-to-end. |
| 44 | Cross-tab, exactly-once exam save/submission and deadline races | Partially functional | Client queue is ordered within one tab and writes are repeatable upserts; multi-tab/server-authoritative mutation versioning and atomic submit remain open. |
| 45 | Native OS lockdown (beyond browser APIs) | Blocked by external dependency | Browser APIs cannot lock down another tab/device/OS. OS-specific managed-device feasibility and deployment are required; no such guarantee is claimed. |

**Inventory totals:** 45 areas audited; 0 fully functional and fully verified end-to-end in this audit; 25 functional but insufficiently tested; 14 partially functional; 1 interface/placeholder; 2 missing; 3 blocked by external dependencies; 0 confirmed broken. “0 confirmed broken” means no broken major capability was proven during this bounded audit, not that no bugs exist.

## Changes implemented in this increment

### Student exam answer persistence

- Every supported editable response now enters the existing per-attempt serial queue immediately; the queue writes the latest snapshot synchronously to the existing tab-scoped `sessionStorage` and then debounces network flush by 450 ms. An explicit Save action and connectivity restoration can flush earlier.
- Autosave covers single-choice, multiple-select, short/open text, numeric, ordering and matching responses. Newer unsent values replace older unsent values for a question; the serial queue keeps requests ordered inside the tab. A blank numeric response is scored as an unanswered zero-mark answer instead of raising a grading-payload error.
- Current question index is saved/restored within the same tab session. The exam surface now reports browser online/offline state and distinguishes local waiting answers from server-confirmed saves. The existing server deadline remains authoritative; server-side save rejects closed/expired attempts.
- No new answer key or unnecessary personal information is put into local recovery storage. Candidate answers are still stored in plaintext sessionStorage; this is not a secure vault. A tab close, storage denial, XSS, shared device, multiple tabs, lost response, deadline race or server-side out-of-order request may still require invigilator recovery. An offline submit is not represented as server submission.

### Exam bundle loading

- Moved LiveKit room UI, SDK hooks and styles into a dynamically loaded `ProctoredExamRoom` component. Non-proctored examination sessions no longer need to load the LiveKit UI chunk.
- Next production-build route report for `/take-exam/[attemptId]`: first-load JavaScript fell from **408 kB** to **229 kB** (−179 kB, **43.9%**). Shared initial JS remains 133 kB. The proctored case will load the separated LiveKit chunk when needed; the total proctored-session payload was not claimed to shrink by the same amount.

## Verification performed

- `npm ci --ignore-scripts --no-audit --no-fund`: completed (539 packages).
- `npm run build`: passed after implementation. Existing lint warnings remain (unused imports/variables in older admin/question pages and one existing `QuestionRunner` hook dependency warning); zero build/type errors.
- `npx tsc --noEmit`: passed.
- Changed-path suites: exam queue **8/8**, question-runner interaction **12/12**, exam save route **11/11**, scoring integrity **10/10**. These use mock storage/network/database boundaries or React test renderer, not a real browser/production DB.
- Full `npm test` after repairing the LiveKit test harness: **70 suites passed, 0 failed, 2 skipped, 356 individual checks passed**. The two skipped suites are the real-browser exam and printable-paper suites; Playwright and a compatible browser are not installed. The candidate-video-status suite now mounts the extracted room component with mocked LiveKit hooks; this is not a LiveKit service E2E.
- A local `next start` request smoke test returned 500 for pages because this checkout has no `.env.local` Supabase URL/key; this is a test-environment configuration gap, not evidence of a production error. Local immutable asset response returned 200 with one-year immutable caching. No authenticated local browser test was possible: no Chromium/Playwright installation was present.
- Production public homepage was retrieved successfully. No production browser session, authenticated customer write, test student account, network-throttling experiment or real LiveKit session was run.

## Performance evidence and gaps

| Metric | Baseline | After this increment | Evidence / qualification |
|---|---:|---:|---|
| Exam route first-load JS | 408 kB | 229 kB | Next production build output; −179 kB / 43.9%; not a browser transfer/LCP measurement. |
| Shared initial JS | 133 kB | 133 kB | Next production build output; unchanged. |
| Browser LCP / CLS / INP | Not measured | Not measured | No browser binary or production Speed Insights data; avoid invented values. |
| API p50/p95, database query duration | Not measured | Not measured | No authenticated browser/network profile and no production query tracing sampled. |
| Dashboard, question bank, quiz/exam startup, real-time latency | Not measured | Not measured | Requires authorized role accounts and controlled browser/network runs. |
| Vercel production Speed Insights | No data | No data | Project metadata reports `hasData: false`. |
| Local page response baseline | Blocked | Blocked | Local SSR returns 500 without the project's public Supabase URL/key environment configuration. |

Targets remain: common navigation perceived under 1 s, common APIs under 500 ms p95 where reasonable, LCP ≤2.5 s, CLS ≤0.1 and INP ≤200 ms. This increment does not establish those thresholds.

## Security, data integrity and external dependencies

- No database migration was needed; production data and schema were not changed by this increment. Applied migration history and service health were read only.
- Existing server-side authorization, candidate-token checks, expiry checks and RLS were not weakened. Prior audit evidence documents selected RLS and tenant-isolation tests, but broad security acceptance remains incomplete.
- High-priority remaining concerns from prior code/production audits: exam answer write/submit/marking operations are not fully atomic or versioned; candidate and tab credentials/local answer storage need continued threat-model review; shared-link identity does not prove person-level identity; file storage bucket/path access requires hardening review; rate limiting and historical question snapshots remain; spreadsheet parsing has unresolved advisories; full multi-tenant billing/role matrix has not been penetration-tested.
- Realtime reported a healthy service with no active DB/replication connection in the health snapshot. Recheck with Supabase before relying on subscription-driven updates.
- AI provider, LMS/SIS integration and native OS lockdown require external provider/service/policy work. No new provider or duplicate service was introduced.

## Implementation tracker for this increment

| Feature | Existing status | Problem | Change made | Test performed | Result | Deployment | Remaining issue |
|---|---|---|---|---|---|---|---|
| Exam answer autosave | Queue saves only explicit answers; edits to composite/text answers could be lost before explicit save | Dirty input could be lost by crash/forced close; edits were not regularly autosaved | Queue drafts on each edit, synchronous same-tab persistence, 450 ms debounced network flush, reconnect trigger, current question restore and status message | Queue, QuestionRunner, save API and scoring suites | 41 focused assertions across these four suites pass; all mocked/local | Pending final full-suite rerun, commit/push and Vercel promotion | No IndexedDB/cross-tab/exactly-once transaction; sessionStorage plaintext and tab lifetime; no real browser throttle test |
| Empty numeric answer | Blank numeric answer was treated as malformed scoring input | Autosaving a cleared answer could make grading fail instead of awarding zero | Treat absent/empty numeric response as incorrect with 0 points; preserve malformed nonempty rejection | Scoring integrity suite | 10/10 | Same as above | End-to-end grading workflow still needs acceptance |
| Non-proctored exam JS payload | LiveKit React modules/styles were eager imports of the exam runner | Large proctoring-only code was included in first load for every exam | Extracted room into a dynamic chunk | Before/after Next build route report | 408 kB → 229 kB first-load JS (−43.9%) | Same as above | Proctored full payload and real browser transfer not measured |
| Production service status | Not refreshed for this request | Need actual current integration snapshot | Read Supabase health/auth/migrations/functions/branches and Vercel project/domain/deployment metadata | Connector reads; public homepage fetch | DB/Auth/REST/Storage healthy; migration history through live quiz integrity; only main DB branch; Vercel production READY/PROMOTED | No changes yet | Realtime subscription link, actual authenticated production flows and LiveKit room still need runtime tests |

## Release gate and next actions

1. Re-run complete automated suite after the updated video-room harness; keep the two browser suites visibly skipped unless Playwright and a compatible browser are provisioned.
2. Commit/push only to `arena/a355ea2f-evalora`; deploy the exact verified commit to the existing Vercel project only after local gates pass.
3. Verify deployment state/SHA and public critical routes. Without test accounts, do not claim authenticated production assessment, grading, tenant-isolation, or LiveKit end-to-end acceptance.
4. Follow up on Supabase Realtime's disconnected DB/replication snapshot and provision a true isolated staging environment before destructive/integration tests.
5. Highest-risk implementation work still needed: server-atomic/versioned exam answer + submit/deadline operations, isolated multi-tab/slow-network/browser testing, storage and rate-limit audit, immutable question snapshots, authenticated RLS/tenant role matrix, and full core-workflow browser tests.
