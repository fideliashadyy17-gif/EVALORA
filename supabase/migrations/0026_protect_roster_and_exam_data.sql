-- A tenant membership alone must not expose every student's personal record
-- or examination access details. Keep self records and staff workflows.
-- Candidate exam delivery is mediated by the service-role API.
drop policy if exists stu_select on public.students;
create policy stu_select on public.students for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin() or
    coalesce(public.org_role(organization_id) in
      ('owner','admin','teacher','organizer','supervisor','corrector'),false));
-- stu_write remains restricted to content creators and Super Admin.

drop policy if exists enr_select on public.student_enrollments;
create policy enr_select on public.student_enrollments for select to authenticated
  using (public.is_super_admin() or
    coalesce(public.org_role(organization_id) in
      ('owner','admin','teacher','organizer','supervisor','corrector'),false)
    or exists (select 1 from public.students s where s.id = student_id
      and s.organization_id = student_enrollments.organization_id and s.user_id = auth.uid()));
-- enr_write remains restricted to content creators and Super Admin.

drop policy if exists exam_select on public.exams;
create policy exam_select on public.exams for select to authenticated
  using (public.is_super_admin() or coalesce(public.org_role(organization_id) in
    ('owner','admin','teacher','organizer','supervisor','corrector'),false));
-- exam_write remains restricted to content creators and Super Admin.
