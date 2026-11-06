-- 0021 — Super Admin unrestricted operational access through RLS.
-- Additive migration: `public.is_super_admin()` reads the verified session
-- profile. It is added with OR to customer operational policies; ordinary
-- users still require their existing organization membership/role. Tenant
-- isolation and audit logging are preserved.

-- Organizations and billing / subscription administration.
drop policy if exists org_insert on public.organizations;
create policy org_insert on public.organizations for insert to authenticated
  with check (owner_id = auth.uid() or public.is_super_admin());

drop policy if exists pay_insert on public.payment_requests;
create policy pay_insert on public.payment_requests for insert to authenticated
  with check (public.can_manage_org(organization_id) or public.is_super_admin());

-- Exams, papers, question bank and quizzes.
drop policy if exists exam_select on public.exams;
create policy exam_select on public.exams for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());

drop policy if exists exam_write on public.exams;
create policy exam_write on public.exams for all to authenticated
  using (public.can_create_content(organization_id) or public.is_super_admin())
  with check (public.can_create_content(organization_id) or public.is_super_admin());

drop policy if exists q_select on public.questions;
create policy q_select on public.questions for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());

drop policy if exists q_write on public.questions;
create policy q_write on public.questions for all to authenticated
  using (public.can_create_content(organization_id) or public.is_super_admin())
  with check (public.can_create_content(organization_id) or public.is_super_admin());

drop policy if exists qc_all on public.question_categories;
create policy qc_all on public.question_categories for all to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin())
  with check (public.can_create_content(organization_id) or public.is_super_admin());

drop policy if exists qopt_all on public.question_options;
create policy qopt_all on public.question_options for all to authenticated
  using (exists (select 1 from public.questions q where q.id = question_id
    and (public.is_org_member(q.organization_id) or public.is_super_admin())))
  with check (exists (select 1 from public.questions q where q.id = question_id
    and (public.can_create_content(q.organization_id) or public.is_super_admin())));

drop policy if exists qq_all on public.quiz_questions;
create policy qq_all on public.quiz_questions for all to authenticated
  using (exists (select 1 from public.quizzes z where z.id = quiz_id
    and (public.is_org_member(z.organization_id) or public.is_super_admin())))
  with check (exists (select 1 from public.quizzes z where z.id = quiz_id
    and (public.can_create_content(z.organization_id) or public.is_super_admin())));

drop policy if exists quiz_select on public.quizzes;
create policy quiz_select on public.quizzes for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());

drop policy if exists quiz_write on public.quizzes;
create policy quiz_write on public.quizzes for all to authenticated
  using (public.can_create_content(organization_id) or public.is_super_admin())
  with check (public.can_create_content(organization_id) or public.is_super_admin());

-- Live quizzes, sessions, participant answers and answer state.
drop policy if exists ses_select on public.quiz_sessions;
create policy ses_select on public.quiz_sessions for select to authenticated
  using (public.is_super_admin() or host_id = auth.uid()
    or public.can_host_live_session(organization_id)
    or public.is_linked_live_participant(id));

drop policy if exists ses_write on public.quiz_sessions;
create policy ses_write on public.quiz_sessions for all to authenticated
  using (public.can_create_content(organization_id) or public.is_super_admin())
  with check (public.can_create_content(organization_id) or public.is_super_admin());

drop policy if exists sp_select on public.session_participants;
create policy sp_select on public.session_participants for select to authenticated
  using (public.is_super_admin() or user_id = auth.uid() or exists (
    select 1 from public.quiz_sessions s
    where s.id = session_id and (s.host_id = auth.uid()
      or public.can_host_live_session(s.organization_id))));

drop policy if exists sp_host_update on public.session_participants;
create policy sp_host_update on public.session_participants for update to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.quiz_sessions s
    where s.id = session_id and (s.host_id = auth.uid()
      or public.can_host_live_session(s.organization_id))))
  with check (public.is_super_admin() or exists (
    select 1 from public.quiz_sessions s
    where s.id = session_id and (s.host_id = auth.uid()
      or public.can_host_live_session(s.organization_id))));

drop policy if exists pa_select on public.participant_answers;
create policy pa_select on public.participant_answers for select to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.session_participants p
    where p.id = participant_id and p.user_id = auth.uid()) or exists (
    select 1 from public.quiz_sessions s
    where s.id = session_id and (s.host_id = auth.uid()
      or public.can_host_live_session(s.organization_id))));

-- Examination attempts, answers, marking and proctoring.
drop policy if exists ea_update on public.exam_attempts;
create policy ea_update on public.exam_attempts for update to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.exams e where e.id = exam_id
      and coalesce(public.org_role(e.organization_id) = any
        (array['owner','admin','teacher','corrector']::text[]), false)))
  with check (public.is_super_admin() or exists (
    select 1 from public.exams e where e.id = exam_id
      and coalesce(public.org_role(e.organization_id) = any
        (array['owner','admin','teacher','corrector']::text[]), false)));

drop policy if exists eans_update on public.exam_answers;
create policy eans_update on public.exam_answers for update to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.exam_attempts a join public.exams e on e.id = a.exam_id
    where a.id = attempt_id and coalesce(public.org_role(e.organization_id) = any
      (array['owner','admin','teacher','corrector']::text[]), false)))
  with check (public.is_super_admin() or exists (
    select 1 from public.exam_attempts a join public.exams e on e.id = a.exam_id
    where a.id = attempt_id and coalesce(public.org_role(e.organization_id) = any
      (array['owner','admin','teacher','corrector']::text[]), false)));

drop policy if exists pi_all on public.proctoring_incidents;
create policy pi_all on public.proctoring_incidents for all to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.exams e where e.id = exam_id
      and coalesce(public.org_role(e.organization_id) = any
        (array['owner','admin','teacher','supervisor','corrector']::text[]), false)))
  with check (public.is_super_admin() or exists (
    select 1 from public.exams e where e.id = exam_id
      and coalesce(public.org_role(e.organization_id) = any
        (array['owner','admin','teacher','supervisor','corrector']::text[]), false)));

drop policy if exists pr_select on public.proctoring_rooms;
create policy pr_select on public.proctoring_rooms for select to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.exams e where e.id = exam_id
      and public.is_org_member(e.organization_id)));

drop policy if exists pr_super_write on public.proctoring_rooms;
create policy pr_super_write on public.proctoring_rooms for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Plans / subscriptions / audit / organization policies already include
-- is_super_admin(); they are intentionally left unchanged.
