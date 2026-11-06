-- EVALORA — three-interface live competition architecture
--
-- The existing quiz_sessions engine remains authoritative. This migration
-- adds explicit presentation/admission state, participant avatars and
-- connection telemetry, a revocable version for signed public-display
-- tokens, and tighter read policies for private live participant data.
-- Guest participants and the public screen never query these tables
-- directly: they use token-scoped server endpoints.

-- ── Authoritative session/presentation state ──────────────────────────
alter table public.quiz_sessions
  add column if not exists phase text not null default 'waiting',
  add column if not exists phase_started_at timestamptz not null default now(),
  add column if not exists question_deadline_at timestamptz,
  add column if not exists admission_open boolean not null default true,
  add column if not exists require_approval boolean not null default false,
  add column if not exists display_token_version integer not null default 1;

alter table public.quiz_sessions drop constraint if exists quiz_sessions_phase_check;
alter table public.quiz_sessions add constraint quiz_sessions_phase_check
  check (phase in ('waiting','countdown','question','time_expired','answer_reveal','leaderboard','podium','completed'));

alter table public.quiz_sessions drop constraint if exists quiz_sessions_display_token_version_check;
alter table public.quiz_sessions add constraint quiz_sessions_display_token_version_check
  check (display_token_version >= 1);

-- Backfill phases for sessions created by the previous two-screen flow.
update public.quiz_sessions
set phase = case
      when status = 'ended' then 'completed'
      when status = 'live' and current_question_index >= 0 then 'question'
      when status = 'paused' and current_question_index >= 0 then 'question'
      else 'waiting'
    end,
    phase_started_at = coalesce(question_started_at, created_at, now())
where phase = 'waiting';

-- ── Participant identity, moderation and connection telemetry ─────────
-- The legacy, unused `joined` value is normalized to the explicit
-- approval workflow value `pending`.
update public.session_participants set status = 'pending' where status = 'joined';

alter table public.session_participants
  add column if not exists avatar_key text not null default 'owl',
  add column if not exists reconnect_count integer not null default 0,
  add column if not exists last_disconnected_at timestamptz;

alter table public.session_participants drop constraint if exists session_participants_status_check;
alter table public.session_participants add constraint session_participants_status_check
  check (status in ('pending','admitted','rejected','blocked','finished'));

alter table public.session_participants drop constraint if exists session_participants_avatar_key_check;
alter table public.session_participants add constraint session_participants_avatar_key_check
  check (avatar_key in (
    'owl','fox','panda','lion','frog','cat','penguin','koala','robot','rocket','whale','bee'
  ));

alter table public.session_participants drop constraint if exists session_participants_reconnect_count_check;
alter table public.session_participants add constraint session_participants_reconnect_count_check
  check (reconnect_count >= 0);

create index if not exists idx_sp_session_status_seen
  on public.session_participants(session_id, status, last_seen_at desc);
create index if not exists idx_pa_session_question
  on public.participant_answers(session_id, quiz_question_id);
create index if not exists idx_sessions_status_phase
  on public.quiz_sessions(status, phase);

-- ── Role helpers and private-data RLS ─────────────────────────────────
create or replace function public.can_host_live_session(p_org uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select public.can_create_content(p_org);
$$;

-- Before this migration any organization member could directly read the
-- participant roster and every answer through PostgREST. Restrict those
-- reads to the host/creator roles, the actual session host, the Super
-- Admin (through org_role), or an authenticated account linked to its
-- own participant row. Guests continue through token-scoped APIs.
drop policy if exists sp_select on public.session_participants;
create policy sp_select on public.session_participants for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.quiz_sessions s
      where s.id = session_id
        and (s.host_id = auth.uid() or public.can_host_live_session(s.organization_id))
    )
  );

drop policy if exists sp_host_update on public.session_participants;
create policy sp_host_update on public.session_participants for update to authenticated
  using (
    exists (
      select 1 from public.quiz_sessions s
      where s.id = session_id
        and (s.host_id = auth.uid() or public.can_host_live_session(s.organization_id))
    )
  )
  with check (
    exists (
      select 1 from public.quiz_sessions s
      where s.id = session_id
        and (s.host_id = auth.uid() or public.can_host_live_session(s.organization_id))
    )
  );

drop policy if exists pa_select on public.participant_answers;
create policy pa_select on public.participant_answers for select to authenticated
  using (
    exists (
      select 1 from public.session_participants p
      where p.id = participant_id and p.user_id = auth.uid()
    )
    or exists (
      select 1 from public.quiz_sessions s
      where s.id = session_id
        and (s.host_id = auth.uid() or public.can_host_live_session(s.organization_id))
    )
  );

comment on column public.quiz_sessions.phase is
  'Authoritative public/presentation phase for the three-interface live engine.';
comment on column public.quiz_sessions.question_deadline_at is
  'Server-generated hard deadline for the active synchronized question.';
comment on column public.quiz_sessions.display_token_version is
  'Increment to revoke all signed public projection-screen tokens for this session.';
comment on column public.session_participants.avatar_key is
  'Original EVALORA illustrated avatar selected for this live participant session.';
