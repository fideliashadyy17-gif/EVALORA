# Two red CI jobs, and the production defect behind one of them

**Date:** 2026-11-27 · **Branch:** `arena/fb70276a-evalora` (on top of the Phase 4 formatting rollout, PR #112)
**Jobs:** `Exam browser suites` (`exam-browser`) and `Landing page visual verification` (`screenshots`)

Both jobs were red on every run that ever existed for them: three runs on the
Phase 2/3 pull request (#111) and the first run on the Phase 4 pull request
(#112) failed the same steps with the same annotations. They were added recently
precisely because the browser suites "had drifted stale for weeks without anyone
noticing", and they had never been green. Since the sandbox cannot download
GitHub Actions logs, the diagnosis was made from the check-run annotations
(through the API) plus a local reproduction of each job: the same mock-origin
production build, the same Chromium, the same three servers, the same commands.

Result: **five stale test expectations repaired, one admission-screen defect
fixed, and one production availability defect fixed.** All ten steps of the
`exam-browser` job and all three verifiers of the `screenshots` job now pass
locally.

---

## 1. `exam-browser` — three of the five browser suites were stale

Failing on both pull requests, identically: `test-exam-browser`,
`test-exam-messaging-browser`, `test-shared-browser-sequential-browser`.
`test-assessment-lockdown-browser` and `test-exam-premature-submit-browser`
passed, which is what proved the Chromium toolchain itself was fine.

### 1.1 The candidate paper's draft guard moved (suite stale, product right)

`test-exam-browser` waited for *"Save this answer or discard the changes before
submitting."* after clicking **Submit examination** with an unsaved answer. The
paper no longer answers that click with a warning: `requestSubmit()` flushes the
draft into the offline answer queue and opens the final-check dialog, which
states how many answers **the server** holds ("You have saved 0 of 2 answers.").
The safety property the suite cared about is still true and is now asserted more
directly — confirming the dialog while an answer is unconfirmed is refused in the
UI with *"Some answers are not confirmed yet…"* and **no `POST /api/exam/submit`
is made** — and the rest of the flow (offline queue, navigation, same-tab reload
recovery, retry on reconnect, confirmed discard, single submission, token and
active-session purge, closed-attempt marker) is asserted against the current
copy. The `draftWarning` string still exists for the one path that reaches it (a
runner that refuses to flush); the suite no longer pretends it is the main one.

### 1.2 The messenger badge and the closed-drawer poll (suite stale, product right)

`test-exam-messaging-browser` failed at its first wait. Two causes:

* the badge was detected by requiring the launcher button's `textContent` to be
  exactly `Messages1`, and JSX puts whitespace between the label and the badge
  span — the count is now read from the badge itself, together with its
  `n unread message(s` label, and only while the launcher is actually rendered
  (`aria-expanded="false"`);
* the suite waited 25 s for a teacher message to arrive in a **closed** drawer,
  but a closed, healthy drawer deliberately stretches its poll to 30–35 s with
  jitter so 1,000 candidates never synchronise a burst. The scenario is "a
  message arrives without a reload", so the suite now waits out a real poll
  instead of forcing one.

All five of its scenarios (A, C, B, E, H) pass unchanged.

### 1.3 The admission device check — and a real defect behind it

`test-shared-browser-sequential-browser` never reached the paper: it waited for
a **Verify and Begin** button that was not there. The Phase 3 admission device
checks now gate that button, and a headless browser has no camera while
`proctoring.require_camera_check` defaults to `true`. The panel behaved exactly
as designed — *"No camera was found on this device. You can still sit the
examination."* plus an acknowledgement checkbox — and the suite, written before
the feature existed, did not know to tick it. It also selected the consent
checkbox with `getByRole("checkbox").first()`, which the device-check panel had
silently turned into the acknowledgement box.

**Following that stale expectation found a genuine defect.** While only the
candidate's acknowledgement is outstanding, all three admission buttons read
*"Completing device check…"* and stay disabled. Nothing is running: the platform
is waiting for the candidate. On a desktop without a webcam — an ordinary
candidate, not an error — that reads as a hang on the one screen where a hang
costs an examination, and it is exactly what a timed-out test looked like.

`useDeviceCheckGate` now tells the two apart and exposes them:

```ts
const running = required && (!report || report.running);
const awaitingAcknowledgement = Boolean(report?.awaitingAcknowledgement);
const blocking = running || awaitingAcknowledgement;
const state: DeviceCheckGateState = !required ? "none" : running ? "running" : awaitingAcknowledgement ? "acknowledge" : "clear";
```

`/exam/join/[token]` and both buttons of `/exam-access` render
*"Confirm the device check to continue"* (new `examAccess.deviceCheckAcknowledge`
key, translated in all three dictionaries) in the `acknowledge` state and keep
*"Completing device check…"* only while something is actually running.
`scripts/test-proctoring-device-checks.mjs` gained a check that pins the
distinction in both screens and in every dictionary (32 → 33 checks).

The suite now walks a real candidate through it: wait for the panel's verdict,
assert the button is **not** claiming to still be working, tick the
acknowledgement, then tick consent by its own label.

### 1.4 The rest of the job

The steps that never ran in CI (the job died at "Run browser suites") were
reproduced too, and pass: `test-printable-paper-page` + `test-printable-paper-browser`,
`test-exam-messaging-routes` against the server that holds the cron secret, and
`test-cron-sweep-routes` against both the server with and the server without it.

---

## 2. `screenshots` — one stale check, and a production defect underneath

The job's `Report result` step failed because at least one of its three
verifiers returned non-zero, and the job ran 24 m 52 s against a 25-minute
limit. Both facts had the same root cause.

### 2.1 An unreachable database cost ~21 seconds per page render

Measured, in this sandbox, against a production build whose Supabase origin
points at a closed local port:

| | every public page (`/`, `/login`, `/cookies`, `/pricing`, `/terms`, …) |
|---|---|
| before | **~21 s**, HTTP 200, CPU idle (30 ms of CPU over 8 s), no socket open |
| after | **29–370 ms** |
| static asset (`/icon.svg`) | 55 ms (unchanged — the server was never slow) |

The wait was not the database. `@supabase/postgrest-js` retries an idempotent
request up to three times with exponential backoff (1 s, 2 s, 4 s) whenever the
fetch rejects, so **one** unreachable query costs ~7 s — measured directly:
a raw `fetch` to the closed port fails in 2–33 ms, the same query through
`supabase-js` takes 7,014 ms. A public page reads branding, announcements,
formatting and the locale in sequence: 3 × 7 s ≈ 21 s of timers, spent arriving
at the fallback it was always going to use.

In CI the Supabase secrets are placeholders, so every landing check crawled. In
production the database is reachable, so nobody sees this today — but it is an
**outage amplifier**: during any Supabase incident, or with one misconfigured
environment variable, every page on the platform hangs for ~21 s instead of
serving its compiled-in defaults, while serverless functions bill for the wait.

`src/lib/supabase/server.ts` now passes `db: { retry: false }` to **both** server
client factories (the request-scoped SSR client and the service-role client),
with the reasoning recorded above the constant. Every server-side read in this
codebase has a documented fallback — compiled-in brand defaults, schema-default
configuration, the platform-wide formatting profile — so failing fast is
strictly better.

**`src/middleware.ts` builds a third client, and it opts out too.** That file
already bounds every upstream call it makes (a 2.5 s fetch timeout and a 3.5 s
auth budget raced against a timer), so a 7 s retry stack on its maintenance-gate
`profiles` read would contradict its own design — on the edge, before a page even
starts rendering. These three are the only construction sites in `src/`: every
other module imports the `SupabaseClient` **type** and is handed one, so it cannot
configure a policy. The suite asserts that set exactly, so a fourth site has to
decide deliberately.

The **browser** client keeps the library default: a flaky connection on a
candidate's own device is exactly what the backoff is for, and the candidate's
answer queue, not a page render, owns that wait. The asymmetry is asserted so it
cannot be "cleaned up" into either extreme.

New suite `scripts/test-supabase-server-fail-fast.mjs` (8 checks) runs the real
client factories against a closed port and times them:

* a raw fetch to the closed port is refused at once (so the timings mean
  something, and the suite says so if a port is unexpectedly occupied);
* `createAdminClient()` and `createClient()` each give up in under 1,500 ms;
* **the ceiling is proven real** — a client left on the library default takes
  ≥ 2 s for the same query, so the two checks above cannot pass by accident;
* both factories pass the option explicitly, and the comment explaining the
  backoff is still there;
* the edge client in `src/middleware.ts` opts out as well;
* those three files are the **only** modules in `src/` that import a client
  constructor as a value (a walk of the tree, type-only imports excluded), so a
  new construction site fails the suite until it chooses a policy;
* `src/lib/supabase/client.ts` does **not** disable retries.

### 2.2 The honesty pin was reading the flight data, not the copy

`verify-landing-html.mjs` forbids selling a placeholder: `/coming soon/i` must
not appear. It appeared — inside the serialized RSC flight data, as
`common.comingSoon`, an **unused** label in the translation catalogue that ships
in every page's payload. No visitor reads it. The same trap was waiting for any
future catalogue entry containing "AI", which the neighbouring pin also forbids.

The pins (`mustSay` and `mustNotSell`) now read the **rendered** copy: the
document with `script`, `style`, `noscript` and `template` removed, whitespace
normalised. All four disclosure pins still pass against visible text, so the
checks got stricter about what they mean, not weaker: "recording is not enabled",
the Windows 10 lockdown scope, human review and manual payment verification are
all confirmed as copy a visitor actually reads.

`verify-landing.mjs` also accepts `CHROME_ARGS` now, so it can run in a container
without user namespaces (`--no-sandbox`); unset, the launch is byte-for-byte what
it was. Its 21 layout, interaction, focus and reduced-motion checks pass, as does
`verify-attribution.mjs` (19 surfaces).

`verification/` — the screenshots and report the visual verifier writes — is now
git-ignored: CI uploads it as a build artifact, and it was one `git add -A` away
from being committed.

---

## 3. Verification

Everything below was run in this sandbox against a production build made exactly
the way the workflows make it (mock Supabase origin inlined and asserted present
in `.next/server`).

| Step | Result |
|---|---|
| `test-exam-browser` | PASS (rewritten; 3 state requests, 7 save attempts, 1 submission) |
| `test-exam-messaging-browser` | PASS — scenarios A, C, B, E, H |
| `test-shared-browser-sequential-browser` | PASS — 6 real-Chromium checks, 5 sequential students |
| `test-assessment-lockdown-browser` | PASS (was already passing; re-run after the admission change) |
| `test-exam-premature-submit-browser` | PASS (re-run after the admission change) |
| `test-printable-paper-page` + `-browser` | PASS |
| `test-exam-messaging-routes` (server with the cron secret) | PASS |
| `test-cron-sweep-routes` (with and without the secret) | PASS |
| `verify-landing.mjs` (5 viewports, interactions, focus, reduced motion, console) | PASS — 21 checks, 0 failing |
| `verify-landing-html.mjs` (axe, structure, links, honesty pins) | PASS — 68 checks, 0 failing |
| `verify-attribution.mjs` (15 public routes, 3 redirecting, the landing footer) | PASS — 19 checks |
| `scripts/test-proctoring-device-checks.mjs` | 33 checks |
| `scripts/test-supabase-server-fail-fast.mjs` (new, runs in `npm test`) | 8 checks |
| `test-role-middleware`, `test-incident-outage-recovery`, `test-performance-regressions`, `test-admin-review-and-canonical-domains` | PASS (the middleware client change) |
| `npx tsc --noEmit` (clean `npm ci` tree) | exit 0 |
| `npm run lint` (clean tree) | 0 errors, 21 pre-existing warnings |
| `npm test` (clean tree) | **188 suites, 0 failed, 8 browser/cron suites skipped, 10,470 checks** |
| `npm run build` (production, clean tree) | exit 0 — "Compiled successfully in 69s" |

## 4. What this changes in production

1. **An unreachable database now costs milliseconds, not ~21 s per page.** This
   is the only change here that alters runtime behaviour on a healthy platform:
   nothing changes while Supabase answers, and everything changes when it does
   not (or when an environment variable is wrong).
2. **A candidate whose camera could not be verified is told what to do** instead
   of watching a button claim the platform is still working.
3. Retries stay on for candidates' own devices; the answer queue still owns
   offline saves.

**What was given up, stated plainly.** The library also retries a `503` (PostgREST
warming its schema cache) and a `520`, honouring `Retry-After`. Server reads no
longer do, so a page rendered inside that brief window after a schema change
serves its compiled-in defaults for that one request instead of waiting it out.
That is the intended trade: these pages are dynamic, so the next request is
correct, and defaults-for-one-request is a far smaller harm than ~21 s for every
request during an actual outage. Writes were never affected either way —
postgrest-js only ever retries idempotent methods (`GET`, `HEAD`, `OPTIONS`), so
no write lost a retry it used to have.

## 5. Method note

The sandbox cannot download GitHub Actions logs (the results host is outside the
allowed egress), so the failing steps and suites were identified from check-run
annotations through `api.github.com`, then reproduced locally with the workflows'
own commands. Two rules came out of it and are worth keeping:

* **Never run `npm install` while a build or a `next start` server is running.**
  Doing so mid-flight replaced 68 packages under a live server and wedged it —
  every route then hung, which looked exactly like the defect in §2.1 and was
  not. The tree was restored with `npm ci` and the measurement repeated.
* **`package.json` and `package-lock.json` must not change** when installing
  test-only packages: `--no-save` alone still rewrote the lockfile, so both were
  reverted before committing. The browser and verifier packages stay
  install-on-demand, exactly as the workflows do it.

---

## 6. Outcome on the pull request and in production

Pushed to PR #112 and watched: **all five checks pass**, on the first green run
either job has ever had.

| Check | Before | After |
|---|---|---|
| `exam-browser` | fail after 13 m 6 s (three suites) | **pass in 3 m 49 s** |
| `screenshots` | fail after ~25 m (the job's own limit) | **pass in 2 m 2 s** |
| `build-windows` | pass | pass (2 m 27 s) |
| Vercel preview build | pass | pass |

The collapse in runtime is itself evidence for §2.1: those jobs were not doing
more work than the passing runs, they were waiting ~21 s per page for a backoff
that never produced an answer. With the Supabase secrets absent in CI, every
public page was paying it.

PR #112 (this work plus the Phase 4 formatting rollout) was merged as `bae922a`,
which deployed production automatically: **`dpl_12CTsvavpj6VEFDEQ2QwHJoLLRs7`
READY / PROMOTED**, aliases assigned, built in 72.6 s. `/` and `/login` were
fetched from production afterwards and render complete documents. Rollback path:
`dpl_EsmPSn5JVdiHMsabPYBAsMNYfxFM` (the PR #111 merge), with nothing to undo in
the database — none of this touched schema or stored values.

Still open, and now worth doing: the audit's Phase 7 authenticated end-to-end
pass. A real Super Admin changing `formatting.date_format` or
`localization.default_timezone` in the Control Center and watching a dashboard
table move is the one verification that cannot be faked with a mock origin, and
Phase 4 made it observable.
