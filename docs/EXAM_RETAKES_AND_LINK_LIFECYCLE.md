# Controlled exam retakes & configurable examination-link expiration

Implemented in migration `supabase/migrations/0076_exam_retakes_and_link_lifecycle.sql`
and wired into the existing examination engine, student surface and Super Admin
console. Nothing was duplicated: the existing `exams`, `exam_attempts`,
`exam_answers`, `exam_candidates`, `students`, `audit_logs`, `notifications` and
`platform_settings` structures are reused.

---

## 1. Submitted attempts are locked

The lock already lived on the server (`/api/exam/save` and `/api/exam/submit`
refuse any attempt whose status is not `in_progress`). This work adds the second
half of the rule: **no new attempt can exist without an explicit approval**.

* `exam_attempts` no longer carries `unique (exam_id, candidate_id)`, because
  that made a legitimate retake impossible without overwriting history.
* It now carries `uq_exam_attempts_one_active` — at most **one attempt in
  progress** per candidate and examination — plus `uq_exam_attempts_number`
  (one row per `candidate_id, attempt_number`).
* Every attempt keeps its own `id`, `access_token`, `started_at`,
  `question_order`, answers, score, marks, proctoring incidents and audit trail.
  A retake is a NEW row linked backwards by `previous_attempt_id` and authorized
  by `retake_request_id`; the original row is never updated by a retake.

Refreshing, logging out and back in, changing device or opening the examination
URL directly all end in the same server check: the latest attempt is submitted
and there is no usable approval, so no attempt is created.

## 2. Requesting a retake (student)

`POST /api/exam/retake` (and `GET` for state) accepts either:

* `attempt_id` + `token` — the bearer credentials the student already holds, or
* `exam_code` + `candidate_code` — the legacy two-code flow.

Actions:

| action | effect |
|---|---|
| `request` | inserts ONE `pending` row in `exam_retake_requests`. A duplicate (including a racing duplicate) returns the existing pending request. Never creates an attempt. |
| `cancel` | cancels the caller's own pending request. |
| `start` | creates the authorized NEW attempt — only when an approved, unused, in-window grant exists and the examination is `open`. |

The student interface is `src/app/take-exam/[attemptId]/RetakePanel.tsx`, shown
after submission inside the paper's confirmation card:

* attempt label (“First attempt”, “Second attempt”, …) and permanent lock notice;
* **Request a retake** with an optional reason, an explicit confirmation, and a
  clear “sent and awaiting approval” confirmation;
* pending status with a cancel action;
* rejection with the Super Admin's note;
* an approved retake with its access window and a **Start authorized attempt**
  button (the new attempt opens as a normal, server-timed paper).

`/student` lists the signed-in student's own attempts (explicit `student_id`
filter), their submission state, published result and retake status.

Statuses: `pending`, `approved`, `rejected`, `cancelled`.

## 3. Super Admin approval workflow

`/admin/examinations/retakes` — a dedicated section in the existing Super Admin
console (`AdminShell` group F), protected by `requireSuperAdmin()`.

Each pending request shows: student name, student identifier, institution,
examination title, class, original attempt id, original submission time, result
(when published), reason, request date and status.

**Approve** records `decided_by`, `decided_at`, an optional note, the number of
authorized attempts (**1 by default**, up to 3 when explicitly chosen) and an
access window (24 h / 7 d / 30 d / custom). Optional explicit controls:

* *Extend the examination window* — only ever lengthens `exams.ends_at`;
* *Reopen the examination* — sets `status = 'open'` when it was not open.

**Reject** records the rejecting Super Admin, the instant and an optional reason.
No attempt becomes startable; the original attempt is untouched.

Both decisions are idempotent against `status = 'pending'`, so two concurrent
clicks produce exactly one decision. The student is notified (in-app
notification when a profile exists; always visible on their examination page)
and the decision is written to `audit_logs` **and** to a retake-specific audit
row (`exam.retake_approved` / `exam.retake_rejected`).

`exam_attempts.attempt_number` distinguishes first, second and subsequent
authorized attempts; `granted_attempts` is a bound, never “unlimited”. Once the
authorized attempts are used (or the access window closes) the student is locked
again and must request another approval.

## 4. Configurable examination-link expiration

Existing columns `exams.invite_expires_at` and `exams.shared_link_enabled` are
reused. Added: `invite_activates_at` (scheduled activation),
`invite_disabled_at`, `invite_expiry_policy`, `invite_no_expiry`,
`invite_last_edited_by/at`.

The default policy **does not silently create permanent links**:

* the migration backfills any existing NULL expiry to
  `max(exam window end + 30 days, now + 7 days)` — never cutting off a running
  examination;
* `platform_settings.exam_link_policy` defaults to
  `{ allow_no_expiry: false, default_days: 30, link_requires_expiry: true }`;
* “No expiration” is rejected by the server unless that policy explicitly
  permits it.

`/admin/examinations/links` manages every link:

* status **Active / Scheduled / Expired / Disabled** computed from the server
  clock (`src/lib/examLink.ts`) — an expired link is never displayed as active
  merely because nobody disabled it;
* creation date, activation date, exact expiration (rendered in the viewer's
  local timezone with the UTC instant in the tooltip), current status, students
  started / submitted / in progress;
* presets (24 h, 7 d, 30 d), custom date & time, scheduled activation;
* **Edit link settings** preserves the URL, token and examination code;
* **Disable** (with explicit confirmation) and **Reactivate** (always requiring a
  valid future expiration);
* copy link / copy code / view examination access / view candidates.

## 5. Backend enforcement and the server clock

`examAccessAvailability()` is the single rule used by the join page and
`POST /api/exam/link-access`. It checks, in order: disabled → scheduled →
expired (or unreadable, treated as expired) → examination open → starts/ends.
Candidates' device clocks are never consulted, so changing a device clock or
timezone cannot reopen a link.

### Expiration vs. active attempts

Expiration and disable affect **new starts only**. `/api/exam/state`,
`/api/exam/save`, `/api/exam/submit`, the integrity routes and the deadline
sweep never read link state. An attempt started before expiration keeps its
server-authoritative timer, deadline, answers, autosave and submission rights;
a submitted attempt and its records are unchanged. Both properties are asserted
in `scripts/test-exam-retake-surfaces.mjs`.

## 6. Retake authorization × link expiration

Backend rule (one place, `findUsableGrant` + the two admission routes):

> An approved retake may start the authorized attempt when the examination is
> `status = 'open'`, the examination window (`ends_at`, when set) has not
> passed, and the approval's own access window is still open. The public link's
> expiration or disabled state does not erase an approval.

So: an expired/disabled link does not delete an approval, and the approval does
not let a student bypass the examination's open status or window. The Super
Admin can extend the window or reopen the examination in the approval form
(both audited). An old expired public link is never enough on its own: the
candidate must present the attempt token (or the two codes) and hold a grant.
Every started retake writes `exam.retake_attempt_started` with
`request → attempt` linkage.

## 7. Database objects

| object | purpose |
|---|---|
| `exam_retake_requests` | request + decision record (status, requester, reason, decided_by/at, note, granted_attempts, access_expires_at) |
| `guard_exam_retake_request()` trigger | tenant/candidate/exam consistency, submitted-only requests, pending-only inserts, no re-decision, approval requires a window |
| `uq_exam_retake_pending_candidate` / `..._pending_attempt` | one pending request per candidate/exam and per attempt |
| `exam_attempts.attempt_number / previous_attempt_id / retake_request_id` | separate preserved attempts and their authorization chain |
| `uq_exam_attempts_one_active` / `uq_exam_attempts_number` | one active attempt, unique attempt numbering |
| RLS on `exam_retake_requests` | student sees only own requests; org staff see their tenant; only Super Admin updates decisions; inserts limited to the student's own verified candidate |
| `exams.invite_*` columns | expiration, scheduled activation, disable stamp, policy key, explicit exemption, last edit |

All migrations are additive. No table, column, attempt or answer is dropped,
truncated or rewritten. `lock_timeout = '5s'` makes the deployment fail rather
than block a candidate who is currently autosaving.

## 8. Rollback

1. Application: redeploy the previous build (the new columns and table are
   ignored by it; the dropped `unique (exam_id, candidate_id)` constraint is
   re-created below).
2. Database (only if no retake attempt exists yet):

```sql
drop index if exists public.uq_exam_attempts_one_active;
drop index if exists public.uq_exam_attempts_number;
alter table public.exam_attempts
  add constraint exam_attempts_exam_id_candidate_id_key unique (exam_id, candidate_id);
```

Keep `exam_retake_requests` (it is evidence) and the additive `exams` columns.

## 9. Tests

| suite | covers |
|---|---|
| `scripts/test-exam-retake-link-lifecycle.mjs` | status machine, presets, custom/no-expiry policy, reactivation, server-clock availability, retake state machine, one-approval-one-attempt, window bounds |
| `scripts/test-exam-retake-migration.mjs` | real migration in PGlite: backfill, tenant guard, submitted-only requests, duplicate pending, approval needs a window, no re-decision, preserved original attempt/answers, separate attempts, one active attempt, RLS |
| `scripts/test-exam-retake-surfaces.mjs` | route/action wiring: server-side lock, token/code ownership, Super Admin + audit on decisions and link edits, no link state in attempt routes, console wiring |
| `scripts/verify-exam-retake-e2e.mjs` | opt-in end-to-end run against a real deployment + real database (needs `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `EVALORA_BASE_URL`) |

## 10. Known limitations

* Institution-level timezone is not stored anywhere in the schema, so exact
  instants are stored and compared in UTC and rendered in the viewer's local
  timezone (UTC is always shown on hover / in messages). Administrators entering
  custom times do so in UTC, as labelled on the field.
* A guest candidate who loses their attempt token and whose link has been
  regenerated cannot start an approved retake without the current link/code;
  the Super Admin console shows both so they can be re-issued.
* Approval grants attempts; it does not auto-create an attempt (by design — the
  student starts it, and only once).

## 11. Verification status (this delivery)

| step | status |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint src` | 0 errors (10 pre-existing warnings) |
| `npm run build` | success (Next 15.5) |
| `npm test` | **85 suites passed, 0 failed, 7 skipped — 590 checks** |
| migration `0076` on production (`nqxqisjtbfsratgztmch`) | applied; verified via catalog queries: retake table 18 columns, old `(exam_id, candidate_id)` unique dropped, `uq_exam_attempts_one_active` + `uq_exam_attempts_number` present, both new FKs present, all 28 exams backfilled with a future `invite_expires_at` |
| `scripts/verify-exam-retake-e2e.mjs` against the deployment | **blocked in the build sandbox**: outbound HTTPS to `*.supabase.co` and `*.vercel.app` is refused (TLS reset), and Playwright browsers cannot be downloaded. The script is committed and runs unchanged from any networked machine: `NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… EVALORA_BASE_URL=… node scripts/verify-exam-retake-e2e.mjs` |

The 7 skipped suites are the existing Playwright browser suites (`--all`); they
were skipped for the same sandbox reason, not because of this change.
