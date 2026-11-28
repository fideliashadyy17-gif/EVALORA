-- Marks and results belong to a subject too.
--
-- WHAT WAS STILL OPEN
--
-- 20261128170000 scoped the CONTENT policies — questions and examinations — and
-- 20261128190000 gave every examination a subject so those policies had something
-- to bind to. The brief, however, does not stop at content. It names grading and
-- results explicitly, and requires SELECT, INSERT, UPDATE and DELETE to be
-- reviewed rather than only UPDATE.
--
-- Measured in production after both migrations, the marking tables were still
-- answering with the organization-wide role alone:
--
--   exam_answers.eans_update       is_super_admin() OR org_role(...) IN (...)
--   exam_attempts.ea_update        is_super_admin() OR org_role(...) IN (...)
--   answer_rubric_scores.ars_all   same shape (ALL: read, write and delete)
--
-- `org_role` is the SAME predicate whose inadequacy for content started this
-- work: it takes an organization and asks nothing about subject, class or
-- assignment. A Mathematics teacher in Demo Academy could therefore rewrite the
-- awarded marks of a Literature examination in the same school, and delete a
-- rubric score, with nothing but their "teacher" role to authorise it.
--
-- WHAT CHANGES
--
-- `can_author_exam_result(org, exam)` — a new predicate, because these rows reach
-- their subject through `exams`, not directly:
--
--   * leadership (owner/admin/organizer) keeps the existing authority;
--   * `corrector` keeps it (a marker is appointed to mark, and the brief's
--     subject-assignment model is about teachers, not about a school's marking
--     staff);
--   * a `teacher` needs a `subject_teacher` assignment for that examination's
--     subject;
--   * the existing grandfathering is preserved exactly: a teacher with NO
--     assignments at all is unrestricted, and an examination with no resolvable
--     subject is unrestricted. Without those, this migration would lock every
--     current school out of its own marking on deploy — there are 52 examinations
--     in production and, until an administrator records responsibilities, every
--     teacher is in the grandfather branch.
--
-- WHAT DOES NOT CHANGE, AND WHY THAT IS SAFE
--
-- The candidate write path is untouched. `src/app/api/exam/save/route.ts` writes
-- answers and points through the SERVICE-ROLE client, so RLS is not evaluated
-- for it at all; tightening these policies cannot break an in-progress attempt.
-- That is verified by reading the route, not assumed: `createAdminClient()` is
-- called at the top of the handler.
--
-- The `entitlement_*` and `access_founder_*` policies are left alone. They are
-- additive ALL policies — Postgres ORs permissive policies together, so a second
-- permissive policy can only widen access. The writing that matters is done by
-- the browser session, and it is those policies (`eans_update`, `ea_update`,
-- `ars_all`) that are narrowed here; the entitlement policy keeps a school's
-- plan from being the thing that grants a teacher another subject's marks.
--
-- Every policy keeps its USING and WITH CHECK pair. USING alone would let a
-- caller take marks they may edit and MOVE them to another examination's attempt
-- — the old row passes, the new one is never examined.

/* ── the predicate ─────────────────────────────────────────────────────── */

create or replace function public.can_author_exam_result(p_org uuid, p_exam uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select case
    -- No examination named: nothing to scope by, and the caller is already past
    -- the row-level tenant check in the policy.
    when p_exam is null then true
    -- An examination that is not in this organization is REFUSED, before the
    -- grandfathering branch below. Measured: an earlier version of this function
    -- answered TRUE for a real Demo Academy examination asked about under Oak's
    -- organization id, because the "no resolvable subject" arm matched the
    -- absence of a matching row rather than a matching row with no subject.
    -- The policy always passes a consistent pair, so that call was not reachable
    -- through it — but a predicate that answers "allowed" to a question about
    -- another tenant is a landmine, not a shortcut.
    when not exists (
      select 1
        from public.exams e
       where e.id = p_exam
         and e.organization_id = p_org
    ) then false
    -- Leadership and the school's appointed markers keep their existing reach.
    when exists (
      select 1
        from public.organization_members m
       where m.user_id = (select auth.uid())
         and m.organization_id = p_org
         and m.status = 'active'
         and m.role in ('owner', 'admin', 'organizer', 'corrector')
    ) then true
    -- An examination IN THIS ORGANIZATION whose subject cannot be resolved stays
    -- unrestricted, the same grandfathered branch the content policies use.
    when not exists (
      select 1
        from public.exams e
        join public.subjects s on s.id = e.subject_id
       where e.id = p_exam
         and e.organization_id = p_org
    ) then true
    -- A teacher with no assignments at all is unrestricted, until an
    -- administrator records responsibilities.
    when not exists (
      select 1
        from public.teaching_assignments ta
       where ta.teacher_id = (select auth.uid())
         and ta.organization_id = p_org
         and ta.role = 'subject_teacher'
    ) then true
    -- Otherwise: exactly the subject this examination examines.
    else exists (
      select 1
        from public.exams e
        join public.teaching_assignments ta
          on ta.subject_id = e.subject_id
         and ta.organization_id = e.organization_id
         and ta.role = 'subject_teacher'
       where e.id = p_exam
         and e.organization_id = p_org
         and ta.teacher_id = (select auth.uid())
    )
  end;
$$;

comment on function public.can_author_exam_result(uuid, uuid) is
  'May the caller write marks for this examination? Leadership and appointed correctors keep their reach; a teacher needs a subject assignment for the examination''s subject. A teacher with no assignments, or an examination with no subject, is unrestricted — the same grandfathering the content policies use.';

revoke all on function public.can_author_exam_result(uuid, uuid) from public;
grant execute on function public.can_author_exam_result(uuid, uuid) to authenticated, service_role;

/* ── exam_answers: the awarded marks ───────────────────────────────────── */

drop policy if exists eans_update on public.exam_answers;
create policy eans_update on public.exam_answers
  for update to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1
        from public.exam_attempts a
        join public.exams e on e.id = a.exam_id
       where a.id = exam_answers.attempt_id
         and public.can_author_exam_result(e.organization_id, e.id)
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1
        from public.exam_attempts a
        join public.exams e on e.id = a.exam_id
       where a.id = exam_answers.attempt_id
         and public.can_author_exam_result(e.organization_id, e.id)
    )
  );

/* ── exam_answers: INSERT was already wide open ────────────────────────── */
--
-- There was no INSERT policy on `exam_answers` at all outside the entitlement
-- and founder policies. The entitlement policy is permissive and ALL, so an
-- insert was governed by the school's plan rather than by the caller's role or
-- subject. Adding a policy here would OR with it and widen nothing, so it is
-- deliberately NOT added: the honest statement is that answer rows are written
-- by the candidate route on the service role, and a browser session that could
-- insert one is governed by the entitlement policy exactly as before.
--
-- This comment exists so the omission is a decision on the record instead of a
-- gap someone rediscovers.

/* ── exam_attempts: the total score ────────────────────────────────────── */

drop policy if exists ea_update on public.exam_attempts;
create policy ea_update on public.exam_attempts
  for update to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1
        from public.exams e
       where e.id = exam_attempts.exam_id
         and public.can_author_exam_result(e.organization_id, e.id)
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1
        from public.exams e
       where e.id = exam_attempts.exam_id
         and public.can_author_exam_result(e.organization_id, e.id)
    )
  );

/* ── answer_rubric_scores: criterion marks, including DELETE ───────────── */
--
-- `ars_all` is an ALL policy, so narrowing it narrows SELECT, INSERT, UPDATE and
-- DELETE together. That is intended: a teacher should not be able to READ
-- another subject's rubric scores by listing them, and should certainly not be
-- able to delete one. Leadership and correctors are unaffected.

drop policy if exists ars_all on public.answer_rubric_scores;
create policy ars_all on public.answer_rubric_scores
  for all to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1
        from public.exam_attempts a
        join public.exams e on e.id = a.exam_id
       where a.id = answer_rubric_scores.attempt_id
         and public.can_author_exam_result(e.organization_id, e.id)
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1
        from public.exam_attempts a
        join public.exams e on e.id = a.exam_id
       where a.id = answer_rubric_scores.attempt_id
         and public.can_author_exam_result(e.organization_id, e.id)
    )
  );

/* ── assessment_contribution_scores: reviewed, deliberately unchanged ───── */
--
-- Measured before writing anything: this table has exactly one policy in
-- production, `acs_staff_select`, and it is SELECT-only. There is no INSERT,
-- UPDATE or DELETE policy, which with RLS enabled means a browser session cannot
-- write these rows at all — they are written by the consolidation service on the
-- service role, where policies do not apply.
--
-- Inventing a write policy here would GRANT an ability that does not currently
-- exist, in the name of tightening one. The table also has no `subject_id`; it
-- reaches its subject through the attempt. So it is left exactly as it is, and
-- the omission is recorded rather than silently "fixed".
--
-- The read path is already tenant-scoped by `acs_staff_select`, and narrowing it
-- by subject would break the class-wide gradebook, which legitimately shows a
-- homeroom teacher contributions from subjects they do not teach. Writing those
-- rows remains impossible from a session, which is the property that matters.
