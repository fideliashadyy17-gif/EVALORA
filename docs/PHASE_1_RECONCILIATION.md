# Phase 1 — production baseline reconciliation and exam-save integrity

**Date:** 5 November 2026
**Status:** Local development increment only. Do not deploy or use as evidence of production acceptance.

## Scope and decisions

- The fixed session branch `arena/b5f2778e-evalora` was fast-forwarded locally from `5d85daa` to the exact previously promoted production source commit `518c44ed292179c444f93c6f390294c35d400a28`. No other branch was checked out, created or pushed. Production and local changes were not deployed.
- Earlier uncommitted work was preserved in Git stash and `/home/user/EVALORA-reconcile-safety/working-files.tar` plus patch files, then reapplied. The stash was intentionally retained. This archive is a local safety copy, not a backup of the database. The stashed local event overview conflicted with the newer production overview; the production overview is retained, and the original local overview remains recoverable in the safety archive/stash. The production-generated seed bundle was retained to avoid breaking production checks. No historical bundle or secrets were rewritten.
- The local event-detail qualification actions now delegate eligibility and approval/override operations to production's `event-operations` implementation and RPCs, instead of inserting older display-name-based records or directly changing status without admission tokens. These combined routes still need authenticated database-backed testing. The local detail view and the production monitor have different phase-status paths; do not assume the local detail gate protects all paths. Earlier local class/question metadata improvements and migration 0011 are present again as uncommitted changes.
- Migration `0011_class_question_bank_events.sql` was already applied to the live database in an earlier session, but was absent from production Git; it is restored locally. Migrations 0012–0022 are now present in the branch baseline. No migration was applied or replayed in this increment. A clean staging bootstrap and migration-history reconciliation remain mandatory; do not assume that replaying 0011 over newer production is safe.

## Exam-save integrity

`src/app/api/exam/save/route.ts` now rejects a client-supplied `quiz_question_id` that differs from the server-resolved quiz-question association for the examination and always writes the server-resolved ID. An omitted optional ID remains supported. This does not change the authentication model, database schema, existing answers or exam timing.

`scripts/test-exam-save-handler.mjs` executes the real route with a mocked database boundary: matching ID, omitted ID, mismatched ID, out-of-paper question, wrong attempt token, expiry, submitted attempt, database failure and invalid payload. These are route-level mock tests, not live database or browser tests. Existing tests cover source/pure logic; they do not prove tenant isolation or high-stakes readiness.

## Verification performed

- Build and `npx tsc --noEmit`: passed on the combined local tree.
- Lint: passed with 0 errors and 16 warnings.
- Exam-save route tests: 9/9 passed with a mocked DB; class/question-bank checks: 93/93; event-operations static checks: 45/45; additional-requirements checks: 51/51.
- Earlier in this increment, admin-utility checks: 11/11; school-systems checks: 31/31; live-interface checks: 49/49; rich-content checks: 147/147. `git diff --check` passed.
- No live Supabase write, RLS simulation, authenticated browser, LiveKit connection, concurrency, offline or load test was run during this increment.

## Still open

- Reconcile and review the entire combined diff against production, including all class/subject metadata, session synchronization, review actions, status transitions and question edits. In particular, existing question editors delete/reinsert answer options; investigate effect on historical responses and concurrent grading before extending or promoting the workflow.
- Build a staging deployment and run two-tenant/RLS, guest, candidate, exam save and scoring, question editor, pool, qualification, live admission, LiveKit and owner/plan tests. Run offline/reconnect, concurrent writes and deadline races; the save-association fix alone does not solve unreliable autosave or lost/out-of-order writes.
- The event’s elimination question-count decision remains deferred. Do not publish a new exam configuration until the owner decides.
- Confirm the official name and current database status before acting; older references in the audit and seed artifacts are historical.
- Before production deployment: test the full workflow and critical regressions, review migration compatibility and environment configuration, and obtain separate explicit owner authorization. No production promotion occurred in this increment.


### Dependency-security follow-up (local audit)

`npm audit --omit=dev` on the local dependency tree reported 39 production-dependency findings (37 moderate and 2 high package entries). The high entries include the direct `xlsx` dependency (prototype pollution and ReDoS advisories; npm reported no available fix) and transitive `postcss` (npm suggested a major Next.js upgrade). The student import extraction path parses uploaded spreadsheets and CSV through `xlsx` (`src/lib/extractServer.ts`); exploitability in this deployment has not been established. Treat untrusted imports as a security review priority. Investigate a maintained parser or vendor-supported patched distribution and test backwards-compatible imports, plus assess the affected PostCSS paths and safe upgrade options. Do not blindly run `npm audit fix --force` or claim the deployed installation has been independently scanned.

### Student-import extraction authorization increment

- `src/app/api/students/import/extract/route.ts` now rejects unauthenticated, suspended, wrong-tenant, or non-creator users before reading the multipart body or invoking document parsers. Owners, admins, teachers and organizers retain access within their active workspace. Active Super Admins retain the separate cross-organization import wizard path.
- This narrows access to a resource-intensive endpoint; it **does not remediate** the `xlsx` advisories, provide rate limiting, bound decompressed workbook size or prove the production endpoint secure. The final import endpoint and other document-processing paths still require their own comprehensive authorization/security review; no inference is made about their safety.
- `node scripts/test-student-extract-permissions.mjs`: 12 real-route checks using mocked session and parser boundaries (including denial before body read, permitted roles, suspended/wrong-tenant, Super Admin and file checks). School-system regression: 31 checks passed. TypeScript, production build and lint (0 errors, 16 warnings) passed locally. Authenticated live-tenant, adversarial-file, rate-limit and staging tests remain outstanding.
- No database migration, deployment, external service or production data changes in this increment.

### Additional local foundation safeguards

- The current examination state client now sends its token in an authorization header; the state route accepts it and marks success/error responses private and no-store. Query-string credentials remain supported for deployed older clients. `scripts/test-exam-state-credentials.mjs` passed five mocked-DB route checks, and the draft-guard component test asserts the current client's request shape. Token logging elsewhere, browser storage, legacy callers and authenticated staging verification remain open.
- Student delimited-text imports now use the existing CSV parser for comma, semicolon, tab and pipe, with quote-aware delimiter detection. Eight actual parser/extractor checks passed. XLS/XLSX still use `xlsx` and the advisory is **not resolved**; verify compatibility in staging before rollout.
- The tenant question save action now checks that a selected category belongs to the active organization and fails closed if no active workspace or category lookup fails. Six mocked-auth/DB checks passed; historical option replacement remains a separate unresolved risk.
- Latest combined local verification: TypeScript and production build passed, lint 0 errors/16 warnings; all previously listed exam, student, question-bank, event, school, live and rich-content regressions passed. No production changes or migration applied.
