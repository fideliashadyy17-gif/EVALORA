-- ═══════════════════════════════════════════════════════════════════════
-- EVALORA — migration 0083
-- Retake access codes, decision acknowledgement and realtime delivery.
--
-- ADDITIVE and backward compatible. It never rewrites an examination, a
-- candidate, an attempt, an answer, a mark or a result. The only existing
-- rows it touches are approvals that predate this migration: they receive a
-- retake code so an authorization that is already live stays usable.
--
-- Why the extra columns exist
--   * `retake_code` is the code the approved student must type, together with
--     their first and last name, on the dedicated retake access page. It is
--     unique per authorization, never reusable by another student and never
--     guessable: ten characters from an alphabet without 0/O/1/I/L.
--   * `retake_code_consumed_at` marks the code as spent once the authorization
--     has no attempts left, so a replay cannot open another paper.
--   * `retake_started_at` records the first attempt the approval produced.
--   * `decision_seen_at` lets the student interface redirect a student to the
--     decision page exactly once — on the live session and, if they were
--     offline, the next time they open EVALORA.
--
-- Deployment safety: `lock_timeout` makes the migration fail rather than queue
-- behind a candidate who is currently autosaving or submitting. It is
-- idempotent, so a failed run can simply be retried.
-- ═══════════════════════════════════════════════════════════════════════

set lock_timeout = '5s';

-- ─── 1. Columns ────────────────────────────────────────────────────────
alter table public.exam_retake_requests
  add column if not exists retake_code text,
  add column if not exists retake_code_issued_at timestamptz,
  add column if not exists retake_code_consumed_at timestamptz,
  add column if not exists retake_started_at timestamptz,
  add column if not exists decision_seen_at timestamptz;

comment on column public.exam_retake_requests.retake_code is
  'Code the approved student types on /retake/<request id> with their first and last name. Unique per authorization.';
comment on column public.exam_retake_requests.retake_code_consumed_at is
  'Set when the authorization has no attempts left; a consumed code can never open another paper.';
comment on column public.exam_retake_requests.decision_seen_at is
  'When the student was shown the decision page. Guarantees the automatic redirection happens once.';

create unique index if not exists uq_exam_retake_code
  on public.exam_retake_requests (upper(retake_code))
  where retake_code is not null;

create index if not exists idx_exam_retake_requests_student
  on public.exam_retake_requests (student_id, status, decided_at desc)
  where student_id is not null;

-- ─── 2. Codes for approvals that already exist ─────────────────────────
-- An approval granted before this migration must keep working: the student
-- still needs a code. Generated here, never guessed from the row id.
create or replace function public.evalora_generate_retake_code()
returns text language plpgsql as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  result text := '';
  i integer;
begin
  for i in 1..10 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end $$;

do $$
declare
  target record;
  generated text;
begin
  for target in
    select id from public.exam_retake_requests
     where status = 'approved' and (retake_code is null or retake_code = '')
  loop
    loop
      generated := public.evalora_generate_retake_code();
      exit when not exists (
        select 1 from public.exam_retake_requests where upper(retake_code) = generated
      );
    end loop;
    update public.exam_retake_requests
       set retake_code = generated,
           retake_code_issued_at = coalesce(decided_at, now())
     where id = target.id;
  end loop;
end $$;

-- ─── 3. Realtime delivery ──────────────────────────────────────────────
-- The student's own rows are already readable under RLS (`err_select`), so
-- adding the table to the publication lets a signed-in student's browser be
-- told the moment their request is decided — no refresh, no polling-only
-- architecture. Realtime remains a hint: the database stays the source of
-- truth and the interface re-reads it.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'exam_retake_requests'
     )
  then
    alter publication supabase_realtime add table public.exam_retake_requests;
  end if;
end $$;
