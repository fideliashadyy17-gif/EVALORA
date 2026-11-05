# EVALORA implementation phase status

Updated 5 November 2026. This report tracks the working tree and specifically notes production database changes; application deployment must be verified separately. It is an evidence ledger, not a declaration that the master implementation is complete.

| Phase | Status | Evidence and outstanding work |
| --- | --- | --- |
| 0 — Audit | Initial audit documented | See `PHASE_0_ASSESSMENT_PLATFORM_AUDIT.md`; its production inventory is time-specific and requires refresh before a release. |
| 1 — Foundation and assessments | In progress | Baseline reconciliation and exam queue/dirty guards are local. Current state requests use an authorization header, but legacy URL tokens remain accepted. Question category tenant validation and import extraction authorization were added. Exam server-side atomicity/versioning, robust autosave, real RLS/tenant tests, historical question snapshots, storage hardening and staging remain open. See the Phase 1 reports. |
| 2 — Grading and feedback | Partial existing implementation; not complete | Workspace marking now checks tenant, answer/attempt/paper relationships, attempt status and point limits locally. Super Admin marking now also checks paper-specific limits and failure paths, and exam grading fails closed on key read/write errors. The separate writes are not atomic; rubric versioning, moderation/history, blind grading and authenticated end-to-end acceptance need further work. See `PHASE_2_MARKING_INTEGRITY.md`. |
| 3 — AI Studio | Not implemented end-to-end | Existing template generation is not an LLM service. Provider, processing terms, consent, quotas, safety evaluation, operational cost controls, PDF-to-assessment and teacher-review flows remain to be built and verified. |
| 4 — Secure exams | Partial existing implementation; not complete | Server deadlines and LiveKit exist; identity guarantees, rate limiting, consent, browser incidents, operational proctoring and adversarial tests remain open. Browser controls must not be described as OS lockdown. Native lockdown requires feasibility work per OS. |
| 5 — Paper mode | Not implemented end-to-end | Student-import OCR does not constitute paper exam processing. Secure scanning, mapping, confidence, human verification, privacy and grading linkage are still required. |
| 6 — Analytics and integrations | Partial existing analytics; integrations not established | Validated, tenant-authorized reporting/exports and real provider integrations with sandbox credentials, consent, retries and operational monitoring are still required. |

## Local increment in this update

- `src/app/api/exam/state/route.ts`, `src/app/take-exam/[attemptId]/TakeExamClient.tsx`: the current client sends an attempt token in an `Authorization: Bearer` header instead of the URL, and state responses use `Cache-Control: private, no-store`. For existing clients, the query token remains accepted if no authorization header is present. An invalid header never falls back to the query token. This is not a complete credential-security solution: legacy query requests, existing browser storage, header logging, XSS, access controls and token rotation remain risks. No API removal occurred.
- `src/lib/csv.ts`, `src/lib/extractServer.ts`: student CSV/semicolon/tab/pipe extraction uses the existing parser with quote-aware delimiter detection instead of the `xlsx` parser. XLS/XLSX still use `xlsx`, whose high-severity advisories remain unresolved. Spreadsheet data is not claimed to be safe to parse from untrusted sources. Existing comma-parser calls retain their default. Text values such as leading-zero identifiers are preserved; the existing cleanup still normalizes whitespace.
- `src/app/api/exam/save/route.ts`: a flag-update error is now reported rather than confirming the combined save. The answer may already have persisted, and retry re-sends both; this is not an atomic transaction.
- `src/app/dashboard/questions/actions.ts`: before a question is written, a selected category must resolve within the active tenant, and an absent workspace is denied. This does not address destructive option replacement or implement immutable question history.
- The application increment remained local at this checkpoint. Later database migrations and scoped production checks are recorded in `RELEASE_READINESS_2026-11-05.md`.

## Verification in this update

- New local checks: state credential handler 5/5 (mocked database), delimited-text extraction 8/8 (actual parser/extractor), question metadata permission 6/6 (mocked authentication/database). The React exam guard test also checks the outgoing header and absence of the token in the request URL.
- Existing local checks passed: examination queue 7, save handler 11, draft interaction 4, question-runner interaction 8, extraction permissions 12; class/question bank 93, event operations 45, additional requirements 51, admin utilities 11, school systems 31, live interfaces 49 and rich content 147. Some are static or mocked and cannot prove database isolation or browser behavior.
- `npm run build`, `npx tsc --noEmit`, `npm run lint` (0 errors, 16 existing warnings), and `git diff --check` passed. No authenticated real database, browser E2E, LiveKit, load, accessibility or hostile-tenant test was performed.

## Release gate and next work

Continue Phase 1 with transactional, versioned answer writes and question-history protection, a reviewed spreadsheet-parser replacement that preserves required formats, and isolated staging/RLS/role tests. Then implement later phases with their own data-protection, permissions, migration, rollback and acceptance tests. The owner authorized production deployment, but no phase is complete merely because local checks passed.


### Follow-up — workspace marking safeguards

The workspace manual marking action now validates tenant, role, submitted attempt, answer/paper association and effective maximum points and reports partial write failures. Thirteen mocked-auth/database tests passed. The UI displays the paper-specific maximum, and the question editor now warns about effects on linked attempts. The Super Admin path now validates paper allocation and reports partial failures; the two paths still differ in type restrictions and audit behavior. Grading writes remain non-atomic and question history is not immutable. See `PHASE_2_MARKING_INTEGRITY.md`.


### Follow-up — Super Admin marking and fail-closed exam grading

The Super Admin marking action now validates paper allocation and association and reports partial failures. Exam grading/submission no longer treats paper/answer read errors or unconfirmed grade writes as success; a concurrent human mark is protected by a conditional write. Local tests passed: 12 Super Admin marking, 10 real grading logic and 9 real submission/state-handler checks, each with mocked service boundaries. This is not an atomic or database-backed guarantee; prior per-answer writes and a closed attempt with an unupdated candidate record remain possible. Full details and release gates: `PHASE_2_MARKING_INTEGRITY.md`.


### Owner authorization and staging gate

The owner authorized deployment and migrations. Supabase declined isolated branching; scoped, rollback-only synthetic production checks and isolated PostgreSQL-compatible fixtures were used for the class association and policy changes instead. A real local Chromium smoke test with mocked exam APIs passed; this is not full DB E2E. See `RELEASE_READINESS_2026-11-05.md` for the applied database migrations and remaining limitations.
