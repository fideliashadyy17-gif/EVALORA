-- 0097 — Automatic timer suspension during confirmed internet outages.
--
-- Purely additive. No existing row, attempt, answer, deadline or extension is
-- modified. Active examinations are untouched: the pause mechanism works
-- through the EXISTING per-attempt `extension_minutes` column, which every
-- deadline computation (src/lib/examDeadline.ts), the save/submit/state routes
-- and the deadline sweep already honor — so a credited pause extends exactly
-- one student's countdown and nobody else's.
--
-- exam_presence gains one nullable column:
--   unconfirmed_lost_at — set by the monitoring sweep when heartbeats stop;
--                         cleared the moment the device speaks again. It is a
--                         display flag for supervisors ("timer will be
--                         compensated on return"); it never grants time by
--                         itself. Credit is only ever computed on a
--                         server-confirmed reconnection.
--
-- exam_connection_events is the audit + idempotency ledger:
--   one row per confirmed outage window per attempt. The unique index on
--   (attempt_id, lost_at) makes duplicate reconnection events impossible —
--   a repeated "restored" claim can never add extra time.

set lock_timeout = '5s';

alter table public.exam_presence
  add column if not exists unconfirmed_lost_at timestamptz;

create table if not exists public.exam_connection_events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- pause_credit: a confirmed outage that added time. credit_refused: a claim
  -- the server validated but capped (admin decides manually). reconnected:
  -- informational return from an outage with no credit due.
  event_kind text not null check (event_kind in ('pause_credit', 'credit_refused', 'reconnected')),
  lost_at timestamptz not null,
  restored_at timestamptz not null,
  claimed_ms bigint not null default 0,
  hidden_ms bigint not null default 0,
  credit_ms bigint not null default 0,
  extension_minutes_before integer not null default 0,
  extension_minutes_after integer not null default 0,
  refusal_reason text,
  created_at timestamptz not null default now()
);

-- Idempotency: one credit decision per (attempt, outage window).
create unique index if not exists uq_exam_connection_event_window
  on public.exam_connection_events (attempt_id, lost_at);
create index if not exists exam_connection_events_exam
  on public.exam_connection_events (exam_id, created_at desc);

alter table public.exam_connection_events enable row level security;

drop policy if exists exam_connection_events_staff_select on public.exam_connection_events;
create policy exam_connection_events_staff_select on public.exam_connection_events for select to authenticated
  using (public.is_super_admin() or coalesce(public.org_role(organization_id) in
    ('owner','admin','teacher','organizer','corrector','supervisor'), false));

-- No insert/update/delete policy: only the server (service role) writes it.

do $$
begin
  begin alter publication supabase_realtime add table public.exam_connection_events;
  exception when duplicate_object then null; end;
end $$;

-- ─── Atomic extension increment (pause credit) ─────────────────────────
-- Called only by the presence route after a server-validated outage window.
-- A single UPDATE ... SET x = x + n is atomic in Postgres, so concurrent
-- heartbeats can never lose or duplicate credit. The hard ceiling (480 min)
-- is a safety rail behind the application-level caps; the sweep and every
-- deadline consumer keep reading `extension_minutes` exactly as before.
create or replace function public.exam_attempt_add_extension_minutes(
  p_attempt_id uuid,
  p_minutes integer
) returns integer
language sql
security definer
set search_path = public
as $$
  update public.exam_attempts
     set extension_minutes = least(480, coalesce(extension_minutes, 0) + greatest(0, p_minutes))
   where id = p_attempt_id
     and status = 'in_progress'
  returning extension_minutes;
$$;

-- Supabase's default privileges grant EXECUTE to anon/authenticated on new
-- functions; revoke from every non-server role explicitly so only the backend
-- (service_role) can ever add extension minutes. Applied to production
-- together with migration 0098's hardening pass.
revoke all on function public.exam_attempt_add_extension_minutes(uuid, integer) from public, anon, authenticated;
grant execute on function public.exam_attempt_add_extension_minutes(uuid, integer) to service_role;
