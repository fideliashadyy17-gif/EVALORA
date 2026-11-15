-- Examination attempt policy: "Limited Attempts" and "Unlimited Attempts".
--
-- Until now an approval could only authorize 1 to 3 new attempts, so a paper
-- configured for unlimited attempts was still rejected once a candidate
-- reached three. This migration widens the authorization so the policy the
-- institution configures is the policy that is enforced.
--
-- Representation: granted_attempts is a bounded number for "Limited
-- Attempts" (1..20, matching exam_attempts.attempt_number) and NULL for
-- "Unlimited Attempts". NULL was previously impossible, so no existing row
-- changes meaning, and the column keeps its DEFAULT 1 so every existing
-- insert path continues to write exactly what it writes today.
--
-- Strictly non-destructive: every statement relaxes a constraint. No row is
-- updated, deleted or rewritten, and no RLS policy is weakened — the student
-- insert policy keeps every condition it has and only admits the new
-- NULL value alongside the positive range.
begin;

alter table public.exam_retake_requests
  drop constraint if exists exam_retake_requests_granted_attempts_check;

alter table public.exam_retake_requests
  add constraint exam_retake_requests_granted_attempts_check
  check (granted_attempts is null or granted_attempts between 1 and 20);

-- NULL must be storable for the unlimited mode; the DEFAULT 1 is retained so
-- a request that does not name a count still gets exactly one attempt.
alter table public.exam_retake_requests
  alter column granted_attempts drop not null;

alter table public.exam_retake_requests
  alter column granted_attempts set default 1;

-- A student-created request is always 'pending' with no decision and no
-- grant; the only change is that the (unused) granted_attempts slot may now
-- also be NULL. Every other condition of the original policy is preserved
-- verbatim, including the ownership check against the candidate's user.
drop policy if exists err_insert on public.exam_retake_requests;
create policy err_insert on public.exam_retake_requests for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      status = 'pending'
      and decided_by is null
      and decided_at is null
      and (granted_attempts is null or granted_attempts >= 1)
      and requested_by = auth.uid()
      and exists (
        select 1 from public.exam_candidates c
        join public.students s on s.id = c.student_id
        where c.id = candidate_id and s.user_id = auth.uid()
      )
    )
  );

comment on column public.exam_retake_requests.granted_attempts is
  'Number of NEW attempts this approval authorizes: 1..20 for Limited Attempts, NULL for Unlimited Attempts.';

commit;
