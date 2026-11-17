-- EVALORA performance: RLS evaluation cost + workspace overview aggregation.
--
-- WHY
-- 1. Every hot table carried a `FOR ALL` write policy whose USING expression
--    also applied to SELECT. Postgres ORs SELECT policies together, so a
--    question-bank count evaluated `can_create_content()` -> `org_role()` ->
--    `is_super_admin()` + a membership lookup once per row. On the production
--    dataset (2 340 questions) `select count(*) from questions where
--    organization_id = …` measured 1 313 ms as an ordinary member.
-- 2. SELECT policies called row-varying `org_role(organization_id)`, which is
--    evaluated per row even though the caller's memberships are constant for
--    the statement.
-- 3. The workspace dashboard issued 9 REST round-trips (5 exact counts,
--    2 recent lists, organisation row, entitlement) to paint one screen.
--
-- WHAT
-- * Split each `FOR ALL` content policy into INSERT / UPDATE / DELETE so write
--   checks never run while reading. Predicates are unchanged.
-- * Rewrite SELECT policies to use set-returning, statement-stable membership
--   helpers (`staff_org_ids()`, `member_org_ids()`) so the membership lookup is
--   executed once (hashed SubPlan) instead of once per row. Role sets, active
--   status requirements and super-admin bypass are identical to `org_role()`.
-- * Add `workspace_overview(uuid)`: SECURITY DEFINER, explicit membership gate,
--   every aggregate constrained to the requested organisation, returns the
--   dashboard payload in one JSON document.
-- * Add two foreign-key indexes used by report/question joins and one covering
--   index for the question-bank ordering.
--
-- SECURITY NOTES
-- * RLS is not disabled or narrowed: every rewritten predicate grants exactly
--   the roles the previous predicate granted. The helpers are SECURITY DEFINER
--   but only ever return organisations for `auth.uid()`.
-- * `workspace_overview` refuses callers with no active membership (and
--   non-super-admins). It cannot be used to read another tenant: `p_org` is
--   validated against the caller's own memberships, and every subquery filters
--   on `p_org`.
-- * No table is dropped, truncated or rewritten; no data changes.

create or replace function public.staff_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select m.organization_id
  from public.organization_members m
  join public.profiles p
    on p.id = m.user_id
   and p.status = 'active'
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and m.role in ('owner', 'admin', 'teacher', 'organizer', 'supervisor', 'corrector');
$function$;

create or replace function public.member_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select m.organization_id
  from public.organization_members m
  join public.profiles p
    on p.id = m.user_id
   and p.status = 'active'
  where m.user_id = (select auth.uid())
    and m.status = 'active';
$function$;

revoke all on function public.staff_org_ids() from public, anon;
revoke all on function public.member_org_ids() from public, anon;
grant execute on function public.staff_org_ids() to authenticated;
grant execute on function public.member_org_ids() to authenticated;

-- ── questions ────────────────────────────────────────────────────────────────
drop policy if exists q_select on public.questions;
create policy q_select on public.questions
  for select to authenticated
  using (
    (select public.is_super_admin())
    or organization_id in (select public.staff_org_ids())
  );

drop policy if exists q_write on public.questions;
drop policy if exists q_insert on public.questions;
drop policy if exists q_update on public.questions;
drop policy if exists q_delete on public.questions;
create policy q_insert on public.questions
  for insert to authenticated
  with check (public.can_create_content(organization_id) or public.is_super_admin());
create policy q_update on public.questions
  for update to authenticated
  using (public.can_create_content(organization_id) or public.is_super_admin())
  with check (public.can_create_content(organization_id) or public.is_super_admin());
create policy q_delete on public.questions
  for delete to authenticated
  using (public.can_create_content(organization_id) or public.is_super_admin());

-- ── question_options ────────────────────────────────────────────────────────
drop policy if exists qopt_select_staff on public.question_options;
create policy qopt_select_staff on public.question_options
  for select to authenticated
  using (
    (select public.is_super_admin())
    or exists (
      select 1 from public.questions q
      where q.id = question_options.question_id
        and q.organization_id in (select public.staff_org_ids())
    )
  );

drop policy if exists qopt_write_creators on public.question_options;
drop policy if exists qopt_insert on public.question_options;
drop policy if exists qopt_update on public.question_options;
drop policy if exists qopt_delete on public.question_options;
create policy qopt_insert on public.question_options
  for insert to authenticated
  with check (
    exists (
      select 1 from public.questions q
      where q.id = question_options.question_id
        and (public.can_create_content(q.organization_id) or public.is_super_admin())
    )
  );
create policy qopt_update on public.question_options
  for update to authenticated
  using (
    exists (
      select 1 from public.questions q
      where q.id = question_options.question_id
        and (public.can_create_content(q.organization_id) or public.is_super_admin())
    )
  )
  with check (
    exists (
      select 1 from public.questions q
      where q.id = question_options.question_id
        and (public.can_create_content(q.organization_id) or public.is_super_admin())
    )
  );
create policy qopt_delete on public.question_options
  for delete to authenticated
  using (
    exists (
      select 1 from public.questions q
      where q.id = question_options.question_id
        and (public.can_create_content(q.organization_id) or public.is_super_admin())
    )
  );

-- ── quizzes ──────────────────────────────────────────────────────────────────
drop policy if exists quiz_select on public.quizzes;
create policy quiz_select on public.quizzes
  for select to authenticated
  using (
    (select public.is_super_admin())
    or organization_id in (select public.member_org_ids())
  );

drop policy if exists quiz_write on public.quizzes;
drop policy if exists quiz_insert on public.quizzes;
drop policy if exists quiz_update on public.quizzes;
drop policy if exists quiz_delete on public.quizzes;
create policy quiz_insert on public.quizzes
  for insert to authenticated
  with check (public.can_create_content(organization_id) or public.is_super_admin());
create policy quiz_update on public.quizzes
  for update to authenticated
  using (public.can_create_content(organization_id) or public.is_super_admin())
  with check (public.can_create_content(organization_id) or public.is_super_admin());
create policy quiz_delete on public.quizzes
  for delete to authenticated
  using (public.can_create_content(organization_id) or public.is_super_admin());

-- ── quiz_questions ───────────────────────────────────────────────────────────
drop policy if exists qq_select_staff on public.quiz_questions;
create policy qq_select_staff on public.quiz_questions
  for select to authenticated
  using (
    (select public.is_super_admin())
    or exists (
      select 1 from public.quizzes z
      where z.id = quiz_questions.quiz_id
        and z.organization_id in (select public.staff_org_ids())
    )
  );

drop policy if exists qq_write_creators on public.quiz_questions;
drop policy if exists qq_insert on public.quiz_questions;
drop policy if exists qq_update on public.quiz_questions;
drop policy if exists qq_delete on public.quiz_questions;
create policy qq_insert on public.quiz_questions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.quizzes z
      where z.id = quiz_questions.quiz_id
        and (public.can_create_content(z.organization_id) or public.is_super_admin())
    )
  );
create policy qq_update on public.quiz_questions
  for update to authenticated
  using (
    exists (
      select 1 from public.quizzes z
      where z.id = quiz_questions.quiz_id
        and (public.can_create_content(z.organization_id) or public.is_super_admin())
    )
  )
  with check (
    exists (
      select 1 from public.quizzes z
      where z.id = quiz_questions.quiz_id
        and (public.can_create_content(z.organization_id) or public.is_super_admin())
    )
  );
create policy qq_delete on public.quiz_questions
  for delete to authenticated
  using (
    exists (
      select 1 from public.quizzes z
      where z.id = quiz_questions.quiz_id
        and (public.can_create_content(z.organization_id) or public.is_super_admin())
    )
  );

-- ── exams ────────────────────────────────────────────────────────────────────
drop policy if exists exam_select on public.exams;
create policy exam_select on public.exams
  for select to authenticated
  using (
    (select public.is_super_admin())
    or organization_id in (select public.staff_org_ids())
  );

drop policy if exists exam_write on public.exams;
drop policy if exists exam_insert on public.exams;
drop policy if exists exam_update on public.exams;
drop policy if exists exam_delete on public.exams;
create policy exam_insert on public.exams
  for insert to authenticated
  with check (public.can_create_content(organization_id) or public.is_super_admin());
create policy exam_update on public.exams
  for update to authenticated
  using (public.can_create_content(organization_id) or public.is_super_admin())
  with check (public.can_create_content(organization_id) or public.is_super_admin());
create policy exam_delete on public.exams
  for delete to authenticated
  using (public.can_create_content(organization_id) or public.is_super_admin());

-- ── exam_candidates ──────────────────────────────────────────────────────────
drop policy if exists ec_select on public.exam_candidates;
create policy ec_select on public.exam_candidates
  for select to authenticated
  using (
    (select public.is_super_admin())
    or exists (
      select 1 from public.exams e
      where e.id = exam_candidates.exam_id
        and e.organization_id in (select public.staff_org_ids())
    )
  );

drop policy if exists ec_write on public.exam_candidates;
drop policy if exists ec_insert on public.exam_candidates;
drop policy if exists ec_update on public.exam_candidates;
drop policy if exists ec_delete on public.exam_candidates;
create policy ec_insert on public.exam_candidates
  for insert to authenticated
  with check (
    exists (
      select 1 from public.exams e
      where e.id = exam_candidates.exam_id
        and (public.can_create_content(e.organization_id) or public.is_super_admin())
    )
  );
create policy ec_update on public.exam_candidates
  for update to authenticated
  using (
    exists (
      select 1 from public.exams e
      where e.id = exam_candidates.exam_id
        and (public.can_create_content(e.organization_id) or public.is_super_admin())
    )
  )
  with check (
    exists (
      select 1 from public.exams e
      where e.id = exam_candidates.exam_id
        and (public.can_create_content(e.organization_id) or public.is_super_admin())
    )
  );
create policy ec_delete on public.exam_candidates
  for delete to authenticated
  using (
    exists (
      select 1 from public.exams e
      where e.id = exam_candidates.exam_id
        and (public.can_create_content(e.organization_id) or public.is_super_admin())
    )
  );

-- ── exam_attempts / exam_answers (SELECT policies only) ─────────────────────
drop policy if exists ea_select on public.exam_attempts;
create policy ea_select on public.exam_attempts
  for select to authenticated
  using (
    (select public.is_super_admin())
    or exists (
      select 1 from public.exams e
      where e.id = exam_attempts.exam_id
        and e.organization_id in (select public.staff_org_ids())
    )
  );

drop policy if exists eans_select on public.exam_answers;
create policy eans_select on public.exam_answers
  for select to authenticated
  using (
    (select public.is_super_admin())
    or exists (
      select 1
      from public.exam_attempts a
      join public.exams e on e.id = a.exam_id
      where a.id = exam_answers.attempt_id
        and e.organization_id in (select public.staff_org_ids())
    )
  );

-- ── quiz_sessions ────────────────────────────────────────────────────────────
drop policy if exists ses_select on public.quiz_sessions;
create policy ses_select on public.quiz_sessions
  for select to authenticated
  using (
    (select public.is_super_admin())
    or host_id = (select auth.uid())
    or public.can_host_live_session(organization_id)
    or public.is_linked_live_participant(id)
  );

drop policy if exists ses_write on public.quiz_sessions;
drop policy if exists ses_insert on public.quiz_sessions;
drop policy if exists ses_update on public.quiz_sessions;
drop policy if exists ses_delete on public.quiz_sessions;
create policy ses_insert on public.quiz_sessions
  for insert to authenticated
  with check (public.can_create_content(organization_id) or public.is_super_admin());
create policy ses_update on public.quiz_sessions
  for update to authenticated
  using (public.can_create_content(organization_id) or public.is_super_admin())
  with check (public.can_create_content(organization_id) or public.is_super_admin());
create policy ses_delete on public.quiz_sessions
  for delete to authenticated
  using (public.can_create_content(organization_id) or public.is_super_admin());

-- ── workspace overview (single round-trip dashboard payload) ────────────────
create or replace function public.workspace_overview(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_role := public.org_role(p_org);
  if v_role is null and not public.is_super_admin() then
    raise exception 'not a member of this workspace' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'counts', jsonb_build_object(
      'quizzes', (select count(*) from public.quizzes q where q.organization_id = p_org),
      'questions', (select count(*) from public.questions q where q.organization_id = p_org),
      'exams', (select count(*) from public.exams e where e.organization_id = p_org),
      'members', (select count(*) from public.organization_members m where m.organization_id = p_org),
      'sessions', (select count(*) from public.quiz_sessions s
                    where s.organization_id = p_org and s.status in ('lobby', 'live'))
    ),
    'recentSessions', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
      from (
        select s.id, s.title, s.join_code, s.created_at, s.status,
               (select to_jsonb(z) from (select qz.title) z) as quizzes
        from public.quiz_sessions s
        left join public.quizzes qz on qz.id = s.quiz_id
        where s.organization_id = p_org
        order by s.created_at desc
        limit 5
      ) x
    ),
    'recentExams', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
      from (
        select e.id, e.title, e.duration_minutes, e.access_code, e.status, e.created_at
        from public.exams e
        where e.organization_id = p_org
        order by e.created_at desc
        limit 5
      ) x
    ),
    'platform', (
      select jsonb_build_object(
        'slug', o.slug,
        'name', o.name,
        'status', o.status,
        'portal_enabled', o.portal_enabled,
        'custom_domain', o.custom_domain,
        'platform_domain_status', o.platform_domain_status
      )
      from public.organizations o
      where o.id = p_org
    )
  );
end;
$function$;

revoke all on function public.workspace_overview(uuid) from public, anon;
grant execute on function public.workspace_overview(uuid) to authenticated;

-- ── indexes ──────────────────────────────────────────────────────────────────
create index if not exists questions_org_created_idx
  on public.questions (organization_id, created_at desc);
create index if not exists idx_qq_question
  on public.quiz_questions (question_id);
create index if not exists idx_eans_quiz_question
  on public.exam_answers (quiz_question_id);
