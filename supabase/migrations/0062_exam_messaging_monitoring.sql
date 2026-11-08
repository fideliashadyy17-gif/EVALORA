-- 0062: teacher–candidate messaging and live monitoring for examinations.
--
-- Strictly additive. This migration does NOT alter exam_attempts, exam_answers,
-- exam_candidates, their policies, their triggers, or any existing row. Candidate
-- sessions authenticate with the attempt token through server routes (service role),
-- so the candidate side writes these tables server-side. Staff read and write under RLS.
--
--   exam_messages  : private conversation per attempt (staff <-> candidate), persistent,
--                    idempotent (client_message_id), with delivery and read times.
--   exam_presence  : one light heartbeat row per attempt (last seen, current question,
--                    saved and unsaved counts as reported by the candidate's browser).
--                    It holds no access token and never replaces exam_answers as the
--                    source of truth for progress.
--
-- Re-running this migration is safe.

set local lock_timeout = '5s';

-- ─── Private conversations ───────────────────────────────────────────
create table if not exists public.exam_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  sender_kind text not null check (sender_kind in ('staff', 'candidate')),
  sender_user_id uuid references public.profiles(id) on delete set null,
  client_message_id uuid not null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz
);

-- Idempotent delivery: the same client send retried any number of times is one row.
create unique index if not exists exam_messages_client_key
  on public.exam_messages (attempt_id, sender_kind, client_message_id);
create index if not exists exam_messages_thread
  on public.exam_messages (attempt_id, created_at, id);
create index if not exists exam_messages_exam_created
  on public.exam_messages (exam_id, created_at);
create index if not exists exam_messages_unread_candidate
  on public.exam_messages (exam_id) where sender_kind = 'candidate' and read_at is null;

-- Messages are immutable apart from delivery and read times (the audit trail).
create or replace function public.exam_messages_guard()
returns trigger language plpgsql as $$
begin
  if (new.id, new.organization_id, new.exam_id, new.attempt_id, new.sender_kind,
      new.sender_user_id, new.client_message_id, new.body, new.created_at)
     is distinct from
     (old.id, old.organization_id, old.exam_id, old.attempt_id, old.sender_kind,
      old.sender_user_id, old.client_message_id, old.body, old.created_at) then
    raise exception 'exam messages are immutable apart from delivery and read times';
  end if;
  return new;
end $$;

drop trigger if exists exam_messages_guard on public.exam_messages;
create trigger exam_messages_guard before update on public.exam_messages
  for each row execute function public.exam_messages_guard();

-- ─── Candidate presence (no secrets) ─────────────────────────────────
create table if not exists public.exam_presence (
  attempt_id uuid primary key references public.exam_attempts(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  current_question integer check (current_question is null or current_question >= 1),
  total_questions integer check (total_questions is null or total_questions >= 0),
  saved_count integer not null default 0 check (saved_count >= 0),
  pending_saves integer not null default 0 check (pending_saves >= 0),
  updated_at timestamptz not null default now()
);
create index if not exists exam_presence_exam on public.exam_presence (exam_id);

-- ─── Row level security ──────────────────────────────────────────────
alter table public.exam_messages enable row level security;
alter table public.exam_presence enable row level security;

drop policy if exists exam_messages_staff_select on public.exam_messages;
create policy exam_messages_staff_select on public.exam_messages for select to authenticated
  using (public.is_super_admin() or coalesce(public.org_role(organization_id) in
    ('owner','admin','teacher','organizer','corrector','supervisor'), false));

drop policy if exists exam_messages_staff_insert on public.exam_messages;
create policy exam_messages_staff_insert on public.exam_messages for insert to authenticated
  with check (
    sender_kind = 'staff'
    and sender_user_id = auth.uid()
    and (public.is_super_admin() or coalesce(public.org_role(exam_messages.organization_id) in
      ('owner','admin','teacher','supervisor','corrector'), false))
    and exists (
      select 1 from public.exams e
      where e.id = exam_messages.exam_id and e.organization_id = exam_messages.organization_id)
    and exists (
      select 1 from public.exam_attempts a
      where a.id = exam_messages.attempt_id and a.exam_id = exam_messages.exam_id
        and a.status = 'in_progress')
  );

-- Staff may only mark candidate messages as read (the guard blocks other changes).
drop policy if exists exam_messages_staff_update on public.exam_messages;
create policy exam_messages_staff_update on public.exam_messages for update to authenticated
  using (sender_kind = 'candidate' and (public.is_super_admin() or coalesce(public.org_role(organization_id) in
    ('owner','admin','teacher','organizer','corrector','supervisor'), false)))
  with check (sender_kind = 'candidate');

drop policy if exists exam_presence_staff_select on public.exam_presence;
create policy exam_presence_staff_select on public.exam_presence for select to authenticated
  using (public.is_super_admin() or coalesce(public.org_role(organization_id) in
    ('owner','admin','teacher','organizer','corrector','supervisor'), false));

-- No insert, update or delete policy on exam_presence: only the server writes it.

-- ─── Realtime (teachers receive changes filtered by exam, under RLS) ─
do $$
begin
  begin alter publication supabase_realtime add table public.exam_messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.exam_presence; exception when duplicate_object then null; end;
end $$;
