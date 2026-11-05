# Phase 1 increment — examination save reliability

**Status:** implemented locally, not deployed; not yet accepted for high-stakes use. This is an incremental improvement, not a complete offline examination engine.

## Scope

- `src/lib/examSaveQueue.ts`: serial queue for explicitly saved answers. Later unsent saves to a question replace older queued saves; a completed older request cannot remove the newer queued answer. Failed requests remain queued for retry. The queue reports whether same-tab recovery storage is available; malformed recovery data is preserved and blocks manual submission rather than silently discarding it.
- `src/app/take-exam/[attemptId]/TakeExamClient.tsx`: distinguishes server-confirmed answers from pending saves; shows failures, retries on browser reconnection or candidate request, restores pending answers after refresh in the same tab, warns before leaving with pending saves or unsaved edits, asks before discarding a draft when navigating, provides an explicit discard action, and waits for the queue before allowing manual submission. Manual submission is blocked while a draft is unsaved. A submission or subsequent state request that cannot be confirmed is surfaced as an error instead of silently assumed successful.
- `src/components/QuestionRunner.tsx`: reports edits and whether the exam queue accepted them. The optional guard leaves the existing live-session callback path unchanged; an older asynchronous acceptance cannot clear a newer edit.
- `src/app/api/exam/save/route.ts`: previously added server-side quiz-question association check: reject a mismatched client ID and write the ID actually resolved from this examination.
- No schema, permission, API contract, external service, environment, production data or deployment changes. The save API remains backward compatible with clients that omit the optional quiz-question ID.

## Candidate behavior and privacy

- Single-choice answers are queued on selection. Existing text and multi-part question controls still require **Save answer** before leaving the question. The guard warns about unsaved typing and composite changes, but does not autosave those drafts or a flag on an unanswered question; flags are sent with an answer save. A candidate can explicitly discard a draft, including in a one-question exam.
- Pending answers are temporarily stored as **plaintext in browser sessionStorage**, scoped to the attempt and the current tab. No token is included in this queue. This is not a secure vault: same-origin scripts, someone using the same open tab, or device compromise may expose it. Avoid shared devices. A successfully synchronized queue is removed; browser session restore behavior can vary. The existing attempt token is stored separately by the existing application.
- Recovery needs a working server state request and the same browser tab; closing the tab or clearing storage can lose unsent answers. If storage is denied, an in-memory queue continues to work but warns that refreshing is unsafe. Reconnection retries require a valid, still-open attempt. If the exam expires or is submitted elsewhere, unsent items are retained and the candidate is told to contact the invigilator; they are not claimed to be accepted.
- Serialization applies inside one queue instance only. Multiple tabs, refresh while a request is still executing, concurrent submit/expiry and lost responses can still race on the server; this is **not** an exactly-once or cross-device guarantee. True idempotency, server-side write versioning and atomic answer/submit/deadline transitions require a separate reviewed migration/RPC and staged tests.
- Confirming a save is not the same as submitting the examination. Automatic server grading may happen after expiry when state is requested. Pending answers that arrive after the server deadline are not accepted.

## Verification

- `node scripts/test-exam-save-queue.mjs`: 7 pure queue checks with mocked network/storage: failure/recovery, in-flight replacement, ordering, blocked storage, corrupt data and flags.
- `node scripts/test-exam-save-handler.mjs`: 9 checks executing the real route with a mocked database boundary.
- `node scripts/test-question-runner-drafts.mjs`: 8 React test-renderer interactions for edits, rejected/accepted saves, asynchronous stale acceptance, and the existing live-session callback path.
- `node scripts/test-exam-draft-guard.mjs`: 4 React test-renderer checks with mocked browser/network covering unload warning, navigation, submission guard, discard and save. These tests do not use a real browser.
- TypeScript, lint (0 errors; 16 existing warnings) and production build passed locally. A separate authenticated browser, real network interruption, multi-tab, DB integration and LiveKit test has **not** been performed; no installed browser was found in this workspace.

## Remaining acceptance work

1. Test exact flows against a dedicated staging database: same-tab refresh, offline retry, stale and failed writes, close/restore, server submission/expiry, marking, RLS and cross-tenant access, including two simultaneous tabs.
2. Define and implement a server-authoritative idempotency/versioning and atomic submission design before claiming no lost or overwritten answers. Include a safe migration, rollback and existing-client compatibility plan.
3. Implement and verify reliable autosave/recovery for draft answers and independently persisted flags. The current dirty-state guard only reduces accidental loss; it cannot recover unsaved drafts after crashes, forced closure or time expiry.
4. Review browser storage, retention, XSS/CSP and consent requirements with institutions, particularly for minors and shared devices. Investigate securing token transport and reducing query-string token exposure.
5. Complete the broader Phase 1 reconciliation, question-history, identity/rate-limiting, storage and role/plan tests. Obtain explicit owner authorization only after deployment safeguards pass.

## Credential transport follow-up

The current state client sends the attempt token in a bearer authorization header rather than in the request URL, and the state route returns private, no-store responses. Existing clients can still use the legacy query parameter; therefore URL exposure has been reduced, not eliminated. Tokens remain in existing browser storage and may be exposed by unsafe header logging or XSS. Five mocked-DB state-handler checks and the React-level client request assertion passed; authenticated browser/staging verification is still required.

## Review flag failure handling

The save route now reports a failed review-flag update instead of claiming the combined operation succeeded. The answer may already be written when the flag update fails; the queue retains and retries the combined request. This makes the error visible but does not make the two writes atomic. Eleven mocked-DB save-route checks passed, including successful flags and a flag-write failure after answer persistence. Flags on unanswered questions remain unpersisted.
