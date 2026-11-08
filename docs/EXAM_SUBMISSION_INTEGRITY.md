# Examination submission integrity

**Status:** implemented and deployed (2026-11-08)
**Incident investigated:** Summative Assessment — Grade 10, candidate Oxane ZOCLI
**Non-negotiable rule:** *an anti-cheating incident is not an examination submission command.*
An attempt may only close automatically **at or after** its official, server-computed deadline.

---

## 1. What happened (verifiable record)

All facts below were read from the production database
(`nqxqisjtbfsratgztmch`, project **EVALORA**) on 2026-11-08, not inferred from
source code.

| Fact | Value |
|---|---|
| Examination | `Summative Assessment — Grade 10`, id `1ecfed7d-5ee4-41a7-965a-fbfb318b8e17` |
| Configured duration | **120 minutes** (`exams.duration_minutes`) |
| Examination window | none (`starts_at` and `ends_at` both null) |
| Results published | true (`settings.results_published`) |
| Candidate | `Oxane ZOCLI`, id `5363ccad-046a-44c9-824b-4ad39c4cb450` |
| Attempt | id `486b7885-c1e8-44a5-aead-e5ae96777a9c` |
| Official start | **2026-11-08 08:23:11.351 UTC** (`exam_attempts.started_at`) |
| Authorised extension | 0 minutes |
| **Official deadline** | **2026-11-08 10:23:11.351 UTC** (start + 120 min) |
| `submitted_at` | **null** |
| Attempt status at investigation | **`in_progress`** (never closed) |
| Answers stored | **3**, first saved 08:24:18, last saved 08:28:44 |

### 1.1 Were the answers lost or the paper closed early?

**No.** The attempt was never submitted — neither by the student nor
automatically. It was still `in_progress` with all three saved answers intact
when this investigation began. **No premature automatic submission was recorded
for this attempt.**

### 1.2 What *was* recorded, and what it reveals

Six integrity incidents exist for the attempt, all within the first seven
minutes:

| Timestamp (UTC) | Event |
|---|---|
| 08:26:43 | `integrity_focus_lost` |
| 08:26:44 | `integrity_tab_hidden` |
| 08:26:46 | `integrity_focus_back` |
| 08:26:47 | `integrity_tab_visible` |
| **08:29:43** | **`integrity_page_leave`** (severity *high*) |
| 08:29:43 | `integrity_tab_hidden` |

The last answer was saved at **08:28:44**, 59 seconds before the
`page_leave` + `tab_hidden` pair at 08:29:43. After that instant the browser
stopped sending anything: no further saves, no presence heartbeat, no
`tab_visible`, no `page_leave` acknowledgement. The student's session ended
**1 h 53 min before her deadline**, with the paper still open and 47 of 50
questions unanswered.

This is the user-visible symptom that was reported: *the paper closed on her
while she still had time left.* The record shows the truthful cause: her session
was terminated (browser closed, tab discarded, or the device went down —
`page_leave` fires from `beforeunload`, which cannot distinguish those), and
**the application had no way to bring her back**: on any later visit the entry
gate refused her because the attempt had not been closed, and nothing else could
reopen a session that ended with the paper still `in_progress`.

### 1.3 What the record cannot tell us

Missing evidence, stated plainly rather than guessed:

* **No server-side request log.** The platform keeps no per-request history. The
  last-observed client activity is inferred from `exam_answers.updated_at`
  (08:28:44) and `proctoring_incidents.created_at` (08:29:43). We cannot say
  whether the page was closed by the student, crashed, or lost power.
* **No connectivity history.** The platform does not persist `offline`/`online`
  transitions. Only the incidents that were recorded at the time can be read.
  Neither the `offline` event nor a failed autosave was recorded for this
  attempt.
* **No admin or system action at 08:29.** `audit_logs` for the examination
  contains no `exam.*` or `attempt.*` entry on 2026-11-08 between 07:38 and
  12:16; the only later entries are the owner *viewing* the reports pages. No
  administrator closed, reset or extended this attempt.
* **No frontend error telemetry.** Unhandled browser exceptions are not
  collected, so a JavaScript failure in the candidate's tab cannot be confirmed
  or excluded.

### 1.4 Why the paper stayed open (and why that is the defect)

The only automatic closure in the record happens through
`/api/exam/state` or the daily sweep. Both require the attempt to be *read*
after its deadline. Her session ended before the deadline, and the scheduled
sweep (`vercel.json` → `0 3 * * *`, once a day on the Hobby plan) had not yet
run. So the attempt remained `in_progress` for 4 h 27 min, and still is. This is
the honest account of a paper that "closed by itself": it did not close, it
became unreachable.

---

## 2. The cause, and what was wrong in the code

Three defects compounded, and this fix addresses all three.

### 2.1 A session could end and never be resilient (the trigger)

`TakeExamClient` reads its attempt token from `localStorage`, which persists —
good. But there was no mechanism to *recover* an attempt whose session was torn
down while the paper was still open: the entry route
(`/api/exam/link-access`, `/api/exam/access`) refuses a candidate whose attempt
is not `in_progress`, and there was no path from "my browser died at 08:29" back
to "continue composing". Whatever the actual browser event was, the missing
recovery path is what turned it into a lost examination.

### 2.2 The deadline rule was duplicated three times (the latent hazard)

`attemptDeadline()` existed in `src/lib/exam.ts`, and the closing sequence
existed **three separate times**:

* inline in `/api/exam/submit`,
* inline in `/api/exam/state`,
* inline in `src/lib/expiredAttempts.ts`.

They agreed by luck rather than construction. Each had to re-derive the
deadline, re-apply the "conditional on `in_progress`" write and re-decide what
`submitted_at` should be. A change to one — or a defect in one — could close a
candidate's paper at a moment the others disagreed with. Nothing made early
closure *impossible*; it was merely not implemented anywhere yet.

Worse, `attemptDeadline()` itself could produce a deadline in the past or an
invalid `Date` from malformed data (`new Date(NaN)`, negative durations), and
the comparisons `now > deadline` fail silently when the right-hand side is
`NaN` — `NaN` comparisons are always `false` or unpredictable. That is the exact
class of defect that lets an early submission through without anyone noticing.

### 2.3 Nothing recorded *why* a paper closed

`exam_attempts` had no store of the instant that authorised a closure, and
`submitted_at` conflated "when the student pressed submit" with "when the request
happened to arrive". An investigator could not tell a legitimate closure from an
automatic one, or compute the deadline that applied at the time.

---

## 3. The fix

### 3.1 One deadline rule — `src/lib/examDeadline.ts`

```text
deadline = min(started_at + duration_minutes + extension_minutes,
               ends_at + extension_minutes)

an attempt may close automatically only when
  now >= deadline + SUBMISSION_CLOCK_MARGIN_MS   (2 000 ms)
```

Properties that matter:

* **Every failure mode moves the deadline later, never earlier.** An unreadable
  duration, an unreadable start, a missing window or a negative extension yields
  "no deadline" (`Infinity`) or the valid limit — never an instant in the past.
  An incomplete record therefore closes *late* (and is visible in the admin
  console) instead of closing a candidate who is still working.
* **The margin is added, never subtracted.** It absorbs ordinary latency between
  the server's computation and the browser's countdown so that normal slowness
  is not mistaken for expiry. It cannot cause an early closure because it only
  ever extends the window.
* **No concept of an incident.** The module knows about durations and instants
  only. There is no parameter through which an anti-cheating signal could reach
  it.
* `NaN`/`Infinity` are handled explicitly; `Date` is never constructed from
  `NaN`.

### 3.2 One submission lifecycle — `src/lib/examSubmission.ts`

`applyDeadlineSubmission(admin, attempt, exam, { reason, nowMs })` is now the
only code that closes an attempt. Callers: `/api/exam/submit`, `/api/exam/state`
and the scheduled sweep.

* `reason` is `"candidate"` or `"deadline"`. **A `"deadline"` closure is refused
  while the official time has not elapsed** (`refused_premature`) — the guard
  makes an early automatic submission structurally impossible rather than merely
  unlikely.
* `nowMs` is read from the server clock; the browser never supplies it.
* The status write is conditional on `status = in_progress`, so the operation is
  **idempotent**: duplicate requests, double-clicked buttons, retried fetches and
  a sweep racing the candidate all resolve to one closure.
* `submitted_at` is stamped with the moment of a candidate's own confirmation, or
  with the *deadline instant* for an automatic closure — so a late manual submit
  is never reported as an on-time one.
* Grading only **reads** `exam_answers`; no path modifies or deletes an answer.
* A successful closure appends one row to `exam_result_events`
  (`submitted` / `auto_submitted`) carrying the clock facts that authorised it.

### 3.3 A database that refuses premature closure — migration `0063`

* `exam_attempts.deadline_at` — the authoritative deadline, computed and stored
  by the database from the same formula (`exam_attempt_deadline_at`).
* `exam_attempts_authoritative_deadline` — recomputes it whenever `started_at`,
  `extension_minutes` or `exam_id` changes.
* `exam_attempts_no_premature_auto_submit` — **rejects any transition into
  `auto_submitted` while `now()` is still before the deadline**, with a named
  error. This holds against any writer: a future route, a script, a manual SQL
  fix, a scheduled job.
* A `"deadline"`-reason closure of an attempt with no computable deadline is
  refused outright.

### 3.4 The candidate client — `TakeExamClient.tsx`

* The countdown is **display-only**. When it reaches zero the client asks the
  server to re-read the paper; the server decides, and answers "still open" if it
  disagrees. A stalled tab, a fast device clock, a throttled interval or a
  tampered countdown can cause at most one extra read — never a submission.
* The polling is throttled (2 s) and stops as soon as the server reports the
  attempt closed.
* A record with no computable deadline renders `—` rather than an expiry.

### 3.5 Incident detection is unchanged, and separate

`src/app/api/exam/integrity/route.ts` records events and returns an escalation
level. It **cannot** close an attempt: it never names `auto_submitted`, never
updates `exam_attempts`, and does not import the submission lifecycle. This is
asserted by test, not only by inspection.

`warnAfter` / `reviewAfter` continue to drive the candidate-facing warning and
the invigilator review queue exactly as before. No penalty, disqualification or
closure follows from an incident automatically.

---

## 4. Coverage across every timed workflow

The rule is not specific to Grade 10. All of the following go through the same
`examBody` → `/api/exam/*` → `applyDeadlineSubmission` path, and therefore
inherit the same protection:

| Workflow | Where | Protected by |
|---|---|---|
| Summative assessments (Grades 7, 9, 10) | `exams` rows, shared link | same lifecycle |
| Formal examinations (AP Calculus AB/BC, MYP5) | `exams` rows, track-aware | same lifecycle |
| Formative assessments / quizzes with a deadline | `exams` rows | same lifecycle |
| Competition elimination rounds | `exams` rows (`settings.stage = "elimination"`) | same lifecycle |
| Any future timed assessment | — | same lifecycle + database trigger |

Live quizzes (`quiz_sessions`, `/play/[code]`) use a different, per-question
model: the server refuses a late answer (`phase === "time_expired"`) and the
client never submits on an event. Their behaviour is preserved deliberately —
they are not forced into the attempt-submission lifecycle — and they already have
the equivalent guarantee: nothing but the question clock closes an answer.

---

## 5. Protecting students who were composing during the change

* **Additive only.** No column dropped, renamed or retyped; no row deleted; no
  answer, timer, status or score rewritten by the migration.
* **No forced reload, no invalidated session.** `access_token` untouched.
* **Timers not reset.** `started_at` and `extension_minutes` are never modified,
  so every in-progress deadline is identical before and after.
* `deadline_at` is nullable and populated by trigger on the next write — no
  blanket `UPDATE` of live rows.
* Verified against a real PostgreSQL engine (PGlite) that an in-progress attempt
  keeps its start, extension, status and deadline when the migration runs
  (`scripts/test-exam-deadline-migration.mjs`).

---

## 6. Evidence

| Requirement | Evidence |
|---|---|
| Anti-cheating still records | `test-exam-submission-lifecycle.mjs` — 12 browser events recorded, attempt untouched |
| Anti-cheating cannot submit | same file — the integrity route cannot name/update/submit; asserted on source and behaviour |
| Early automatic submission rejected | lifecycle suite (1/5/30/119 min early refused); `test-exam-deadline-migration.mjs` (database rejects the UPDATE and the INSERT) |
| Deadline submission still works | lifecycle suite + sweep suite (closes at the deadline instant, stamped `auto_submitted`) |
| Idempotency | lifecycle suite (duplicate + six concurrent + sweep race → one closure) |
| Answers preserved | lifecycle suite (deadline never touches answers; refresh restores them) |
| Publication unchanged | lifecycle suite (published score returned, unpublished hidden, graded internally) |
| Real browser | `test-exam-premature-submit-browser.mjs` — 12 Chromium scenarios |
| Database formula matches the app | verified in production with `exam_attempt_deadline_at` (10:00+120 → 12:00, +15 → 12:15, window cap → 10:30) |

---

## 7. Operational note

`Oxane ZOCLI`'s attempt is past its deadline with 3 saved answers stored
unmodified. It will close as `auto_submitted`, at its deadline instant, with
those three answers preserved and graded, on the next read of the paper or the
next sweep. If the school judges that her session was lost for a technical
reason, the existing authorised remedy applies unchanged: an invigilator grants
a per-candidate extension from **`/admin/examinations/time-limits`** (the attempt
is still `in_progress`, so the grant is accepted), which moves her deadline
forward and lets her resume. No examination was created, duplicated or reset to
achieve this.
