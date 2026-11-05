# Phase 2 increment — workspace marking integrity

**Status:** Implemented locally; not deployed or accepted as a complete grading workflow. This increment does not create rubric templates, blind marking, moderation, mark history or transactional grading.

## Changes

- `src/app/dashboard/exams/actions.ts`: `markAnswer` now checks an active workspace and marker role, resolves the exam within that organization, verifies that the submitted attempt belongs to that exam and is no longer in progress, verifies that the answer belongs to that attempt and is an open-ended response, and resolves the question against the exam's current paper. If a stored quiz-question ID exists it must match the resolved association; legacy null IDs remain supported. Points must be finite, nonnegative and no greater than the paper-specific question allocation (falling back to the question's default only when the paper override is null).
- The action checks answer and total-update errors and redirects to explicit success or error feedback. If the answer was stored but recalculating the total failed, the UI reports a **potentially partial save** instead of claiming success. A previously saved manual score is not deleted.
- `src/app/dashboard/exams/[id]/page.tsx`: the queue uses paper-specific point overrides for its displayed maximum and input limit, and shows marking outcomes. Permission and point limits are enforced server-side, not only in the UI.
- `src/app/dashboard/questions/[id]/page.tsx`: replaces a misleading claim that edits affect only future sessions with a warning that edits can affect linked papers and existing grading. Question snapshots/versioning are not implemented by this change.
- The first increment made no schema, migration, database, deployment, external service, or Super Admin marking changes. A subsequent local Super Admin follow-up is described below.

## Verification

`node scripts/test-exam-marking-action.mjs`: 13 tests execute the real workspace action with mocked authentication/database boundaries. They cover roles, tenant mismatch, ID mismatch, in-progress attempts, objective answers, paper association, legacy null association, invalid/over-maximum marks, successful recalculation, remaining unmarked responses and write/read failures. These are not RLS or real-database integration tests. TypeScript and the broader checks are recorded in `IMPLEMENTATION_PHASE_STATUS.md`.

## Remaining risks and required acceptance work

1. The answer write and attempt-total update are separate operations. Concurrent markers, grading, edits or submission can produce stale totals or partial outcomes. The current validation does not lock the attempt. Use a reviewed atomic, authorized transaction/RPC and staging concurrency tests before claiming grading integrity.
2. Historical question versions/answer options and paper allocations are mutable. The action validates the **current** paper; it does not establish a historical assessment snapshot. Existing editor changes may affect answers and grading.
3. The current mark action has no immutable mark/revision/moderation audit history. Rubrics, blind marking, feedback publication controls and human review are separate work. A partial write may remove the answer from the queue; administrators must reconcile it until a transactional retry/recovery design is implemented.
4. Verify both workspace and Super Admin flows with real users, role/RLS denial, two tenants, paper overrides, legacy answers, failure injection, concurrency and accessibility on an isolated staging project. The local unit mocks do not demonstrate those guarantees.

After this increment, `npx tsc --noEmit`, `npm run build`, `npm run lint` (0 errors, 16 existing warnings), `git diff --check`, and the exam, student-import, question-bank, event, school, live and rich-content regression scripts all passed locally. No authenticated DB, browser or concurrency test was run.


## Super Admin and automatic grading follow-up

- `src/app/admin/examinations/actions.ts` now checks the question belongs to the examination organization, resolves the exam paper and verifies the stored paper-question association when present, validates finite marks against the actual paper allocation, prevents marking in-progress attempts, and reports unsuccessful/partial total updates. Existing Super Admin authorization and success audit calls remain; a separate audit event is attempted for partial saves. The audit helper is not transactional with grading and currently does not surface database insert errors, so this is not a guaranteed immutable audit trail. Existing ability to mark other question types through the administrator action was not removed.
- `src/app/admin/examinations/marking/page.tsx` displays an associated paper override when it can verify the relation. For legacy/null or inconsistent references, it avoids guessing a maximum and excludes unknown allocations from the displayed known-total count; the server independently resolves the correct limit on save.
- `src/lib/exam.ts` and `src/lib/live.ts` now fail closed for exam-specific paper query failures, empty/missing papers and broken stored question order. The live quiz caller retains its prior default read behavior. Grade calculation now rejects answer-read and per-answer write failures, validates maximum points, and avoids overwriting a human mark added between read and write.
- `src/app/api/exam/state/route.ts` and `src/app/api/exam/submit/route.ts` return failure rather than confirming a submission when grading or conditional attempt closure cannot be confirmed. State answer retrieval failures no longer present as an empty answer set. If the attempt closes but the subsequent candidate-status update fails, the response reports uncertainty; a retry can see the closed attempt but does not automatically repair that separate candidate status. Prior answer-grading writes can also persist when a later operation fails.
- Local tests: `scripts/test-admin-marking-action.mjs` 12 mocked-auth/DB/audit checks; `scripts/test-exam-grading-failures.mjs` 10 checks of real grading logic with mocked DB; `scripts/test-exam-submission-failures.mjs` 9 real-handler checks with mocked grading/DB. Existing exam, student-import, question-bank, event, school, live and rich-content regressions passed. TypeScript, build, lint (0 errors, 16 existing warnings) and diff checks passed. These are not authenticated DB integration, real concurrency or browser tests.
- No database migrations applied and no deployment. None of the changes makes grading, submission, candidate-status updates or audit atomic; a reviewed transaction/RPC, snapshot/versioning, race tests and recovery for partial failures remain release gates.
