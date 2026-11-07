-- Configurable result publication, explicit grading state, and traceable history.
-- Existing rows remain in manual mode; no assessment/result records are created.

alter table public.exams
  add column if not exists result_publication_mode text not null default 'manual'
    check (result_publication_mode in ('manual','automatic'));

alter table public.exam_attempts
  add column if not exists grading_status text not null default 'not_started'
    check (grading_status in ('not_started','grading','awaiting_manual_grading','graded','grading_failed')),
  add column if not exists auto_score numeric,
  add column if not exists auto_max_score numeric,
  add column if not exists pending_manual_count integer not null default 0 check (pending_manual_count >= 0),
  add column if not exists grading_error text,
  add column if not exists published_at timestamptz;

alter table public.competitions
  add column if not exists result_publication_mode text
    check (result_publication_mode is null or result_publication_mode in ('manual','automatic')),
  add column if not exists results_published_at timestamptz;

alter table public.quiz_sessions
  add column if not exists results_published boolean not null default false,
  add column if not exists results_published_at timestamptz,
  add column if not exists result_publication_status text not null default 'not_ready'
    check (result_publication_status in ('not_ready','awaiting_manual_grading','ready','published','grading_failed'));

alter table public.session_participants
  add column if not exists result_publication_status text not null default 'not_ready'
    check (result_publication_status in ('not_ready','awaiting_manual_grading','ready','published','grading_failed')),
  add column if not exists results_published_at timestamptz;

create table if not exists public.exam_result_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  attempt_id uuid references public.exam_attempts(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in (
    'submitted','auto_graded','awaiting_manual_grading','grading_failed',
    'auto_published','manually_published','unpublished','manual_grading_completed','grading_retried',
    'publication_mode_changed','correction_visibility_changed'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_exam_result_events_exam_created
  on public.exam_result_events(exam_id, created_at desc);
create index if not exists idx_exam_result_events_attempt_created
  on public.exam_result_events(attempt_id, created_at desc) where attempt_id is not null;

alter table public.exam_result_events enable row level security;
drop policy if exists ere_select on public.exam_result_events;
create policy ere_select on public.exam_result_events for select to authenticated
  using (public.is_super_admin() or public.org_role(organization_id) in ('owner','admin','teacher','organizer','corrector'));
revoke all on public.exam_result_events from anon, authenticated;
grant select on public.exam_result_events to authenticated;
grant all on public.exam_result_events to service_role;

create table if not exists public.live_result_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.quiz_sessions(id) on delete cascade,
  participant_id uuid references public.session_participants(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in (
    'submitted','awaiting_manual_grading','auto_published','manually_published',
    'unpublished','manual_grading_completed','publication_mode_changed'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_live_result_events_session_created
  on public.live_result_events(session_id, created_at desc);
alter table public.live_result_events enable row level security;
drop policy if exists lre_select on public.live_result_events;
create policy lre_select on public.live_result_events for select to authenticated
  using (public.is_super_admin() or public.org_role(organization_id) in ('owner','admin','teacher','organizer','corrector'));
revoke all on public.live_result_events from anon, authenticated;
grant select on public.live_result_events to authenticated;
grant all on public.live_result_events to service_role;

create index if not exists idx_exam_attempts_pending_manual
  on public.exam_attempts(exam_id, grading_status) where pending_manual_count > 0;
create index if not exists idx_exam_attempts_published
  on public.exam_attempts(exam_id, published_at) where published_at is not null;
