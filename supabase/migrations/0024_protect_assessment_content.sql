-- Protect assessment content from candidates and prevent member DELETEs.
-- Exam and live participant endpoints deliver sanitized content with a service
-- client after their own admission checks. Staff/markers retain read access;
-- only content creators and super admins may change bank/paper associations.
-- Split SELECT from ALL: a permissive ALL policy's USING also authorizes DELETE.

drop policy if exists q_select on public.questions;
create policy q_select on public.questions for select to authenticated
  using (public.is_super_admin() or coalesce(public.org_role(organization_id) in
    ('owner','admin','teacher','organizer','supervisor','corrector'), false));
-- q_write remains unchanged (creator/super admin).

drop policy if exists qopt_all on public.question_options;
create policy qopt_select_staff on public.question_options for select to authenticated
  using (exists (select 1 from public.questions q where q.id = question_id
    and (public.is_super_admin() or coalesce(public.org_role(q.organization_id) in
      ('owner','admin','teacher','organizer','supervisor','corrector'), false))));
create policy qopt_write_creators on public.question_options for all to authenticated
  using (exists (select 1 from public.questions q where q.id = question_id
    and (public.can_create_content(q.organization_id) or public.is_super_admin())))
  with check (exists (select 1 from public.questions q where q.id = question_id
    and (public.can_create_content(q.organization_id) or public.is_super_admin())));

drop policy if exists qq_all on public.quiz_questions;
create policy qq_select_staff on public.quiz_questions for select to authenticated
  using (exists (select 1 from public.quizzes z where z.id = quiz_id
    and (public.is_super_admin() or coalesce(public.org_role(z.organization_id) in
      ('owner','admin','teacher','organizer','supervisor','corrector'), false))));
create policy qq_write_creators on public.quiz_questions for all to authenticated
  using (exists (select 1 from public.quizzes z where z.id = quiz_id
    and (public.can_create_content(z.organization_id) or public.is_super_admin())))
  with check (exists (select 1 from public.quizzes z where z.id = quiz_id
    and (public.can_create_content(z.organization_id) or public.is_super_admin())));

drop policy if exists qc_all on public.question_categories;
create policy qc_select_members on public.question_categories for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
create policy qc_write_creators on public.question_categories for all to authenticated
  using (public.can_create_content(organization_id) or public.is_super_admin())
  with check (public.can_create_content(organization_id) or public.is_super_admin());
