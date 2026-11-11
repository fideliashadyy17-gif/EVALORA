# Live competition — organizer control centre

The projected live page (`/live/[publicId]/screen?token=…`) is now both the public
presentation **and** the organizer's control surface. The organizer never has to
leave the projector page, open another dashboard or switch tabs to run a
competition: previous/next question, pause/resume, answer lock, registration,
rankings, the results reveal, the podium and the return to a fresh waiting room
are all driven from the same screen.

## What was there before

| Area | Existing implementation |
| --- | --- |
| Projected page | `src/app/live/[liveId]/screen` + `PublicScreenClient.tsx`, gated by a signed, revocable display token (`src/lib/liveDisplayToken.ts`) |
| Organizer console | separate page `/dashboard/sessions/[id]/host` (`HostConsole.tsx` + `actions.ts`) with start/next/pause/end/admission/phases |
| Participant device | `/play/[code]` (`PlayClient.tsx`) with `/api/live/{join,state,answer}` |
| Authoritative state | `quiz_sessions` (`status`, `phase`, `current_question_index`, timers) + `/api/live/{screen,host/state,state}` |
| Phases | `waiting | countdown | question | time_expired | answer_reveal | leaderboard | podium | completed` (`src/lib/live.ts`) |
| Scoring / ranking | `scoreAnswer` at submission, `participants.score`, `rankedParticipants()` tie-break by score → total response time → join order |
| Realtime | polling (1.25 s screen, 1.5 s participant) + Supabase broadcast `live:<session>` `state-changed` |

## What was missing (and is now implemented)

1. **No organizer controls on the projected page** — the host had to leave the projector.
2. **No previous question** (`hostNext` was forward-only).
3. **No answer lock** separate from pausing; pause had no paused-duration bookkeeping.
4. **No ranking history** — rankings were recomputed on the fly, so no position changes, no lead changes.
5. **No reveal sequence** — `podium` showed the standings at once.
6. **No round separation** — nothing turned a finished competition into a fresh waiting room.

## Organizer controls on the projected page

A discreet bar is pinned to the bottom of the projected page. It is rendered
**only** after `GET /api/live/control` confirms, from the request cookies, that
this browser hosts (or administers) this exact session. The audience token alone
never unlocks it, and hiding it in devtools achieves nothing because every
command is re-authorized server-side.

* Start competition · **Next question** (advances even before the countdown ends)
* **Previous question** (restores the earlier question, full duration, no score changes)
* Pause / Resume (time spent paused is added back to the deadline)
* Lock / Unlock answers (independent of pause and of registration)
* Open / Close registration (keeps participants who already joined)
* Show / Hide leaderboard
* **End competition** (closes and locks immediately)
* **Reveal final results** → **Reveal 3rd place** → **Reveal 2nd place** → **Reveal champion** → full leaderboard
* Replay podium · **Finish & return to waiting room**

Keyboard shortcuts (organizer only): `→` next, `←` previous, `P` pause/resume,
`L` lock/unlock, `B` rankings, `R` reveal, `H` hide the bar. A small “⋯ Organizer”
pill restores a hidden bar. The bar never covers the question, options or maths
editor, and clicks do not reload the page.

### Backend contract

`POST /api/live/control` `{ session_id, command }`

* 401 when signed out, 403 when the caller neither hosts the session nor holds a
  creator role (`owner|admin|teacher|organizer`) in its organization; the platform
  Super Admin is authorized by the same `can()` helper.
* 400 for unknown commands or malformed ids, 409 for a refused transition
  (`applyLiveCommand` returns a message, e.g. “You are already on the first question.”).
* Transition commands (`start/next/prev/end/show_board/hide_board/finish`) are
  applied with a compare-and-set on `(current_question_index, phase)`; a double
  click updates 0 rows and returns `duplicate: true` instead of double-advancing.
* `finish` is additionally guarded by `presentation_stage`, so one round opens
  exactly one new session. Every command is written to `audit_logs`
  (`live.command.<name>`).
* The command engine is a pure function (`src/lib/liveControl.ts`) shared by this
  endpoint and the host console actions, so both surfaces produce identical
  transitions.

## How participants stay in sync

Nothing about the participant protocol changed. `/api/live/state` still returns
the participant's own token-scoped payload and now also `answer_locked`,
`presentation_stage`, `final` and `next_session`. Devices already recover the
current question by polling plus the existing broadcast, and a reconnect never
resets answers, score or timer (the timer is server-derived from
`question_started_at`/`question_deadline_at`). Answer submission returns 423 while
answers are locked and 409 while the session is paused.

## How the ranking evolves after every question

* When a question is officially closed (advance, end, or “show leaderboard”),
  the server recomputes the ranking from `session_participants.score` with
  `rankedParticipants()` and stores it in `live_ranking_snapshots`
  (unique per `session_id`+`question_index`; a revisit can never rewrite history,
  and the official final standing is recalculated with `recompute` so a scoring
  correction made before the reveal is reflected).
* The projected page shows the board between questions by default
  (`settings.leaderboard_between_questions = false` skips it), with each row's
  movement (`▲n` / `▼n` / `NEW`), a “New leader” badge when first place changes
  hands, the closed question number, and a “lead changes” strip (Q1: Ada, Q2: Esi…).
* During a running question an optional compact strip shows the current top three.
  The organizer can hide it (`show_leaderboard`) without losing the internal ranking.

## Suspenseful reveal

The reveal is a server-side state machine
(`idle → final_pending → suspense → third → second → champion → board → finished`).

* When the last question closes the session becomes `ended` with stage
  `final_pending`: answers lock, final scores are frozen, and the projector says
  “Final scores are locked”.
* The organizer presses **Reveal final results** → a drumroll screen with no names.
* Each **Reveal next** step adds exactly one place — third, then second, then the
  champion with a full-screen celebration, confetti and the generated fanfare.
* The server **never sends** a place before its stage: `revealedPodium()` slices
  the top three from the bottom up, so at the third-place stage the payload
  contains only rank 3, and the champion only appears at the champion stage.
  `/api/live/screen`, `/api/live/state` and the legacy `leaderboard` field are all
  gated the same way (unit-tested).
* **Show full leaderboard** reveals everybody; **Replay podium** restarts the
  sequence; the result data never changes during the suspense.

## Each participant's own result

`/api/live/state` adds `final` once the reveal starts: the participant's own
position and score, the podium places already revealed, the full board only at the
board stage, and how many places are still to come. The participant page shows
“Your final result — 3rd place of 8, 820 points”, the podium and (when shown) the
full leaderboard, without refreshing. No other participant's private data is
included.

## Return to the waiting room (new round, nothing erased)

**Finish & return to waiting room** sets the stage to `finished`, then the server
creates a **new** `quiz_sessions` row for the same quiz (`session_round + 1`,
`previous_session_id = old session`, fresh join code, waiting room, admission open)
and points the competition at it when it is a plain competition session. The old
round keeps its participants, answers, scores, snapshots and champion forever.

The projected page is redirected to the new session's signed screen link (with a
4-second transition card), and participant devices are offered the new join code
(“Join the next round”), so the room can start again immediately.

## Database changes (migration `0078_live_competition_control.sql`)

Additive only, with `lock_timeout = '5s'`:

* `quiz_sessions`: `answer_locked` (default false), `presentation_stage`
  (default `idle`, checked), `paused_total_ms`, `results_revealed_at`,
  `session_round` (default 1, ≥1), `previous_session_id` (self-reference), plus
  two indexes and three checks.
* `live_ranking_snapshots`: `session_id`, `organization_id`, `question_index`,
  `quiz_question_id`, `is_final`, counts, `entries jsonb`, `leader_name`,
  `computed_at`; unique `(session_id, question_index)`; RLS enabled with a single
  read policy for hosts/Super Admin (writes come from the server only).

No existing table, column or row was rewritten: live sessions keep their current
question, timer, answers and scores (verified in PGlite and on production data).

**Rollback** (no effect on competitions, participants, answers or scores):

```sql
drop table if exists public.live_ranking_snapshots;
alter table public.quiz_sessions
  drop column if exists answer_locked,
  drop column if exists presentation_stage,
  drop column if exists paused_total_ms,
  drop column if exists results_revealed_at,
  drop column if exists session_round,
  drop column if exists previous_session_id;
```

## Tests actually run

| Suite | Result |
| --- | --- |
| `scripts/test-live-competition-control.mjs` | 95 checks — command guards, pause arithmetic, answer lock vs pause vs registration, reveal order, champion never exposed early, movement deltas, migration 0078 in PGlite (live session untouched, unique snapshot, stage check, round check, cascade) |
| `scripts/test-live-control-route.mjs` | 14 checks — signed-out/signed-in-without-rights/participant rejected, host and Super Admin authorized, unknown command refused, one snapshot per close, double click blocked, reveal refused while live, final snapshot recomputed, `finish` creates exactly one round |
| `scripts/test-live-competition-ui.mjs` | 16 checks — controls absent for a token-only viewer, present for the organizer, commands POST-ed without navigation, keyboard control, suspense → third → second → champion gating, movement indicators, waiting-room roster, answer-lock presentation, return to the new waiting room |
| `test-live-three-interfaces.mjs` | 49 checks pass |
| `test-live-answer-scoring-integrity.mjs` | pass |
| `test-livekit-token-security.mjs` | 13 checks pass |
| Full `npm test` | all suites pass (see commit message) |

Not run: real-browser E2E (Playwright/Chromium cannot be installed in this build
sandbox, which also has no outbound HTTP to the production host), and no load test
— so no participant capacity above the platform's existing `max_participants`
(default 200 per session) is claimed.

## Limitations

* Movement and ranking history start from the first question closed **after** this
  release; earlier sessions have no snapshots (their live ranking falls back to the
  authoritative score table).
* Re-opening an earlier question restarts that question's timer for everyone; it is
  the organizer's explicit choice and cannot award points twice (answers are unique
  per participant and question).
* “Previous” does not reserve a snapshot for the abandoned question.
* Suspense is pure presentation: scores are never delayed or altered by it.
* Self-paced sessions keep advancing per participant; the next/previous/end controls
  are refused for them (the room controls still work).
