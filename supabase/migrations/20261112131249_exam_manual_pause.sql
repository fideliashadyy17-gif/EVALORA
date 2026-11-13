-- 0098 — Organizer pause/resume for whole examinations and individual students.
--
-- Purely additive. No existing row, attempt, answer, deadline or extension is
-- modified. Active examinations are untouched.
--
-- Design (one timer rail, never a parallel one):
--   * exams.status gains the value 'paused' (constraint widened — existing
--     values keep working). paused_at records when; every in_progress attempt
--     of a paused exam carries the 'assessment' pause reason.
--   * exam_attempts KEEP status='in_progress' while paused — every submitted
--     check in the platform reads status, so a separate 'paused' status would
--     be a competing state machine. Pause state lives in:
--       pause_reasons     text[]  — independent reasons: 'assessment' (whole
--                                   exam paused by organizer) and 'student'
--                                   (this student paused by organizer). The
--                                   third reason, CONNECTION_PAUSE, is the
--                                   automatic outage mechanism (0097) and is
--                                   tracked in exam_presence /
--                                   exam_connection_events; it is deliberately
--                                   NOT stored here so overlapping windows can
--                                   never double-credit.
--       paused_at         timestamptz — when the FIRST open reason started.
--       pause_intervals   jsonb — closed [fromMs, toMs] intervals (union).
--       pause_credited_ms bigint — ms already folded into extension_minutes.
--   * Time preservation rides the EXISTING extension_minutes rail: while a
--     manual pause is open, deadline consumers add the live elapsed pause
--     (src/lib/examPause.ts manualPauseMs); when the LAST reason clears, the
--     atomic RPC below folds the paused duration into extension_minutes
--     (rounded up to whole minutes, in the student's favour, capped by the
--     existing 1440-minute extension bound). Overlapping reasons share one
--     window (paused_at → resume), so a student paused individually during an
--     assessment pause is credited once, not twice.
--   * exam_pause_events is the audit ledger (actor, scope, previous/new state,
--     timestamps). Staff-select only; written exclusively by the server.

set lock_timeout = '5s';

-- ─── exams: paused lifecycle state ─────────────────────────────────────────
alter table public.exams drop constraint if exists exams_status_check;
alter table public.exams
  add constraint exams_status_check
  check (status in ('draft','scheduled','open','paused','closed'));

alter table public.exams add column if not exists paused_at timestamptz;

-- ─── exam_attempts: multi-reason manual pause state ───────────────────────
alter table public.exam_attempts
  add column if not exists pause_reasons text[] not null default '{}',
  add column if not exists paused_at timestamptz,
  add column if not exists pause_intervals jsonb not null default '[]'::jsonb,
  add column if not exists pause_credited_ms bigint not null default 0;

-- ─── audit ledger ─────────────────────────────────────────────────────────
create table if not exists public.exam_pause_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  attempt_id uuid references public.exam_attempts(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  scope text not null check (scope in ('exam','attempt')),
  action text not null check (action in ('pause','resume')),
  reason text not null check (reason in ('assessment','student')),
  pause_reasons_before text[] not null default '{}',
  pause_reasons_after text[] not null default '{}',
  credited_minutes integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists exam_pause_events_exam
  on public.exam_pause_events (exam_id, created_at desc);
create index if not exists exam_pause_events_attempt
  on public.exam_pause_events (attempt_id, created_at desc);

alter table public.exam_pause_events enable row level security;

drop policy if exists exam_pause_events_staff_select on public.exam_pause_events;
create policy exam_pause_events_staff_select on public.exam_pause_events for select to authenticated
  using (public.is_super_admin() or coalesce(public.org_role(organization_id) in
    ('owner','admin','teacher','organizer','corrector','supervisor'), false));

-- No insert/update/delete policy: only the server (service role) writes it.

do $$
begin
  begin alter publication supabase_realtime add table public.exam_pause_events;
  exception when duplicate_object then null; end;
end $$;

-- ─── Interval union helper ────────────────────────────────────────────────
-- Merges closed [fromMs, toMs] pause intervals into a non-overlapping union,
-- so overlapping reasons (an individually paused student inside a paused
-- assessment) can never be credited twice.
create or replace function public.exam_pause_union_intervals(p_intervals jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_item record;
  v_out jsonb := '[]'::jsonb;
  v_n integer := 0;
  v_have_last boolean := false;
  v_from bigint;
  v_to bigint;
begin
  for v_item in
    select value
      from jsonb_array_elements(coalesce(p_intervals, '[]'::jsonb)) as value
     where jsonb_array_length(value) = 2
       and (value->>0) ~ '^-?[0-9]+$'
       and (value->>1) ~ '^-?[0-9]+$'
     order by (value->>0)::bigint asc, (value->>1)::bigint asc
  loop
    if v_have_last and (v_item.value->>0)::bigint <= v_to then
      v_to := greatest(v_to, (v_item.value->>1)::bigint);
    else
      if v_have_last then
        v_out := v_out || jsonb_build_array(jsonb_build_array(v_from, v_to));
        v_n := v_n + 1;
      end if;
      v_from := (v_item.value->>0)::bigint;
      v_to := (v_item.value->>1)::bigint;
      v_have_last := true;
    end if;
  end loop;
  if v_have_last then
    v_out := v_out || jsonb_build_array(jsonb_build_array(v_from, v_to));
    v_n := v_n + 1;
  end if;
  return v_out;
end;
$$;

-- Supabase's default privileges grant EXECUTE to anon/authenticated on new
-- functions: revoke from every non-server role explicitly, or a signed-in
-- student could call the pause RPC directly through PostgREST (§10).
revoke all on function public.exam_pause_union_intervals(jsonb) from public, anon, authenticated;
grant execute on function public.exam_pause_union_intervals(jsonb) to service_role;

-- ─── Atomic per-attempt pause transition ──────────────────────────────────
-- One UPDATE per attempt: concurrent pause/resume calls serialize on the row
-- and can never interleave into a lost reason or a double credit. Adding a
-- reason that is already present, or removing one that is absent, is a no-op
-- (idempotent double-clicks). Credit happens ONLY when the last reason
-- clears, and only for the union window not already credited.
create or replace function public.exam_attempt_set_pause(
  p_attempt_id uuid,
  p_reason text,
  p_paused boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_reasons text[];
  v_now timestamptz := now();
  v_now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
  v_intervals jsonb;
  v_total_ms bigint;
  v_credit_ms bigint;
  v_credit_min integer;
  v_extension integer;
begin
  if p_reason is null or p_reason not in ('assessment','student') then
    raise exception 'unknown pause reason';
  end if;

  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if not found or v_attempt.status <> 'in_progress' then
    return null;
  end if;

  v_reasons := coalesce(v_attempt.pause_reasons, '{}');
  if p_paused then
    if p_reason = any (v_reasons) then
      return jsonb_build_object('paused', true, 'reasons', v_reasons, 'credited_minutes', 0, 'duplicate', true);
    end if;
    v_reasons := array_append(v_reasons, p_reason);
    update public.exam_attempts
       set pause_reasons = v_reasons,
           paused_at = case when array_length(v_reasons, 1) = 1 then v_now else paused_at end
     where id = p_attempt_id;
    return jsonb_build_object('paused', true, 'reasons', v_reasons, 'credited_minutes', 0);
  end if;

  if not (p_reason = any (v_reasons)) then
    return jsonb_build_object(
      'paused', coalesce(array_length(v_reasons, 1), 0) > 0,
      'reasons', v_reasons,
      'credited_minutes', 0,
      'duplicate', true);
  end if;
  v_reasons := array_remove(v_reasons, p_reason);

  if array_length(v_reasons, 1) > 0 then
    -- Another reason is still open: the attempt stays paused, no credit yet.
    update public.exam_attempts set pause_reasons = v_reasons where id = p_attempt_id;
    return jsonb_build_object('paused', true, 'reasons', v_reasons, 'credited_minutes', 0);
  end if;

  -- Last reason cleared: close the window and credit the union.
  v_intervals := coalesce(v_attempt.pause_intervals, '[]'::jsonb);
  if v_attempt.paused_at is not null then
    v_intervals := v_intervals
      || jsonb_build_array(jsonb_build_array(
           (extract(epoch from v_attempt.paused_at) * 1000)::bigint, v_now_ms));
  end if;
  v_intervals := public.exam_pause_union_intervals(v_intervals);
  v_total_ms := 0;
  select coalesce(sum(least((value->>1)::bigint, v_now_ms) - greatest((value->>0)::bigint, 0)), 0)::bigint
    into v_total_ms
    from jsonb_array_elements(v_intervals) as value;
  v_total_ms := greatest(0, v_total_ms);
  v_credit_ms := greatest(0, v_total_ms - coalesce(v_attempt.pause_credited_ms, 0));
  v_credit_min := least(1440 - coalesce(v_attempt.extension_minutes, 0), (v_credit_ms + 59999) / 60000);
  v_credit_min := greatest(0, v_credit_min);
  v_extension := coalesce(v_attempt.extension_minutes, 0) + v_credit_min;

  update public.exam_attempts
     set pause_reasons = '{}',
         paused_at = null,
         pause_intervals = v_intervals,
         pause_credited_ms = v_total_ms,
         extension_minutes = v_extension
   where id = p_attempt_id;

  return jsonb_build_object('paused', false, 'reasons', '{}', 'credited_minutes', v_credit_min, 'extension_minutes', v_extension);
end;
$$;

-- ─── Atomic whole-exam pause transition ───────────────────────────────────
-- Pausing sets exams.status='paused' and adds the 'assessment' reason to
-- every in_progress attempt. Resuming restores 'open' (a paused exam is only
-- ever paused from open) and removes ONLY the 'assessment' reason: a student
-- who was ALSO paused individually stays paused until that reason clears.
create or replace function public.exam_set_pause(
  p_exam_id uuid,
  p_paused boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam public.exams%rowtype;
  v_attempt record;
  v_result jsonb;
  v_count integer := 0;
begin
  select * into v_exam from public.exams where id = p_exam_id for update;
  if not found then
    return null;
  end if;

  if p_paused then
    if v_exam.status = 'paused' then
      return jsonb_build_object('paused', true, 'attempts_updated', 0, 'duplicate', true);
    end if;
    if v_exam.status <> 'open' then
      return jsonb_build_object('error', 'not_open');
    end if;
    update public.exams set status = 'paused', paused_at = now() where id = p_exam_id;
  else
    if v_exam.status <> 'paused' then
      return jsonb_build_object('paused', false, 'attempts_updated', 0, 'duplicate', true);
    end if;
    update public.exams set status = 'open', paused_at = null where id = p_exam_id;
  end if;

  for v_attempt in
    select id from public.exam_attempts
     where exam_id = p_exam_id and status = 'in_progress'
     order by started_at
     for update
  loop
    v_result := public.exam_attempt_set_pause(v_attempt.id, 'assessment', p_paused);
    if v_result is not null and coalesce((v_result->>'duplicate')::boolean, false) = false then
      v_count := v_count + 1;
    end if;
  end loop;

  return jsonb_build_object('paused', p_paused, 'attempts_updated', v_count);
end;
$$;

-- Same explicit revokes: without them anon/authenticated keep EXECUTE via
-- Supabase's default privileges and a student could pause their own timer.
revoke all on function public.exam_attempt_set_pause(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.exam_attempt_set_pause(uuid, text, boolean) to service_role;
revoke all on function public.exam_set_pause(uuid, boolean) from public, anon, authenticated;
grant execute on function public.exam_set_pause(uuid, boolean) to service_role;
