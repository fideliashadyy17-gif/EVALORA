# Live feature controls (answer tools)

**Status:** implemented 2026-11-13
**One rule:** *a tool is unavailable only when its switch is explicitly `false`.*
A session or examination that nobody configured keeps every tool, so the
feature changes nothing for anyone until an organiser deliberately restricts
something.

---

## 1. What an organiser can switch

The switches act on the **written-answer editor** (open-ended questions and the
"working" areas of structured questions). Short-answer boxes, multiple choice
and the other question types are not affected.

| Switch (`key`) | When it is off, the participant loses |
|---|---|
| Standard Keyboard (`standard_keyboard`) | Typing, pasting and dropping ordinary text. Moving the caret, deleting and the mathematics tools still work. |
| Math Keyboard (`math_keyboard`) | The on-screen mathematics keyboard and its button. |
| Symbols (`symbols`) | The MathLive symbols keyboard inside Math mode. |
| Scientific Keyboard (`scientific_keyboard`) | The scientific groups of the mathematics keyboard (11 of 20 groups); the basic groups stay. |
| Equation Editor (`equation_editor`) | Math mode and the "insert equation" button. |
| LaTeX Support (`latex`) | LaTeX mode and LaTeX source editing. |

A switch never changes, saves or submits an answer and never touches a timer.
A tool that is switched off while it is open closes; everything already written
stays on the page. Switching it back on restores it.

## 2. Where the switches live

| Assessment | Stored in | Written by |
|---|---|---|
| Live competition / live quiz | `quiz_sessions.settings.live_features` | `setLiveFeature` (super admin) |
| Examination sitting | `exams.settings.live_features` | *nothing yet — see §6* |

Both columns already existed (`jsonb`). **No table, column, policy or row was
added or changed.** `supabase/migrations/20261113120003_live_features_settings.sql`
only sets a column comment; the application does not depend on it.

All resolution goes through `src/lib/liveFeatures.ts`
(`resolveLiveFeatures`, `liveFeaturesFromSettings`, `withLiveFeature`). Unknown
keys and malformed values are ignored.

## 3. Who can change them

Only the **super admin**, from:

- `/admin/competitions/live` — the live monitoring screen, per running session;
- `/admin/competitions/<id>` — the competition page.

Both render `LiveFeatureToggles` (a client component), which posts to the
server action `setLiveFeature` in `src/app/admin/actions/competitions.ts`:

1. re-checks the super-admin session itself (a server action is a public endpoint);
2. accepts only a UUID session id and one of the six keys;
3. writes the changed switch and writes every other session setting back as read;
4. only writes while the session `status` is the one it read, and reads again
   otherwise — pausing and resuming rewrite the same column (`pause_snapshot`),
   so a switch can never overwrite a pause that happened in between;
5. records `live_session.feature_enabled` / `live_session.feature_disabled` in
   `audit_logs` (actor, session, organisation, switch);
6. re-renders both admin screens, so they show what is actually stored.

## 4. How a change reaches participants

| Page | Channel | Delay |
|---|---|---|
| `/play/<code>` (live) | `session.live_features` in `/api/live/state`, which the page already polls | about 1.5 s |
| `/take-exam/<attempt>` (examination) | `GET /api/exam/live-features?attempt_id=…` with `Authorization: Bearer <attempt token>` | on opening the paper, then every 60 s |

The examination endpoint is read-only, returns six booleans and nothing else,
is never cached, and takes the examination from the attempt — never from the
request. If it cannot be reached, the page keeps the last switches it was
given; a network fault never removes a tool and never hands one back.

The browser never reads assessment settings from the database directly.

## 5. Tests

| Suite | What it covers |
|---|---|
| `scripts/test-live-features-reporting.mjs` (in `npm test`) | The resolution rule; the wiring; the real server action and the real examination endpoint against an in-memory database (authorisation, validation, pause/resume race, audit, errors); the criterion report and the Word export. |
| `scripts/test-live-features-browser.mjs` (browser suite, `npm test -- --all`) | Real Chromium, mocked API: every switch on the live page and on the examination page, without a reload; the answer, the caret and the focus are preserved; a failed read changes nothing; no switch submits anything. |

## 6. Known limits

- **Examinations have no screen yet.** The examination page honours
  `exams.settings.live_features`, but no screen writes it, so every
  examination sitting currently keeps every tool.
- **Super admin only.** Organisation admins and hosts cannot change the switches.
- **Pause/resume in the same instant.** If the organiser pauses or resumes
  within the fraction of a second in which a switch is being saved, the pause
  or resume (which writes the whole `settings` value it read earlier) can
  overwrite the switch. The pause itself is never lost. Reload the admin page
  to see the stored state and click again.
- **Examination delay.** A change reaches an open examination paper within 60 s.
- **Not a lockdown.** The switches hide tools in the page; they are a classroom
  control, not a security boundary.
