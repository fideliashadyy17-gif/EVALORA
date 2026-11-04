# EVALORA — Architecture

## Overview

```
Browser (participants, candidates, staff)
   │
   ├── Next.js 15 on Vercel (SSR pages, server actions, API routes)
   │      ├── Supabase Auth (email/password, recovery)
   │      ├── PostgreSQL 17 + RLS (all tenant data)
   │      ├── Supabase Storage (payment proofs [private], question media)
   │      └── Supabase Realtime (broadcast "state-changed" for live quizzes)
   └── LiveKit Cloud (WebRTC video for proctoring; tokens minted server-side)
```

Two kinds of traffic:

1. **Authenticated staff traffic** uses the anon key + user JWT. PostgreSQL
   Row Level Security is the security boundary; server actions add explicit
   role checks (`src/lib/auth.ts`).
2. **Guest traffic** (live-quiz participants, exam candidates) never touches
   tables directly. API routes under `src/app/api/` validate an unguessable
   UUID access token, then use the service-role client. This keeps RLS fully
   closed to anonymous users while allowing account-free participation.

## Data model (public schema)

Platform: `platform_settings`, `profiles`, `plans`, `audit_logs`,
`notifications`, `support_tickets`.

Tenancy: `organizations`, `organization_members` (9 roles), `invitations`.

Commerce: `subscriptions`, `payment_requests` (pending → approved/rejected →
activation only on approval).

Content: `question_categories`, `questions` (+ `config` JSONB for media,
numeric answers, matching pairs), `question_options`, `quizzes`,
`quiz_questions`.

Live: `quiz_sessions` (join code, mode, status, current index,
`question_started_at`), `session_participants`, `participant_answers`
(unique per participant+question → idempotent submission).

Examinations: `exams`, `exam_candidates` (personal access codes),
`exam_attempts` (server `started_at`, stored question order, flagged list),
`exam_answers` (autosaved; manual marks preserved during grading).

Proctoring: `proctoring_rooms`, `proctoring_incidents` (open → valid /
invalid / investigating, always human-reviewed), `proctoring_recordings`
(metadata; egress wiring requires storage credentials — see Infrastructure).

## Security design

- **RLS everywhere.** Helper functions (`is_super_admin`, `org_role`,
  `can_manage_org`, `can_create_content`) are `SECURITY DEFINER` to avoid
  policy recursion. No anonymous table access at all.
- **Answer keys never leave the server before an authorized reveal.**
  `publicQuestion()` in `src/lib/live.ts` strips `is_correct`, accepted
  answers, numeric solutions and pair mappings before anything reaches a
  device. `revealedQuestion()` is called only for the organizer-selected
  `answer_reveal` phase (or authorized staff views).
- **Three scoped live APIs.** Host state, participant state and public-screen
  state are separate endpoints with separate authorization and payload
  construction; see `docs/LIVE_COMPETITION_INTERFACES.md`.
- **Server-authoritative time.** Live questions enforce the stored
  `question_deadline_at` (with a legacy started-at fallback and 2 s grace);
  exam deadlines are
  `started_at + duration` (capped by the exam window close). Browser clocks
  are only used for display, using a server-time offset.
- **Server-side scoring** in `src/lib/scoring.ts` for all objective types;
  open-ended answers enter a corrector queue. Manual marks are never
  overwritten by re-grading.
- **Entitlements enforced server-side** (`src/lib/entitlements.ts`) before
  creating quizzes/questions/exams/members and before issuing LiveKit tokens.
- **LiveKit** grants are room-scoped: candidates can only join their own
  exam's room while their attempt is in progress; supervisors subscribe-only.
  The API secret exists only in server env vars.
- **Audit logging** of privileged actions (payments, plans, suspensions,
  grants, settings) to `audit_logs`.
- **Uploads**: payment proofs go to a private bucket namespaced by user id
  with type/size validation; Super Admin views via short-lived signed URLs.

## Real-time strategy

Live quizzes combine short polling (2 s, authoritative state endpoint) with
Supabase Realtime **broadcast** nudges (`live:{sessionId}`) from the host
console for instant updates. Broadcasts need no table exposure, so guests
stay outside RLS. Video uses LiveKit's SFU (adaptive simulcast); the
supervisor grid paginates at 12 feeds/page to protect browser CPU/bandwidth.

## Modularity / future providers

- Video is isolated behind `/api/livekit/token` + two client components;
  swapping providers touches only those.
- Payments are intentionally manual; a future PSP can create
  `payment_requests` rows in `approved` state via webhook without touching
  activation logic.
- Plans, trial length, payment instructions and the Super Admin identity are
  data (`plans`, `platform_settings`), not code.
