# Original audio, participant presence and hint attention

This document describes the three additions to the existing EVALORA platform:
premium original music for live activities, real-time participant visibility in
live rooms and examinations, and the 30-second "needs help" layer on the hint
button. Nothing here replaces an existing module or requires an examination to be
recreated.

## 1. Music and sound — original EVALORA score

### Where the music comes from

There are no audio files. Every note is composed in `src/lib/liveMusic.ts` as
note data (MIDI numbers, rhythms, chord progressions) and synthesised in the
browser by `src/lib/liveAudio.ts` using the Web Audio API. That means:

* the soundtrack is original to EVALORA — no third-party recordings, samples or
  sound-alikes are downloaded, extracted or redistributed;
* it starts instantly on first load, works offline, and behaves identically on
  iOS/Android/desktop (no codec, CORS or range-request differences);
* it cannot drift from the licence of another platform.

### The six moments

| Moment | Track | Character |
| --- | --- | --- |
| Waiting room | `lobby` | 118 BPM, C major I–vi–IV–V, singable lead over a four-on-the-floor groove, seamless four-bar loop |
| Live question | `question` | 128 BPM, A minor i–VI–III–VII, driving eighth-note melody — energetic, never sleepy or dark |
| Final five seconds | `countdown` | 146 BPM, rising semitone line; takes over automatically from the question track |
| Question change | cue `transition` | short rising three-note stab |
| Correct answer | cue `correct` | bright major arpeggio, ~0.5 s |
| Incorrect answer | cue `incorrect` | two soft sine notes falling a third — honest, never humiliating |
| Leaderboard | `leaderboard` | 124 BPM, F major IV–V–vi–I |
| Podium | `podium` + cues `podium-third`, `podium-second`, `podium-champion` | 112 BPM ceremony progression; each place has its own fanfare |
| Champion / final celebration | `champion` | 116 BPM, F–C–G–Am with a high fanfare line |

There is no horror, suspense-of-fear, dark drone or buzzer anywhere in the score.
Tests assert the harmonic content, the melodic range, the headroom and that the
incorrect cue is a soft two-note motif rather than a sting.

### Mixing and engineering

* master → gentle compressor (−18 dB threshold, 4:1) → speakers;
* separate music and sound-effects buses under the master, each with its own
  gain, plus a 9 kHz low-pass on the music bus;
* a look-ahead scheduler (80 ms timer, 400 ms lookahead) schedules whole bars on
  the audio clock, so loops are seamless and do not drift with UI re-renders;
* section changes crossfade over 180 ms; nothing is cut abruptly, so there are no
  clicks;
* every note is enveloped (short attack, exponential release) and the summed
  simultaneous gain stays below 0.6 in the tests, leaving headroom for a cue to
  land on top of a full arrangement;
* levels are conservative by default (master 0.7, music 0.65, effects 0.8) and
  the browser's own volume still applies.

### Preferences (per device)

`AudioControls` exposes master, music and sound-effects sliders plus music on/off,
effects on/off and mute-all. Preferences are stored in `localStorage` under
`evalora:audio:v1:<role>:<session>` and are never sent to the server, so they
cannot be used to identify a student.

### Who plays the music

The **public screen/host console owns the room soundtrack.** Participant devices
are silent by default, which is what prevents a projector and twenty phones from
playing the same track twice, slightly offset. A host can deliberately share the
music with devices (`music_enabled`), and every listener can still lower the
volume or mute locally. Examinations never use the music engine: a formal sitting
has only the existing integrity tone, and no competitive music is introduced.

### Host controls

In the session console (`/dashboard/sessions/<id>/host`):

* **Room audio (master)** — `audio.enabled`;
* **Music on the public screen** — `audio.music_enabled`;
* **Sound effects** — `audio.sfx_enabled`;
* **Music identity** — `evergreen` (full score, default), `focus` (percussion
  removed, 80 % level), `celebration` (lifted mix), `off` (silence);
* **Volume** — `audio.volume`, applied on top of each listener's own settings.

All of these live in the existing `quiz_sessions.settings` JSON column, so no
migration is needed and older sessions keep their music when the new switch is
absent.

### Autoplay

Browsers block audio until a gesture. The projection page shows a "Tap for sound"
chip and its "Sound & fullscreen" button; the first pointer/key/touch anywhere
unlocks the context. The engine reports `blocked` instead of pretending to play,
and resumes the requested track the moment it is unlocked.

## 2. Participant presence

Presence answers one question — *who is in the room right now* — and nothing else.

### Live quizzes and competitions

`GET /api/live/state` now returns a `presence` block built from the session's
admitted participants: display name, avatar key and `last_seen_at`. The existing
1.5 s participant poll already touches this state, so presence costs no extra
request. `PresenceRail` renders it in the participant header as a compact
`N/total online` pill that opens an inline, scrollable list.

### Examinations

`exam_presence` (already used by the invigilator monitor) now also powers a
candidate rail:

* `POST /api/exam/presence` — authenticated heartbeat every 20 s (the existing
  route, extended with an optional `event: "leave"` for page hide). It writes one
  small row and nothing else;
* `GET /api/exam/presence?attempt_id=…` — the roster for **that attempt's exam
  only**, scoped from the attempt token rather than from the query string.

Candidates see first name + last initial (`Amina D.`), a deterministic avatar and
a connection state. They never see answers, scores, question numbers, marking,
hints, proctoring fields or attempt identifiers; roster keys are hashed so the
payload cannot be used to enumerate attempts.

### Connection states

| Last heartbeat | State shown |
| --- | --- |
| ≤ 45 s | Online |
| ≤ 120 s | Reconnecting |
| older / none | Offline |

A missed heartbeat is **not** a submission. Labels never say "submitted",
"finished" or "complete"; only the attempt's own status can say that. Saved
answers, the save queue and the deadline are untouched by presence traffic.

### Scale, recovery and scope

* rosters are capped (1 000 rows live, 2 000 exam) and scroll inside the drawer;
* the drawer opens inline, so it can never cover the question;
* hidden tabs stop heartbeating and refresh on visibility;
* presence is scoped by `session_id` / `exam_id`, written by the server only;
  RLS is unchanged (staff can read, clients cannot write).

## 3. Hint attention

The hint system itself (migration 0077, approved levels 1–3, `/api/exam/hint`,
`HintPanel`) already existed. This work adds the attention layer:

* the button is available from the first second — there is no 30-second gate;
* after **30 seconds** without a resolved answer it becomes
  **“💡 HINT — NEED HELP?”** with a calm 1.9 s gold pulse
  (`@keyframes evalora-hint-attention`), disabled under
  `prefers-reduced-motion`;
* an **incorrect** answer triggers the same attention immediately;
* a **correct** answer stops it; opening the hint stops it; changing question
  unmounts the panel (the parent keys it by `question_id`), so it can never
  follow a student to the next question;
* the 30 seconds are UI-only. The assessment deadline is computed on the server
  from `started_at + duration + extension` and is never influenced by this timer;
* the panel is pure presentation: it performs at most one GET to
  `/api/exam/hint` per question, never saves, submits, reloads or reports an
  integrity event;
* unsaved typing counts as answered, so a student mid-sentence is not told they
  have not started;
* hints remain question-specific, progressive and answer-free; when no hint has
  been approved the panel says so instead of inventing one.

## 4. Migration 0079

`supabase/migrations/0079_presence_and_audio_rails.sql` is additive:

* indexes for the two roster reads;
* table/column comments documenting the heartbeat contract;
* idempotent realtime publication for `exam_presence` and
  `session_participants`;
* a staff-only `exam_presence_summary` view (counts only, revoked from `anon` and
  `authenticated`).

It does not touch an examination, a question, an answer, a score or a result, so
existing published examinations gain the rail immediately.

## 5. What the automated tests can and cannot prove

`npm test` covers:

* **audio structure** (`scripts/test-live-audio.mjs`, 171 checks): six tracks,
  triads, melodic range, headroom, phase mapping, host switches, listener
  volumes, single-owner rules and the engine state machine against a fake
  AudioContext;
* **presence** (`scripts/test-presence-rails.mjs`, 63 checks): classification
  windows, privacy of names/keys, roster rendering and the migration/endpoint
  rules;
* **hint attention** (`scripts/test-hint-attention.mjs`, 45 checks): thresholds,
  triggers, resets, rendering, network isolation and CSS.

They **cannot hear the music**. No browser or audio device is available to this
environment (Playwright/Chromium are not installed and outbound audio cannot be
rendered), so the actual listening test — "does the question track feel energetic
in the room" — must be performed by a human on a real projector and a real phone.
That limitation is reported, not hidden.
