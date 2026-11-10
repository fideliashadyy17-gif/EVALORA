-- ═══════════════════════════════════════════════════════════════════════
-- EVALORA — migration 0076
-- Controlled examination retakes + configurable examination-link lifecycle.
--
-- This migration is ADDITIVE and backward compatible. It never rewrites an
-- existing examination, candidate, attempt, answer, mark, proctoring record or
-- result. The only existing data it touches is additive metadata:
--
--   * `exams.invite_expires_at` is backfilled for links that were created
--     without an expiry, because the platform policy is "links expire unless
--     expressly exempted". The backfilled instant is measured from the exam
--     window (or creation) and never lands closer than 7 days from now, so no
--     examination that is open today loses its link.
--   * `exam_attempts.attempt_number` defaults to 1, which is the true value
--     for every attempt that already exists.
--
-- Deployment safety: `lock_timeout` is set so the migration fails instead of
-- queueing behind — or blocking — a candidate who is currently autosaving or
-- submitting. A failed run is retryable and changes nothing.
-- ═══════════════════════════════════════════════════════════════════════

set lock_timeout = '5s';

-- ─── 1. Examination link lifecycle ─────────────────────────────────────
-- invite_expires_at / shared_link_enabled already exist (migration 0015).
-- Added here: scheduled activation, a disabled-at stamp, the policy that
-- produced the expiry, an explicit no-expiry exemption, and the last edit.
alter table public.exams
  add column if not exists invite_activates_at timestamptz,
  add column if not exists invite_disabled_at timestamptz,
  add column if not exists invite_expiry_policy text,
  add column if not exists invite_no_expiry boolean not null default false,
  add column if not exists invite_last_edited_by uuid references public.profiles(id) on delete set null,
  add column if not exists invite_last_edited_at timestamptz;

comment on column public.exams.invite_expires_at is
  'Last instant (UTC) at which the examination link may start a NEW attempt. Never closes an attempt already in progress.';
comment on column public.exams.invite_activates_at is
  'Optional future activation instant; the link is Scheduled before it and Active after it.';
comment on column public.exams.invite_disabled_at is
  'When an administrator manually disabled the link (shared_link_enabled = false).';
comment on column public.exams.invite_expiry_policy is
  'Preset that produced invite_expires_at: 24h, 7d, 30d, custom, backfilled_30_days or no_expiry_exempt.';
comment on column public.exams.invite_no_expiry is
  'Explicit, administrator-chosen exemption from expiry. Only writable when the platform policy permits it.';

-- No link may remain permanent by accident. Existing links without an expiry
-- get a 30-day policy measured from the end of the examination window, floored
-- at seven days from now so a running examination is never cut off.
update public.exams e
set invite_expires_at = greatest(
      coalesce(e.ends_at, e.starts_at, e.created_at, now()) + interval '30 days',
      now() + interval '7 days'
    )
where e.invite_expires_at is null
  and e.invite_no_expiry = false;

update public.exams
set invite_expiry_policy = 'backfilled_30_days'
where invite_expiry_policy is null and invite_expires_at is not null;

create index if not exists idx_exams_link_expiry on public.exams(invite_expires_at);

-- Platform-level policy: who may create a permanent link, and what the panel
-- offers as its default duration. Conservative by default (no permanent links).
insert into public.platform_settings (key, value)
values (
  'exam_link_policy',
  '{"allow_no_expiry": false, "default_days": 30, "link_requires_expiry": true}'::jsonb
)
on conflict (key) do nothing;

-- ─── 2. Retake requests ────────────────────────────────────────────────
create table if not exists public.exam_retake_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  candidate_id uuid not null references public.exam_candidates(id) on delete cascade,
  -- The submitted attempt this request is about. Never modified by a decision.
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  requested_by uuid references public.profiles(id) on delete set null,
  requester_name text not null check (char_length(requester_name) between 1 and 200),
  requester_email text check (requester_email is null or char_length(requester_email) <= 200),
  reason text check (reason is null or char_length(reason) <= 2000),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 2000),
  -- One approval authorizes a bounded number of new attempts (default ONE).
  granted_attempts integer not null default 1
    check (granted_attempts between 1 and 3),
  -- The access window the Super Admin explicitly authorizes for the retake.
  access_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_retake_requests_decision_check check (
    (status = 'pending' and decided_at is null and decided_by is null)
    or (status = 'approved' and decided_at is not null and decided_by is not null
        and access_expires_at is not null)
    or (status = 'rejected' and decided_at is not null and decided_by is not null)
    or (status = 'cancelled')
  )
);

comment on table public.exam_retake_requests is
  'Student-initiated, Super Admin-decided authorization to sit ONE further attempt of an examination. Never mutates the original attempt.';

create index if not exists idx_exam_retake_requests_exam
  on public.exam_retake_requests(exam_id, status, created_at desc);
create index if not exists idx_exam_retake_requests_candidate
  on public.exam_retake_requests(candidate_id, created_at desc);
create index if not exists idx_exam_retake_requests_org
  on public.exam_retake_requests(organization_id, status);
create index if not exists idx_exam_retake_requests_requester
  on public.exam_retake_requests(requested_by) where requested_by is not null;

-- At most ONE pending request per candidate and examination, and at most one
-- pending request per original attempt. Duplicate submissions hit these
-- indexes even if two browser requests race each other.
create unique index if not exists uq_exam_retake_pending_candidate
  on public.exam_retake_requests(exam_id, candidate_id) where status = 'pending';
create unique index if not exists uq_exam_retake_pending_attempt
  on public.exam_retake_requests(attempt_id) where status = 'pending';

-- Tenant/identity integrity, enforced by the database and not only the route.
create or replace function public.guard_exam_retake_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_exam_org uuid;
  v_attempt_exam uuid;
  v_attempt_candidate uuid;
  v_attempt_status text;
  v_candidate_exam uuid;
  v_candidate_student uuid;
begin
  select organization_id into v_exam_org from public.exams where id = new.exam_id;
  if not found then raise exception 'Examination not found.'; end if;
  if new.organization_id is distinct from v_exam_org then
    raise exception 'A retake request must belong to the examination organization.';
  end if;

  select exam_id, candidate_id, status
    into v_attempt_exam, v_attempt_candidate, v_attempt_status
    from public.exam_attempts where id = new.attempt_id;
  if not found then raise exception 'Attempt not found.'; end if;
  if v_attempt_exam is distinct from new.exam_id or v_attempt_candidate is distinct from new.candidate_id then
    raise exception 'The attempt does not belong to this examination candidate.';
  end if;

  select exam_id, student_id into v_candidate_exam, v_candidate_student
    from public.exam_candidates where id = new.candidate_id;
  if not found then raise exception 'Candidate not found.'; end if;
  if v_candidate_exam is distinct from new.exam_id then
    raise exception 'The candidate does not belong to this examination.';
  end if;

  if new.student_id is not null and v_candidate_student is not null
     and new.student_id is distinct from v_candidate_student then
    raise exception 'The student does not match the candidate record.';
  end if;
  if new.student_id is null then
    new.student_id := v_candidate_student;
  end if;

  if tg_op = 'INSERT' then
    if v_attempt_status = 'in_progress' then
      raise exception 'A retake may only be requested after the attempt has been submitted.';
    end if;
    if new.status <> 'pending' then
      raise exception 'A new retake request always starts as pending.';
    end if;
  end if;

  -- Decisions are terminal and carry their actor + instant.
  if tg_op = 'UPDATE' and old.status <> 'pending' and new.status <> old.status then
    raise exception 'A decided retake request cannot be re-decided.';
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_guard_exam_retake_request on public.exam_retake_requests;
create trigger trg_guard_exam_retake_request
  before insert or update on public.exam_retake_requests
  for each row execute function public.guard_exam_retake_request();

-- ─── 3. Multiple, preserved attempts ──────────────────────────────────
-- The old unique(exam_id, candidate_id) made a second attempt impossible
-- without overwriting the first. It is replaced by:
--   * one ACTIVE attempt per candidate (partial unique index), so a student can
--     never run two papers of the same examination at once;
--   * a unique (candidate_id, attempt_number) sequence that distinguishes
--     first / second / subsequent authorized attempts.
alter table public.exam_attempts
  add column if not exists attempt_number integer not null default 1,
  add column if not exists previous_attempt_id uuid,
  add column if not exists retake_request_id uuid;

alter table public.exam_attempts
  drop constraint if exists exam_attempts_attempt_number_check;
alter table public.exam_attempts
  add constraint exam_attempts_attempt_number_check
  check (attempt_number between 1 and 20);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.exam_attempts'::regclass
      and conname = 'exam_attempts_previous_attempt_id_fkey'
  ) then
    alter table public.exam_attempts
      add constraint exam_attempts_previous_attempt_id_fkey
      foreign key (previous_attempt_id) references public.exam_attempts(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.exam_attempts'::regclass
      and conname = 'exam_attempts_retake_request_id_fkey'
  ) then
    alter table public.exam_attempts
      add constraint exam_attempts_retake_request_id_fkey
      foreign key (retake_request_id) references public.exam_retake_requests(id) on delete set null;
  end if;
end $$;

alter table public.exam_attempts
  drop constraint if exists exam_attempts_exam_id_candidate_id_key;

create unique index if not exists uq_exam_attempts_one_active
  on public.exam_attempts(exam_id, candidate_id) where status = 'in_progress';
create unique index if not exists uq_exam_attempts_number
  on public.exam_attempts(candidate_id, attempt_number);
create index if not exists idx_exam_attempts_retake_request
  on public.exam_attempts(retake_request_id) where retake_request_id is not null;

comment on column public.exam_attempts.attempt_number is
  '1 = first attempt, 2 = second attempt, ... Each authorized retake creates a NEW attempt row; nothing is overwritten.';
comment on column public.exam_attempts.previous_attempt_id is
  'The attempt this authorized retake follows, for a complete and readable attempt chain.';
comment on column public.exam_attempts.retake_request_id is
  'The Super Admin decision that authorized this attempt. NULL for the first attempt.';

-- ─── 4. Row-level security ────────────────────────────────────────────
alter table public.exam_retake_requests enable row level security;

drop policy if exists err_select on public.exam_retake_requests;
create policy err_select on public.exam_retake_requests for select to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.exams e
      where e.id = exam_id
        and coalesce(public.org_role(e.organization_id) in
          ('owner','admin','teacher','organizer','corrector','supervisor'), false)
    )
    or requested_by = auth.uid()
    or exists (
      select 1 from public.exam_candidates c
      join public.students s on s.id = c.student_id
      where c.id = candidate_id and s.user_id = auth.uid()
    )
  );

-- Students may only create a pending request for their OWN verified candidate
-- record. The token-scoped API route runs with the service role and applies the
-- same rules to guest candidates; this policy closes the direct PostgREST path.
drop policy if exists err_insert on public.exam_retake_requests;
create policy err_insert on public.exam_retake_requests for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      status = 'pending'
      and decided_by is null
      and decided_at is null
      and granted_attempts >= 1
      and requested_by = auth.uid()
      and exists (
        select 1 from public.exam_candidates c
        join public.students s on s.id = c.student_id
        where c.id = candidate_id and s.user_id = auth.uid()
      )
    )
  );

-- Approval/rejection is a Super Admin-only operation. A student may cancel
-- their own pending request only.
drop policy if exists err_update on public.exam_retake_requests;
create policy err_update on public.exam_retake_requests for update to authenticated
  using (
    public.is_super_admin()
    or (requested_by = auth.uid() and status = 'pending')
  )
  with check (
    public.is_super_admin()
    or (requested_by = auth.uid() and status = 'cancelled')
  );
