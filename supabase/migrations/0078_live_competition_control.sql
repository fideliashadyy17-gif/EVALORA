-- EVALORA — live competition control centre
--
-- The existing quiz_sessions engine stays authoritative. This migration is
-- purely additive: it adds the state the organizer needs to run a whole
-- competition from the projected live page (answer locking, the final
-- reveal sequence, pause bookkeeping and per-round sessions) plus an
-- append-only table of ranking snapshots so the audience can follow how the
-- standings change after every question.
--
-- Nothing here rewrites, deletes or re-initialises an existing session,
-- participant, answer or score. Sessions that are live while this runs keep
-- their current question, timer and answers; the new columns arrive with
-- safe defaults (unlocked, stage 'idle', round 1).

set lock_timeout = '5s';

-- ── Organizer control state on the authoritative session ────────────────
alter table public.quiz_sessions
  add column if not exists answer_locked boolean not null default false,
  add column if not exists presentation_stage text not null default 'idle',
  add column if not exists paused_total_ms bigint not null default 0,
  add column if not exists results_revealed_at timestamptz,
  add column if not exists session_round integer not null default 1,
  add column if not exists previous_session_id uuid references public.quiz_sessions(id) on delete set null;

alter table public.quiz_sessions drop constraint if exists quiz_sessions_presentation_stage_check;
alter table public.quiz_sessions add constraint quiz_sessions_presentation_stage_check
  check (presentation_stage in ('idle', 'final_pending', 'suspense', 'third', 'second', 'champion', 'board', 'finished'));

alter table public.quiz_sessions drop constraint if exists quiz_sessions_paused_total_ms_check;
alter table public.quiz_sessions add constraint quiz_sessions_paused_total_ms_check
  check (paused_total_ms >= 0);

alter table public.quiz_sessions drop constraint if exists quiz_sessions_session_round_check;
alter table public.quiz_sessions add constraint quiz_sessions_session_round_check
  check (session_round >= 1);

create index if not exists idx_sessions_previous
  on public.quiz_sessions(previous_session_id);
create index if not exists idx_sessions_round
  on public.quiz_sessions(quiz_id, session_round desc);

-- ── Ranking history: one immutable snapshot per closed question ─────────
create table if not exists public.live_ranking_snapshots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.quiz_sessions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  question_index integer not null,
  quiz_question_id uuid references public.quiz_questions(id) on delete set null,
  is_final boolean not null default false,
  participant_count integer not null default 0,
  answered_count integer not null default 0,
  entries jsonb not null default '[]'::jsonb,
  leader_name text,
  computed_at timestamptz not null default now(),
  constraint live_ranking_snapshots_question_index_check check (question_index >= 0),
  constraint live_ranking_snapshots_counts_check check (participant_count >= 0 and answered_count >= 0)
);

-- One snapshot per question per session. A revisit never rewrites history:
-- the organizer's first official closure of that question is the record.
create unique index if not exists uq_live_ranking_snapshots_question
  on public.live_ranking_snapshots(session_id, question_index);
create index if not exists idx_lrs_session_order
  on public.live_ranking_snapshots(session_id, question_index desc);

alter table public.live_ranking_snapshots enable row level security;

-- Organizers may read the ranking history of sessions they host; anybody
-- else (including participants and the public screen) reads it through the
-- token-scoped server endpoints, which release only the revealed part.
drop policy if exists lrs_select on public.live_ranking_snapshots;
create policy lrs_select on public.live_ranking_snapshots for select to authenticated
  using (public.can_host_live_session(organization_id) or public.is_super_admin());

-- No authenticated insert/update/delete policy: snapshots are written by the
-- server (service role) from authoritative scores only.
drop policy if exists lrs_write on public.live_ranking_snapshots;

comment on table public.live_ranking_snapshots is
  'Append-only ranking snapshot per closed question, written from server-authoritative scores.';
comment on column public.quiz_sessions.answer_locked is
  'Organizer answer lock: blocks new participant submissions without pausing the timer or the presentation.';
comment on column public.quiz_sessions.presentation_stage is
  'Final-results reveal sequence: idle → final_pending → suspense → third → second → champion → board → finished.';
