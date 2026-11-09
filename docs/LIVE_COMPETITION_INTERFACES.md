# EVALORA — Live Competition: Three Separate Interfaces

EVALORA live competitions are deliberately split into three separately routed,
separately authorized interfaces. They share one server-authoritative
`quiz_sessions` engine, but never one generalized payload.

| Interface | Route | User | Authorization | Data exposed |
|---|---|---|---|---|
| Host Control Screen | `/dashboard/sessions/[id]/host` | Organizer / host | Signed-in owner, admin, teacher, organizer, session host or Super Admin | Operational counts, participant monitor, answer distribution, private answer key, controls |
| Public Live Screen | `/live/[competition-or-session-id]/screen?token=…` | Projector / TV operator | Signed, session-scoped, revocable display token | Public title, current question/options, deadline, aggregate answer count and organizer-released rankings only |
| Student Answer Screen | `/play/[code]` | Participant | Join code creates a participant row and an unguessable participant access token | Own avatar/name/score/status/answer, current public question and organizer-released rankings |

## Recommended live workflow

1. Create/publish the quiz or competition and open the Host Control Screen.
2. In **Secure public projection screen**, open or copy the Public Live Screen
   link onto the projector/TV computer.
3. On the projection computer, click **Enable sound & fullscreen**. Browsers
   require this explicit action before audio may start.
4. Share the participant QR/code. Each student opens `/play/[code]`, enters a
   display name/reference and selects one of 12 original EVALORA illustrated
   avatars.
5. Keep admission open, close it, or enable participant approval. Pending
   participants can be approved/rejected from the private monitor.
6. Click **Start competition**. The server creates a future question start and
   hard deadline; every synchronized screen shows the countdown first.
7. During a question, the host alone sees who has/has not answered, response
   times, connection state, answer distribution and the private answer key.
8. At the deadline, answers lock on the server. Use **Reveal correct answer**,
   **Show intermediate rankings**, or **Next question** as required.
9. End the competition, then explicitly choose **Display final podium** when
   the room is ready.

## Host Control Screen

The host screen is an operational control center showing:

- registered, joined, connected, disconnected, pending and finished counts;
- answered/not-answered counts for the current synchronized question;
- current question, remaining questions, server-synchronized timer and progress;
- per-participant avatar, name/reference, admission status, connection state,
  last-seen time, score, number answered, current-question status, average
  response time and reconnection count;
- private current-question answer key and aggregate option distribution.

Controls include admission open/close, approval requirement, participant
approve/reject/block/restore, explicit start, pause with deadline-preserving
resume, answer reveal, intermediate leaderboard, next question, end, final
podium, public-screen enable/rotate/revoke, animation controls, join-code
visibility while waiting, music/sound-effect enablement, theme and volume. The host can also set a
master level, separate music and effects levels, mute all, or restore sound
defaults. Press **Save volumes** after adjusting the sliders. These settings are
stored with the session (not as personal device preferences), and apply to the
public projection screen only; channel levels are relative to the master.
Older sessions retain their previous master level with both channels at full.
The current generated tones are placeholders, not a mastered sound library.

Every host mutation is a server action that re-checks the signed-in user's
creator/host authorization for the session's organization. Host monitoring data
comes from `/api/live/host/state`, which repeats that authorization before any
service-role read and returns no participant access tokens or answer payloads.

## Public Live Screen

The dedicated route is:

```text
/live/[competitionId]/screen?token=<signed-display-token>
```

Standalone quiz sessions use their session ID in place of a competition ID.
The ID is only an address. Access requires a token with all of these
properties:

- HMAC-signed with a server-only secret;
- bound to exactly one `quiz_sessions.id`;
- bound to `quiz_sessions.display_token_version`;
- seven-day expiry;
- immediately revocable/rotatable by incrementing the token version.

`/api/live/screen` builds the projection payload field-by-field. It never
returns participant access tokens, individual answers, private analytics,
moderation data or organizer controls. `publicQuestion()` strips answer keys;
the key is included only in the organizer-selected `answer_reveal` phase.
Rankings are included only in `leaderboard` or `podium` phase.

The projection screen supports waiting room, starting countdown, active
question, expired question, answer reveal, intermediate leaderboard, final
podium/celebration, paused and completed states. It renders rich mathematical
content/media through the same `RichContent` engine and restores the last
confirmed state while reconnecting after a network interruption.

Legacy `/live/[join-code]` intentionally renders a locked explanation and no
competition data. A participant join code is not projection authorization.
The legacy `/api/live/projector` endpoint returns HTTP 410.

## Student Answer Screen

The participant flow is mobile-first. After code entry, the participant:

1. enters a display name and optional class/reference;
2. previews and selects an illustrated avatar;
3. can change the avatar before final join;
4. receives a server-generated participant ID/access-token pair stored only in
   that browser's local storage for this join code.

The selected `avatar_key` is stored on `session_participants` and reused by the
participant screen, host monitor, public rankings and podium. The 12 SVG
avatars are original EVALORA vector artwork (owl, fox, panda, lion, frog, cat,
penguin, koala, robot, rocket, whale and bee), not emoji or third-party assets.

`/api/live/state` validates the participant token on every request. It returns
only that participant's own answer/status. In synchronized mode it withholds
correctness, earned points for the current answer, explanations and the answer
key until `answer_reveal` or the end of the session. `/api/live/answer`:

- validates the participant token and admission status;
- accepts only the current server-selected question;
- rejects countdown, reveal, leaderboard and expired phases;
- enforces the stored server deadline (with the existing 2-second grace);
- scores objective answers on the server;
- relies on the unique `(participant_id, quiz_question_id)` constraint for
  idempotent retries with no duplicate row or double score.

The browser retries the identical submission once after a network/5xx failure
while retaining the selected answer. Refresh/reconnection restores the saved
participant identity and authoritative server state.

## Authoritative state machine

`quiz_sessions.status` remains the lifecycle (`lobby`, `live`, `paused`,
`ended`). `quiz_sessions.phase` is the presentation state:

| Phase | Meaning |
|---|---|
| `waiting` | Lobby / waiting room |
| `countdown` | Server question start is in the future |
| `question` | Answers are open until `question_deadline_at` |
| `time_expired` | Derived server-side after the deadline; answers locked |
| `answer_reveal` | Organizer has released the key/explanation |
| `leaderboard` | Organizer has released intermediate rankings |
| `completed` | Ended without public podium release |
| `podium` | Organizer has released final rankings/celebration |

`effectivePhase()` in `src/lib/live.ts` is used by the participant, public and
host APIs. Browser clocks render countdowns from `server_now` offsets, but do
not decide whether answers or answer keys may be released.

## Database and RLS

Migrations:

- `0008_live_three_interfaces.sql` — phase/deadline/admission/approval fields,
  display-token version, participant avatar/reconnection telemetry, participant
  moderation statuses and tighter participant/answer policies.
- `0009_live_session_rls.sql` — organizer-only direct `quiz_sessions` reads.
- `0010_live_session_rls_helper.sql` — non-recursive linked-participant helper
  for the session policy.

Direct PostgREST boundaries:

- anonymous users see no live session, participant or answer rows;
- an authenticated linked student sees only their own participant row, their
  own answers and their linked session row;
- creator/organizer roles and the actual session host can read operational
  rows for their organization;
- guests and the public screen never query tables directly; they use the
  token-scoped APIs above.

Supabase Realtime broadcasts on `live:{sessionId}` contain only a
`state-changed` nudge and timestamp—no question, score or answer data. Every
client refetches through its own authorized API. Polling remains the recovery
path if a broadcast is missed.

## Music and sound effects

The projection screen is the only background-music output. It uses original
generated WebAudio tones (no copied/external music files):

- **Evergreen** — warm classroom pattern;
- **Focus** — slower concentration pattern;
- **Celebration** — brighter finals pattern;
- **Off**.

The organizer controls enablement, theme, volume and effects. Question,
countdown, expiry, reveal, leaderboard and podium events are keyed once per
server phase/question so reconnecting does not replay them. Student devices
only make an optional short local confirmation tone after a tap; they never
run background music.

## Verification

Automated checks:

```bash
node scripts/test-live-three-interfaces.mjs
node scripts/test-rich-content.mjs
node scripts/test-admin-utils.mjs
node scripts/test-school-systems.mjs
node scripts/check-contrast.mjs
npx tsc --noEmit
npm run lint
npm run build
```

The live-interface suite covers 49 checks: answer-key stripping (including
short-answer accepted answers), authorized reveals, phase/deadline derivation,
settings, fair ranking tie-breaks, avatar validation and display-token
scope/expiry/tampering/revocation.

Database verification performed against the EVALORA Supabase project:

- DEMO student JWT: 1 linked session, 1 own participant row, 8 own answers;
- DEMO teacher JWT: 3 DEMO sessions, 6 participants, 48 answers;
- anonymous role: 0 sessions, 0 participants, 0 answers.

Browser verification covers the participant join/avatar flow at smartphone and
tablet sizes plus locked legacy/tokenless public screens. A full multi-device
live run still requires the manual acceptance script in `docs/TESTING.md` on
the deployed URL with a signed-in organizer, a projector display and at least
two participant devices/browsers.

## Troubleshooting

- **Public screen says secure link required:** open/copy a fresh link from the
  Host Control Screen; an old token may have expired or been rotated/revoked.
- **No sound:** click **Enable sound & fullscreen** on the projection device;
  check the host music/theme/volume controls and browser/device volume.
- **Participant cannot join:** admission may be closed or approval pending.
  Existing participants can still reconnect with their saved browser identity.
- **Participant sees no correctness after answering:** in synchronized mode,
  use **Reveal correct answer**; points/explanation release with that phase.
- **Old projector bookmark stopped working:** this is intentional. Join codes
  no longer authorize projection data.
