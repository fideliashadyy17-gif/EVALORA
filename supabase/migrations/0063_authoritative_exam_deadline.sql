-- 0063 — Make a premature automatic submission impossible at the data layer.
--
-- Context: an attempt must never be closed automatically before its official
-- deadline. The application enforces that rule in `src/lib/examDeadline.ts` and
-- `src/lib/examSubmission.ts`; this migration makes the same rule hold for any
-- other writer — a future route, an administrative script, a manual SQL fix, a
-- scheduled job — so the invariant cannot be lost by a later change that forgets
-- to import the right helper.
--
-- What it adds:
--
--   1. `exam_attempts.deadline_at` — the AUTHORITATIVE deadline, computed and
--      stored by the database from `started_at`, `exams.duration_minutes`,
--      `exams.ends_at` and the authorised `extension_minutes`. The same formula
--      as `attemptDeadline()`:
--          least(started_at + duration + extension, ends_at + extension)
--      A per-candidate extension therefore shifts BOTH the duration cap and the
--      window end, exactly as the application already computes it.
--
--   2. `exam_attempts_authoritative_deadline` — a BEFORE INSERT/UPDATE trigger
--      that, whenever `started_at`, `extension_minutes` or `exam_id` changes,
--      recomputes `deadline_at` from the examination itself. A client cannot
--      write a deadline, and a changed duration or extension is reflected on the
--      next write without any backfill.
--
--   3. `exam_attempts_no_premature_auto_submit` — a BEFORE INSERT/UPDATE trigger
--      that REJECTS a transition into `auto_submitted` while `now()` is still
--      before the official deadline. This is the database-level guarantee: an
--      automatic submission before the deadline is not merely discouraged, it is
--      refused, with a named error.
--
-- Safety for attempts already in progress (requirements §9):
--
--   * Additive only. No column is dropped, renamed or retyped; no row is deleted;
--     no answer, timer, status or score is modified.
--   * `deadline_at` is added NULLABLE and is populated by the trigger, not by a
--     blanket UPDATE of live rows. An existing attempt keeps its exact
--     `started_at` and `extension_minutes`, so its deadline — and therefore the
--     moment it can be submitted — is unchanged.
--   * The trigger computes the deadline from the SAME inputs with the SAME
--     formula the application uses, so existing and new attempts agree with the
--     server to the millisecond.
--   * Active sessions are untouched: this migration does not force a reload, does
--     not touch `access_token`, and does not alter how answers are saved.
--   * The guard is IMMEDIATE (not deferred) so a rogue writer cannot commit a
--     premature automatic submission and fix it later in the same transaction.
--
-- Everything is idempotent (`create or replace`, `add column if not exists`,
-- `drop trigger if exists`), so re-running it is safe.

begin;

-- ── 1. The authoritative deadline column ────────────────────────────────────
alter table public.exam_attempts
  add column if not exists deadline_at timestamptz;

comment on column public.exam_attempts.deadline_at is
  'Authoritative server deadline: least(started_at + exam duration + extension, exam window end + extension). Maintained by exam_attempts_set_authoritative_deadline. Nullable only for legacy rows that cannot produce a deadline.';

-- ── 2. One formula, used by the trigger and by any later reader ─────────────
create or replace function public.exam_attempt_deadline_at(
  p_started_at timestamptz,
  p_duration_minutes int,
  p_ends_at timestamptz,
  p_extension_minutes int
) returns timestamptz
language sql
immutable
as $$
  select case
    when p_started_at is null then null
    else least(
      case
        when coalesce(p_duration_minutes, 0) > 0
          then p_started_at + make_interval(mins => coalesce(p_duration_minutes, 0) + greatest(coalesce(p_extension_minutes, 0), 0))
        else null
      end,
      case
        when p_ends_at is not null
          then p_ends_at + make_interval(mins => greatest(coalesce(p_extension_minutes, 0), 0))
        else null
      end
    )
  end;
$$;

comment on function public.exam_attempt_deadline_at(timestamptz, int, timestamptz, int) is
  'The single authoritative deadline formula. Mirrors attemptDeadline() in src/lib/examDeadline.ts: a per-candidate extension moves both the duration cap and the window end.';

create or replace function public.exam_attempts_set_authoritative_deadline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duration int;
  v_ends_at timestamptz;
begin
  select e.duration_minutes, e.ends_at
    into v_duration, v_ends_at
    from public.exams e
   where e.id = new.exam_id;

  new.deadline_at := public.exam_attempt_deadline_at(
    new.started_at,
    v_duration,
    v_ends_at,
    new.extension_minutes
  );

  return new;
end $$;

comment on function public.exam_attempts_set_authoritative_deadline() is
  'Keeps exam_attempts.deadline_at in step with the examination duration, the exam window, the attempt start and any authorised extension.';

drop trigger if exists exam_attempts_authoritative_deadline on public.exam_attempts;
create trigger exam_attempts_authoritative_deadline
  before insert or update of started_at, extension_minutes, exam_id on public.exam_attempts
  for each row execute function public.exam_attempts_set_authoritative_deadline();

-- ── 3. The non-negotiable guard ─────────────────────────────────────────────
create or replace function public.exam_attempts_guard_premature_auto_submit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deadline timestamptz;
begin
  -- Only an automatic closure is guarded. A candidate's own confirmed
  -- submission (`submitted`) and every other column remain writable as before:
  -- grading, marking, review and administrative repair must keep working.
  if new.status <> 'auto_submitted' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'auto_submitted' then
    -- Already automatic: a later write (grading totals, for instance) is not a
    -- new automatic closure and must not be blocked.
    return new;
  end if;

  -- Always derive the deadline from the examination itself rather than trusting
  -- the stored column, so a stale value (an examination whose duration was
  -- shortened after the attempt began) can never authorise an early closure.
  select public.exam_attempt_deadline_at(
           new.started_at,
           e.duration_minutes,
           e.ends_at,
           new.extension_minutes
         )
    into v_deadline
    from public.exams e
   where e.id = new.exam_id;
  if v_deadline is null then
    -- No computable deadline means no automatic closure is authorised.
    raise exception
      'Automatic submission refused: attempt % has no computable official deadline.',
      new.id
      using errcode = 'check_violation',
            hint = 'Set exams.duration_minutes or exams.ends_at before relying on automatic submission.';
  end if;

  if now() < v_deadline then
    raise exception
      'Automatic submission refused: attempt % is still within its official time (deadline %).',
      new.id, v_deadline
      using errcode = 'check_violation',
            hint = 'An attempt may only be submitted automatically at or after its official deadline.';
  end if;

  return new;
end $$;

comment on function public.exam_attempts_guard_premature_auto_submit() is
  'AN ANTI-CHEATING INCIDENT IS NOT AN EXAMINATION SUBMISSION COMMAND. Rejects any automatic closure of an attempt before its authoritative deadline.';

drop trigger if exists exam_attempts_no_premature_auto_submit on public.exam_attempts;
create trigger exam_attempts_no_premature_auto_submit
  before insert or update of status on public.exam_attempts
  for each row execute function public.exam_attempts_guard_premature_auto_submit();

-- ── 4. Evidence: one append-only provenance row per closure ─────────────────
-- `exam_result_events` already exists in this database but was created outside
-- the repository's migration history; create it only if a target environment
-- (a fresh review database) does not have it yet, in the same shape.
create table if not exists public.exam_result_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  exam_id uuid not null references public.exams(id) on delete cascade,
  attempt_id uuid references public.exam_attempts(id) on delete set null,
  actor_id uuid,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_exam_result_events_attempt on public.exam_result_events(attempt_id);
create index if not exists idx_exam_result_events_exam on public.exam_result_events(exam_id, created_at desc);

alter table public.exam_result_events enable row level security;

-- Read-only to staff who can already see the examination's attempts; no
-- candidate-facing policy is added, and no existing permission is widened.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'exam_result_events' and policyname = 'ere_staff_select'
  ) then
    create policy ere_staff_select on public.exam_result_events for select to authenticated
      using (
        exists (
          select 1
            from public.exams e
           where e.id = exam_id
             and coalesce(public.org_role(e.organization_id) in ('owner','admin','teacher','corrector'), false)
        )
        or public.is_super_admin()
      );
  end if;
end $$;

-- ── 5. Diagnosis index for the scheduled sweep ──────────────────────────────
create index if not exists idx_exam_attempts_open_deadline
  on public.exam_attempts(started_at)
  where status = 'in_progress';

commit;
